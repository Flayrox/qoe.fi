package canon

import "testing"

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
	if len(b.Items) != 2 || b.Items[0] != "Premier" || b.Items[1] != "Second point" {
		t.Fatalf("items = %v", b.Items)
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
