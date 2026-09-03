// Package canon — document canonique d'un article (fondation de l'ancrage).
//
// Le HTML n'est qu'un format d'import. Ce package produit le « document
// canonique » : blocs typographiques (p, h1–h4, blockquote, code, listes,
// img, hr) + un TEXTE CANONIQUE plat, blancs réduits à un espace simple
// (entités décodées comme un navigateur), sur lequel toutes les ancres de
// surlignage sont exprimées en OFFSETS de code points (scalaires Unicode).
//
// Pourquoi plat : un passage qui traverse plusieurs paragraphes doit être
// ancrable par un seul intervalle [start, end) — le séparateur entre segments
// est un espace unique dans le texte canonique. Les clients (web, mobile
// natif, API créateur) peignent des plages au lieu de chercher du texte.
//
// Le moteur web/mobile actuel (html-blocks-core.ts, quote-anchor.ts) reste un
// fallback transitoire : la référence devient ce package (vrai parseur,
// décodage d'entités complet), et html-blocks-core sera aligné dessus via un
// corpus de parité partagé.
package canon

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"unicode"
	"unicode/utf8"

	"golang.org/x/net/html"
)

// Kind décrit la nature typographique d'un bloc.
type Kind string

const (
	KindParagraph Kind = "p"
	KindHeading1  Kind = "h1"
	KindHeading2  Kind = "h2"
	KindHeading3  Kind = "h3"
	KindHeading4  Kind = "h4"
	KindQuote     Kind = "blockquote"
	KindCode      Kind = "code"
	KindList      Kind = "list"
	KindImage     Kind = "img"
	KindRule      Kind = "hr"
)

// Span est une plage [Start, End) de code points dans le texte NORMALISÉ d'un
// bloc — utilisée pour les annotations officielles du studio, qui arrivent
// aujourd'hui sous forme de <mark data-annotation-note="…"> dans le HTML.
type Span struct {
	Start int    `json:"start"`
	End   int    `json:"end"`
	Note  string `json:"note,omitempty"`
}

// Block est un bloc typographique du document canonique.
type Block struct {
	Kind    Kind     `json:"kind"`
	Text    string   `json:"text,omitempty"`  // blocs texte
	Items   []string `json:"items,omitempty"` // KindList : contenu des <li>
	Ordered bool     `json:"ordered,omitempty"`
	Src     string   `json:"src,omitempty"` // KindImage
	Alt     string   `json:"alt,omitempty"` // KindImage
	Spans   []Span   `json:"spans,omitempty"`
}

// Segment est un flux de texte mesurable : un bloc texte (p/h/quote/code) ou
// un item de liste. Start/End sont des offsets de code points dans Text.
type Segment struct {
	BlockIdx int    `json:"blockIdx"`
	ItemIdx  int    `json:"itemIdx"` // 0 hors liste ; index du <li> sinon
	Text     string `json:"text"`
	Start    int    `json:"start"`
	End      int    `json:"end"`
}

// Document est le produit de la canonicalisation.
type Document struct {
	Blocks   []Block   `json:"blocks"`
	Segments []Segment `json:"segments"`
	// Text = concaténation des segments séparés par UN espace, entités
	// décodées, blancs réduits. Les ancres s'expriment en code points ici.
	Text string `json:"text"`
	// Sha = empreinte hexadécimale du texte canonique (détection d'édition).
	Sha string `json:"sha"`
}

// Parse canonicalise un fragment HTML d'article. Ne lève jamais : un HTML
// malformé est toléré (tokenizer navigateur).
func Parse(articleHTML string) *Document {
	p := &parser{}
	p.parse(articleHTML)
	p.flushAll()
	return p.document()
}

// Normalize réduit les blancs à un espace simple et trim — la même règle que
// le texte canonique. Un passage cité est normalisé AVANT recherche.
func Normalize(s string) string {
	var b strings.Builder
	prevSpace := true
	for _, r := range s {
		if unicode.IsSpace(r) {
			if prevSpace {
				continue
			}
			prevSpace = true
			b.WriteByte(' ')
			continue
		}
		prevSpace = false
		b.WriteRune(r)
	}
	return strings.TrimSpace(b.String())
}

// RuneLen retourne le nombre de code points (scalaires Unicode) de s.
func RuneLen(s string) int { return utf8.RuneCountInString(s) }

// Find localise l'occurrence n° ordinal (0-based) de target dans le texte
// canonique. Retourne (start, end) en code points ; ok=false si introuvable.
// Repli sur la première occurrence si l'ordinal dépasse le nombre trouvé.
//
// Repli tolérant (type Hypothesis) quand la correspondance exacte échoue :
//  1. ellipses de bord retirées (« … », « ... ») — citations tronquées ;
//  2. préfixes de mots de plus en plus courts — contenu remanié.
//
// Les offsets retournés sont ceux de la variante effectivement trouvée.
func (d *Document) Find(target string, ordinal int) (start, end int, ok bool) {
	needle := Normalize(target)
	if needle == "" {
		return 0, 0, false
	}
	wanted := ordinal
	if wanted < 0 {
		wanted = 0
	}
	textR := []rune(d.Text)
	for _, cand := range findCandidates(needle) {
		needleR := []rune(cand)
		if len(needleR) == 0 || len(textR) < len(needleR) {
			continue
		}
		if s, e, found := searchOrdinal(textR, needleR, wanted); found {
			return s, e, true
		}
	}
	return 0, 0, false
}

// searchOrdinal retourne l'occurrence n° wanted (0-based) de needleR dans
// textR, ou la première si wanted dépasse le nombre trouvé. Pas de
// chevauchement entre occurrences (comme indexOf).
func searchOrdinal(textR, needleR []rune, wanted int) (int, int, bool) {
	first := -1
	seen := 0
	for i := 0; i+len(needleR) <= len(textR); i++ {
		match := true
		for j := range needleR {
			if textR[i+j] != needleR[j] {
				match = false
				break
			}
		}
		if !match {
			continue
		}
		if first < 0 {
			first = i
		}
		if seen == wanted {
			return i, i + len(needleR), true
		}
		seen++
		i += len(needleR) - 1
	}
	if first >= 0 {
		return first, first + len(needleR), true
	}
	return 0, 0, false
}

// findCandidates construit les variantes tolérantes d'une citation, de la
// plus exacte à la plus courte :
//  1. le texte normalisé tel quel ;
//  2. sans les ellipses de bord (« … », « ... ») ;
//  3. préfixes de mots de plus en plus courts (repli « contenu remanié »).
func findCandidates(needle string) []string {
	out := []string{needle}
	// Seules les ellipses de bord sont retirées (« … » et « ... ») — JAMAIS
	// la ponctuation finale de phrase (« . » reste une ponctuation légitime).
	trimmed := strings.Trim(needle, "…")
	if strings.HasPrefix(trimmed, "...") {
		trimmed = strings.TrimPrefix(trimmed, "...")
	}
	if strings.HasSuffix(trimmed, "...") {
		trimmed = strings.TrimSuffix(trimmed, "...")
	}
	trimmed = strings.TrimSpace(trimmed)
	if trimmed != needle && trimmed != "" {
		out = append(out, trimmed)
	}
	words := strings.Fields(trimmed)
	for k := len(words) - 1; k >= 1; k-- {
		out = append(out, strings.Join(words[:k], " "))
	}
	return out
}

// CountBefore compte les occurrences de target (normalisée) dans le texte
// canonique dont la FIN précède strictement l'offset canonique `before` (en
// code points). Sert à calculer l'ordinal d'un passage repéré par une marque
// (ex. mark officiel du studio) : combien de fois ce passage apparaît AVANT.
func (d *Document) CountBefore(target string, before int) int {
	needle := Normalize(target)
	if needle == "" || before <= 0 {
		return 0
	}
	textR := []rune(d.Text)
	needleR := []rune(needle)
	if len(needleR) == 0 || len(textR) < len(needleR) {
		return 0
	}
	count := 0
	for i := 0; i+len(needleR) <= len(textR); i++ {
		match := true
		for j := range needleR {
			if textR[i+j] != needleR[j] {
				match = false
				break
			}
		}
		if !match {
			continue
		}
		if i+len(needleR) <= before {
			count++
		}
		i += len(needleR) - 1
	}
	return count
}

// ---------------------------------------------------------------------
// Parser — modèle séquentiel (le HTML d'article est une suite de blocs).
// ---------------------------------------------------------------------

type itemTmp struct {
	text  string
	spans []Span
}

type parser struct {
	cur     *writer // segment en cours (paragraphe, titre, item…)
	curKind Kind
	isItem  bool // le segment en cours est un <li>
	inList  bool // dans une <ul>/<ol>
	ordered bool // la liste courante est ordonnée
	items   []itemTmp
	blocks  []Block
	segs    []Segment
}

func (p *parser) parse(src string) {
	z := html.NewTokenizer(strings.NewReader(src))
	for {
		tt := z.Next()
		switch tt {
		case html.ErrorToken:
			return
		case html.TextToken:
			p.writeText(string(z.Text()))
		case html.StartTagToken:
			name, attrs := readTag(z)
			switch name {
			case "p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre":
				p.startTextKind(blockKind(name))
			case "ul", "ol":
				p.openList(name == "ol")
			case "li":
				p.openItem()
			case "br":
				p.writeText("\n")
			case "img":
				p.leafImage(attrs["src"], attrs["alt"])
			case "hr":
				p.leafRule()
			case "mark":
				if p.cur != nil && attrs["data-annotation-note"] != "" {
					p.cur.openMark(attrs["data-annotation-note"])
				}
			}
			// inline (b, i, a, …) ou inconnue : le texte continue de couler ;
			// on ne rend jamais de HTML brut.
		case html.EndTagToken:
			name, _ := readTag(z)
			switch name {
			case "p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre":
				p.endTextKind(blockKind(name))
			case "li":
				p.endItem()
			case "ul", "ol":
				p.closeList()
			case "mark":
				if p.cur != nil {
					p.cur.closeMark()
				}
			}
		}
	}
}

// readTag lit le nom et TOUS les attributs du tag courant (le dernier
// attribut a more=false : on l'ajoute avant de s'arrêter).
func readTag(z *html.Tokenizer) (string, map[string]string) {
	tn, _ := z.TagName()
	name := string(tn)
	attrs := map[string]string{}
	for {
		k, v, more := z.TagAttr()
		if len(k) == 0 {
			break // aucun attribut restant
		}
		if _, seen := attrs[string(k)]; !seen {
			attrs[string(k)] = string(v)
		}
		if !more {
			break // dernier attribut traité
		}
	}
	return name, attrs
}

func blockKind(name string) Kind {
	switch name {
	case "div":
		return KindParagraph
	case "h1":
		return KindHeading1
	case "h2":
		return KindHeading2
	case "h3":
		return KindHeading3
	case "h4", "h5", "h6":
		return KindHeading4 // niveau plafonné à h4 (contrat mobile actuel)
	case "blockquote":
		return KindQuote
	case "pre":
		return KindCode
	default:
		return KindParagraph
	}
}

// writeText écrit dans le segment courant ; crée un paragraphe implicite si
// aucun segment n'est ouvert.
func (p *parser) writeText(s string) {
	if p.cur == nil {
		if p.inList {
			return // texte hors <li> dans une liste : ignoré
		}
		p.cur = newWriter()
		p.curKind = KindParagraph
	}
	p.cur.write(s)
}

func (p *parser) startTextKind(k Kind) {
	// <p> à l'intérieur d'un blockquote/code/<li> appartient au segment parent
	// (le conteneur, pas un nouveau paragraphe).
	if p.cur != nil && k == KindParagraph {
		if p.isItem || p.curKind == KindQuote || p.curKind == KindCode {
			return
		}
	}
	p.flushCur()
	if p.inList && k != KindParagraph {
		p.closeList()
	}
	p.cur = newWriter()
	p.curKind = k
}

func (p *parser) endTextKind(k Kind) {
	if p.cur == nil {
		return
	}
	if p.curKind == k && !p.isItem {
		p.flushCur()
		return
	}
	if p.curKind != k && p.cur.empty() {
		// fermeture sans contenu (ex. </p> après un bloc déjà finalisé) :
		// on jette le segment vide.
		if !(p.curKind == KindQuote || p.curKind == KindCode) {
			p.cur = nil
		}
		return
	}
	// Fermetures imbriquées (ex. </p> à l'intérieur d'un blockquote) : le
	// contenu appartient au segment parent ; on attend la fermeture du parent.
}

func (p *parser) openList(ordered bool) {
	p.flushCur()
	if p.inList {
		p.closeList()
	}
	p.inList = true
	p.ordered = ordered
}

func (p *parser) openItem() {
	p.flushCur()
	p.cur = newWriter()
	p.isItem = true
}

func (p *parser) endItem() {
	if p.cur == nil || !p.isItem {
		return
	}
	p.items = append(p.items, itemTmp{text: p.cur.text(), spans: p.cur.spans()})
	p.cur = nil
	p.isItem = false
}

func (p *parser) closeList() {
	if !p.inList {
		return
	}
	if p.isItem {
		p.endItem()
	} else if p.cur != nil {
		p.cur = nil
	}
	if len(p.items) == 0 {
		p.inList = false
		return
	}
	blk := Block{Kind: KindList, Ordered: p.ordered, Items: make([]string, 0, len(p.items))}
	allSpans := make([][]Span, len(p.items))
	for i, it := range p.items {
		blk.Items = append(blk.Items, it.text)
		allSpans[i] = it.spans
	}
	idx := len(p.blocks)
	p.blocks = append(p.blocks, blk)
	for i, it := range p.items {
		p.segs = append(p.segs, Segment{BlockIdx: idx, ItemIdx: i, Text: it.text})
		_ = allSpans[i] // spans officiels dans les listes : rare, à rattacher plus tard
	}
	p.items = nil
	p.inList = false
	p.ordered = false
}

func (p *parser) leafImage(src, alt string) {
	p.flushCur()
	if p.inList {
		p.closeList()
	}
	p.blocks = append(p.blocks, Block{Kind: KindImage, Src: src, Alt: alt})
}

func (p *parser) leafRule() {
	p.flushCur()
	if p.inList {
		p.closeList()
	}
	p.blocks = append(p.blocks, Block{Kind: KindRule})
}

func (p *parser) flushCur() {
	if p.cur == nil {
		return
	}
	text := p.cur.text()
	spans := p.cur.spans()
	p.cur = nil
	p.isItem = false
	if text == "" {
		return
	}
	kind := p.curKind
	if kind == "" {
		kind = KindParagraph
	}
	blk := Block{Kind: kind, Text: text}
	if len(spans) > 0 {
		blk.Spans = spans
	}
	idx := len(p.blocks)
	p.blocks = append(p.blocks, blk)
	p.segs = append(p.segs, Segment{BlockIdx: idx, ItemIdx: 0, Text: text})
}

func (p *parser) flushAll() {
	p.flushCur()
	p.closeList()
}

// document assemble le texte canonique plat + offsets de segments + sha.
func (p *parser) document() *Document {
	var b strings.Builder
	offset := 0
	segs := make([]Segment, len(p.segs))
	for i, s := range p.segs {
		if i > 0 {
			b.WriteByte(' ')
			offset++
		}
		text := Normalize(s.Text)
		segs[i] = Segment{BlockIdx: s.BlockIdx, ItemIdx: s.ItemIdx, Text: text, Start: offset}
		b.WriteString(text)
		offset += RuneLen(text)
		segs[i].End = offset
	}
	text := b.String()
	sum := sha256.Sum256([]byte(text))
	return &Document{
		Blocks:   p.blocks,
		Segments: segs,
		Text:     text,
		Sha:      hex.EncodeToString(sum[:]),
	}
}

// ---------------------------------------------------------------------
// Writer de segment : accumulation + normalisation + marques officielles.
// ---------------------------------------------------------------------

type writer struct {
	b        strings.Builder
	n        int // code points déjà écrits
	sp       bool
	markOpen bool
	markNote string
	markAt   int // offset d'ouverture du mark (-1 = pas encore de contenu)
	mspans   []Span
}

func newWriter() *writer { return &writer{markAt: -1} }

func (w *writer) empty() bool { return w.n == 0 }

func (w *writer) write(s string) {
	for _, r := range s {
		if unicode.IsSpace(r) {
			w.sp = true
			continue
		}
		if w.sp && w.n > 0 {
			w.b.WriteByte(' ')
			w.n++
		}
		w.sp = false
		if w.markOpen && w.markAt < 0 {
			w.markAt = w.n
		}
		w.b.WriteRune(r)
		w.n++
	}
}

func (w *writer) openMark(note string) {
	if note == "" {
		return
	}
	w.markOpen = true
	w.markNote = note
	w.markAt = -1
}

func (w *writer) closeMark() {
	if !w.markOpen {
		return
	}
	if w.markAt >= 0 && w.markAt < w.n {
		w.mspans = append(w.mspans, Span{Start: w.markAt, End: w.n, Note: w.markNote})
	}
	w.markOpen = false
	w.markNote = ""
	w.markAt = -1
}

func (w *writer) text() string { return w.b.String() }

func (w *writer) spans() []Span { return w.mspans }
