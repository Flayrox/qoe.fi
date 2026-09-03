package canon

import (
	"strings"
	"testing"
)

func TestParseParagraphsEntitiesAndInline(t *testing.T) {
	doc := Parse(`<p>Salut <b>le monde</b> !</p><p>Ça va ? &eacute;t&eacute;</p>`)
	if len(doc.Blocks) != 2 {
		t.Fatalf("blocs attendus: 2, got %d (%+v)", len(doc.Blocks), doc.Blocks)
	}
	if got := doc.Blocks[0].Text; got != "Salut le monde !" {
		t.Errorf("texte p1 = %q", got)
	}
	if got := doc.Blocks[1].Text; got != "Ça va ? été" {
		t.Errorf("texte p2 (entités) = %q", got)
	}
	wantText := "Salut le monde ! Ça va ? été"
	if doc.Text != wantText {
		t.Errorf("texte canonique = %q, want %q", doc.Text, wantText)
	}
	if doc.Sha == "" || len(doc.Sha) != 64 {
		t.Errorf("sha attendu (64 hex), got %q", doc.Sha)
	}
}

func TestParseHeadingsAndLevelCap(t *testing.T) {
	doc := Parse(`<h1>Un</h1><h3>Trois</h3><h5>Cinq plafonné</h5>`)
	kinds := []Kind{}
	for _, b := range doc.Blocks {
		kinds = append(kinds, b.Kind)
	}
	want := []Kind{KindHeading1, KindHeading3, KindHeading4}
	if len(kinds) != 3 || kinds[0] != want[0] || kinds[1] != want[1] || kinds[2] != want[2] {
		t.Fatalf("kinds = %v, want %v", kinds, want)
	}
}

func TestParseBlockquoteWithInnerParagraph(t *testing.T) {
	doc := Parse(`<blockquote><p>Une <i>citation</i> profonde</p></blockquote>`)
	if len(doc.Blocks) != 1 {
		t.Fatalf("1 bloc attendu, got %+v", doc.Blocks)
	}
	b := doc.Blocks[0]
	if b.Kind != KindQuote || b.Text != "Une citation profonde" {
		t.Fatalf("quote = %+v", b)
	}
}

func TestParseOrderedList(t *testing.T) {
	doc := Parse(`<ol><li>Premier</li><li><strong>Second</strong> point</li></ol>`)
	if len(doc.Blocks) != 1 {
		t.Fatalf("1 bloc attendu, got %+v", doc.Blocks)
	}
	b := doc.Blocks[0]
	if b.Kind != KindList || !b.Ordered {
		t.Fatalf("liste ordonnée attendue, got %+v", b)
	}
	if len(b.Items) != 2 || b.Items[0].Text != "Premier" || b.Items[1].Text != "Second point" {
		t.Fatalf("items = %v", b.Items)
	}
	// Le <strong> du second item est capturé en span inline.
	if len(b.Items[1].Inline) != 1 || b.Items[1].Inline[0].Style != "bold" ||
		b.Items[1].Inline[0].Start != 0 || b.Items[1].Inline[0].End != 6 {
		t.Fatalf("inline item = %+v", b.Items[1].Inline)
	}
	if len(doc.Segments) != 2 {
		t.Fatalf("2 segments attendus, got %d", len(doc.Segments))
	}
	if doc.Segments[0].BlockIdx != doc.Segments[1].BlockIdx || doc.Segments[0].ItemIdx != 0 || doc.Segments[1].ItemIdx != 1 {
		t.Fatalf("segments list = %+v", doc.Segments)
	}
}

func TestParseImageAndRule(t *testing.T) {
	doc := Parse(`<p>Intro</p><figure><img src="https://x/a.jpg" alt="Photo A"></figure><hr><p>Fin</p>`)
	// L'image est un bloc feuille ; la légende éventuelle redevient paragraphe.
	var kinds []Kind
	var img *Block
	for i := range doc.Blocks {
		kinds = append(kinds, doc.Blocks[i].Kind)
		if doc.Blocks[i].Kind == KindImage {
			img = &doc.Blocks[i]
		}
	}
	if img == nil || img.Src != "https://x/a.jpg" || img.Alt != "Photo A" {
		t.Fatalf("image manquante/mal lue : %+v", doc.Blocks)
	}
	hasRule := false
	for _, k := range kinds {
		if k == KindRule {
			hasRule = true
		}
	}
	if !hasRule {
		t.Fatalf("hr manquant : %v", kinds)
	}
	// Le texte canonique plat conserve tout le texte.
	if doc.Text != "Intro Fin" {
		t.Fatalf("texte canonique = %q", doc.Text)
	}
}

func TestOfficialMarkSpan(t *testing.T) {
	doc := Parse(`<p>Avant <mark data-annotation-note="Note N1">passage</mark> après</p>`)
	if len(doc.Blocks) != 1 {
		t.Fatalf("1 bloc attendu, got %+v", doc.Blocks)
	}
	b := doc.Blocks[0]
	if b.Text != "Avant passage après" {
		t.Fatalf("texte = %q", b.Text)
	}
	if len(b.Spans) != 1 {
		t.Fatalf("1 span officiel attendu, got %+v", b.Spans)
	}
	s := b.Spans[0]
	if s.Note != "Note N1" || s.Start != 6 || s.End != 13 {
		t.Fatalf("span = %+v (want {6,13,Note N1}) sur %q", s, b.Text)
	}
	// Le span ne compte PAS dans le texte : un mark ordinaire n'a pas d'impact.
	if doc.Text != "Avant passage après" {
		t.Fatalf("texte canonique = %q", doc.Text)
	}
}

func TestWhitespaceCollapseAndNormalize(t *testing.T) {
	if got := Normalize("  Bonjour\t le\n\n monde  "); got != "Bonjour le monde" {
		t.Fatalf("Normalize = %q", got)
	}
	doc := Parse(`<p>Ligne  un<br>saut  </p>`)
	if doc.Text != "Ligne un saut" {
		t.Fatalf("collapse br = %q", doc.Text)
	}
}

func TestFindAcrossParagraphs(t *testing.T) {
	doc := Parse(`<p>Bonjour le monde</p><p>Deuxième partie ici</p>`)
	wantText := "Bonjour le monde Deuxième partie ici"
	if doc.Text != wantText {
		t.Fatalf("texte canonique = %q, want %q", doc.Text, wantText)
	}
	// Un passage qui traverse la frontière de paragraphe est trouvable tel
	// quel (séparateur = espace dans le texte canonique).
	start, end, ok := doc.Find("monde Deuxième", 0)
	if !ok || start != 11 || end != 25 {
		t.Fatalf("Find = %d,%d,%v (want 11,25,true)", start, end, ok)
	}
	// … même si le passage cité contient des sauts de ligne/paragraphes.
	start, end, ok = doc.Find("monde\n\nDeuxième", 0)
	if !ok || start != 11 || end != 25 {
		t.Fatalf("Find multi-ligne = %d,%d,%v", start, end, ok)
	}
	// Les offsets sont des code points (é = 1).
	if seg := doc.Segments[1]; seg.Start != 17 || seg.End != 36 {
		t.Fatalf("segment 2 = %+v (want start 17, end 36)", seg)
	}
}

func TestFindOrdinalAndFallback(t *testing.T) {
	doc := Parse(`<p>Répète ceci</p><p>Répète ceci</p>`)
	if doc.Text != "Répète ceci Répète ceci" {
		t.Fatalf("texte = %q", doc.Text)
	}
	start, end, ok := doc.Find("Répète ceci", 1)
	if !ok || start != 12 || end != 23 {
		t.Fatalf("2e occurrence = %d,%d,%v (want 12,23)", start, end, ok)
	}
	// Ordinal dépassé → repli sur la première occurrence (sémantique héritée).
	start, end, ok = doc.Find("Répète ceci", 99)
	if !ok || start != 0 {
		t.Fatalf("repli = %d,%d,%v (want 0,…)", start, end, ok)
	}
}

func TestFindTolerantEllipsis(t *testing.T) {
	sentence := "Les amphithéâtres se vident, les plateformes se remplissent."
	doc := Parse("<p>" + sentence + "</p>")
	// Citation héritée tronquée par une ellipse finale.
	start, end, ok := doc.Find(sentence+"…", 0)
	if !ok || start != 0 || end != RuneLen(sentence) {
		t.Fatalf("Find ellipse = %d,%d,%v (want 0,%d,true)", start, end, ok, RuneLen(sentence))
	}
	// Ellipse initiale aussi (extrait « …continué »).
	start, end, ok = doc.Find("…"+sentence, 0)
	if !ok || start != 0 || end != RuneLen(sentence) {
		t.Fatalf("Find ellipse init = %d,%d,%v", start, end, ok)
	}
}

func TestFindTolerantWordPrefix(t *testing.T) {
	sentence := "Un très long titre de démonstration complet"
	doc := Parse("<p>" + sentence + "</p>")
	// Citation dont la fin a été retirée lors d'un remaniement.
	start, end, ok := doc.Find(sentence+" et plus encore", 0)
	if !ok || start != 0 || end != RuneLen(sentence) {
		t.Fatalf("Find préfixe = %d,%d,%v (want 0,%d,true)", start, end, ok, RuneLen(sentence))
	}
}

func TestSkipNonRenderedContent(t *testing.T) {
	doc := Parse(`<script>var secret = "fuite";</script><style>.x{}</style>` +
		`<p>Texte <noscript>fallback non rendu</noscript>visible</p>` +
		`<template><p>template ignoré</p></template>`)
	if doc.Text != "Texte visible" {
		t.Fatalf("texte canonique = %q (script/style/noscript/template ne doivent JAMAIS fuiter)", doc.Text)
	}
	if len(doc.Blocks) != 1 || doc.Blocks[0].Text != "Texte visible" {
		t.Fatalf("blocs = %+v", doc.Blocks)
	}
}

func TestMarkWithoutNoteIgnored(t *testing.T) {
	doc := Parse(`<p>Avant <mark>simple mark</mark> après</p>`)
	if len(doc.Blocks) != 1 || len(doc.Blocks[0].Spans) != 0 {
		t.Fatalf("mark sans note ne doit pas produire de span : %+v", doc.Blocks)
	}
	if doc.Text != "Avant simple mark après" {
		t.Fatalf("texte = %q", doc.Text)
	}
}

func TestFindNegativeOrdinal(t *testing.T) {
	doc := Parse(`<p>Répète ceci</p><p>Répète ceci</p>`)
	start, end, ok := doc.Find("Répète ceci", -7)
	if !ok || start != 0 || end != 11 {
		t.Fatalf("ordinal négatif = %d,%d,%v (want 0,11,true)", start, end, ok)
	}
}

func TestEmptyAndWhitespaceArticle(t *testing.T) {
	for _, html := range []string{"", "   \n\t  ", "<script>x</script>", "<hr><img src=\"x\">"} {
		doc := Parse(html)
		if doc.Text != "" {
			t.Fatalf("html %q → texte %q, want vide", html, doc.Text)
		}
		if len(doc.Sha) != 64 {
			t.Fatalf("sha attendu 64 hex, got %q", doc.Sha)
		}
	}
}

func TestNestedListFlatTextPreserved(t *testing.T) {
	// Les listes imbriquées (studio/TipTap) ne sont pas encore modélisées en
	// blocs imbriqués — mais le TEXTE canonique plat doit tout préserver
	// (c'est lui qui porte les ancres).
	doc := Parse(`<ul><li>Racine <ul><li>Enfant</li></ul> fin</li></ul>`)
	if !strings.Contains(doc.Text, "Racine") || !strings.Contains(doc.Text, "Enfant") || !strings.Contains(doc.Text, "fin") {
		t.Fatalf("texte canonique = %q — les mots des listes imbriquées doivent survivre", doc.Text)
	}
}

func TestCountBefore(t *testing.T) {
	doc := Parse(`<p>Répète ceci</p><p>Répète ceci</p>`)
	// Seconde occurrence : début canonique 12 → 1 occurrence complète avant.
	if got := doc.CountBefore("Répète ceci", 12); got != 1 {
		t.Fatalf("CountBefore(…, 12) = %d, want 1", got)
	}
	// Avant la première occurrence → 0.
	if got := doc.CountBefore("Répète ceci", 1); got != 0 {
		t.Fatalf("CountBefore(…, 1) = %d, want 0", got)
	}
	// L'occurrence qui COMMENCE avant mais finit après la borne ne compte pas.
	if got := doc.CountBefore("Répète ceci", 5); got != 0 {
		t.Fatalf("CountBefore(…, 5) = %d, want 0", got)
	}
	if got := doc.CountBefore("absent", 12); got != 0 {
		t.Fatalf("CountBefore absent = %d, want 0", got)
	}
}

func TestFindUnicode(t *testing.T) {
	doc := Parse(`<p>Salut 👋 le monde</p>`)
	start, end, ok := doc.Find("👋 le monde", 0)
	if !ok || start != 6 || end != 16 {
		t.Fatalf("Find emoji = %d,%d,%v (want 6,16 — code points)", start, end, ok)
	}
	if RuneLen(doc.Text) != 16 {
		t.Fatalf("RuneLen texte = %d", RuneLen(doc.Text))
	}
}

func TestInlineSpans(t *testing.T) {
	doc := Parse(`<p>Début <strong>gras</strong> et <em>italique</em>, <a href="https://qoe.fi">lien</a>.</p>`)
	if len(doc.Blocks) != 1 {
		t.Fatalf("1 bloc attendu, got %+v", doc.Blocks)
	}
	b := doc.Blocks[0]
	if b.Text != "Début gras et italique, lien." {
		t.Fatalf("texte = %q", b.Text)
	}
	want := []InlineSpan{
		{Start: 6, End: 10, Style: "bold"},
		{Start: 14, End: 22, Style: "italic"},
		{Start: 24, End: 28, Style: "link", Href: "https://qoe.fi"},
	}
	if len(b.Inline) != len(want) {
		t.Fatalf("spans = %+v, want %+v", b.Inline, want)
	}
	for i, w := range want {
		if b.Inline[i] != w {
			t.Fatalf("span[%d] = %+v, want %+v", i, b.Inline[i], w)
		}
	}
}

func TestInlineSpansNestedAndEdges(t *testing.T) {
	// Imbrication bold+italic → deux spans chevauchants ; style ouvert sur un
	// blanc collapsé → le span démarre au 1er caractère réel ; <a> sans href →
	// aucune sortie ; espaces internes préservés dans le span.
	doc := Parse(`<p>Bonjour <strong>le <em>monde</em> entier</strong> ! <a>sans lien</a></p>`)
	b := doc.Blocks[0]
	if b.Text != "Bonjour le monde entier ! sans lien" {
		t.Fatalf("texte = %q", b.Text)
	}
	// Émission LIFO par ordre de fermeture : l'italique (imbriqué) sort d'abord.
	want := []InlineSpan{
		{Start: 11, End: 16, Style: "italic"},
		{Start: 8, End: 23, Style: "bold"},
	}
	if len(b.Inline) != len(want) {
		t.Fatalf("spans = %+v, want %+v", b.Inline, want)
	}
	for i, w := range want {
		if b.Inline[i] != w {
			t.Fatalf("span[%d] = %+v, want %+v", i, b.Inline[i], w)
		}
	}
	// Imbrication décalée : l'ordre d'émission suit la fermeture (LIFO).
	doc2 := Parse(`<p>a<em>b<strong>c</strong>d</em>e</p>`)
	b2 := doc2.Blocks[0]
	if b2.Text != "abcde" || len(b2.Inline) != 2 {
		t.Fatalf("imbriqué = %+v (%q)", b2.Inline, b2.Text)
	}
	if b2.Inline[0] != (InlineSpan{Start: 2, End: 3, Style: "bold"}) {
		t.Fatalf("bold imbriqué = %+v", b2.Inline[0])
	}
	if b2.Inline[1] != (InlineSpan{Start: 1, End: 4, Style: "italic"}) {
		t.Fatalf("italic englobant = %+v", b2.Inline[1])
	}
}
