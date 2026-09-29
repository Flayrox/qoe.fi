package ebooks

// Fuzz + invariants du parseur EPUB : la garantie du module n'est pas
// « on filtre bien » mais « rien de ce qui n'est pas dans l'allowlist ne
// peut sortir ». Ce test l'attaque directement : soit le parse échoue
// (fichier refusé), soit la sortie est PROUVÉE propre — balises de
// l'allowlist uniquement, attributs impossibles, bornes respectées.

import (
	"archive/zip"
	"bytes"
	"encoding/hex"
	"regexp"
	"strings"
	"testing"
)

// tagOnly : une balise émise par le parseur, sans aucun attribut possible.
var tagOnly = regexp.MustCompile(`^</?([a-z0-9]+)>$`)

// assertCleanHTML vérifie qu'un chapitre stocké ne contient QUE des balises
// de l'allowlist, nues (pas de `<a href>`, pas de `<img onerror>`, pas de
// `<p style>`), et aucun octet d'un contenu actif.
func assertCleanHTML(t *testing.T, label, html string) {
	t.Helper()
	for _, banned := range []string{"<script", "<style", "<iframe", "<img", "<object", "<embed", "<form", "<a ", "on=", "javascript:", "<svg", "<link", "<meta"} {
		if strings.Contains(strings.ToLower(html), banned) {
			t.Fatalf("%s : %q présent dans %q", label, banned, html)
		}
	}
	// Chaque `<` doit ouvrir une balise nue de l'allowlist (ou un texte
	// échappé, donc jamais un `<` littéral).
	for i := 0; i < len(html); i++ {
		if html[i] != '<' {
			continue
		}
		end := strings.IndexByte(html[i:], '>')
		if end < 0 {
			t.Fatalf("%s : balise non fermée dans %q", label, html)
		}
		tag := html[i : i+end+1]
		m := tagOnly.FindStringSubmatch(tag)
		if m == nil {
			t.Fatalf("%s : balise non nue ou non allowlistée %q dans %q", label, tag, html)
		}
		if !allowedTags[m[1]] {
			t.Fatalf("%s : balise hors allowlist %q dans %q", label, tag, html)
		}
		i += end
	}
}

// mkEpubBytes : même EPUB minimal que le test unitaire, mais sans *testing.T
// (utilisable pour les seeds du fuzz).
func mkEpubBytes(title, author string, chapters map[string]string, cover []byte) []byte {
	var buf bytes.Buffer
	w := zip.NewWriter(&buf)
	add := func(name, content string) {
		f, err := w.Create(name)
		if err != nil {
			return
		}
		_, _ = f.Write([]byte(content))
	}
	add("mimetype", "application/epub+zip")
	add("META-INF/container.xml", `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`)
	var manifest, spine strings.Builder
	i := 0
	for name := range chapters {
		id := "ch" + string(rune('0'+i))
		manifest.WriteString(`<item id="` + id + `" href="` + name + `" media-type="application/xhtml+xml"/>`)
		spine.WriteString(`<itemref idref="` + id + `"/>`)
		i++
	}
	coverItem := ""
	if cover != nil {
		f, err := w.Create("OEBPS/cover.jpg")
		if err == nil {
			_, _ = f.Write(cover)
		}
		coverItem = `<item id="cover" href="cover.jpg" media-type="image/jpeg" properties="cover-image"/>`
	}
	add("OEBPS/content.opf", `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>`+title+`</dc:title><dc:creator>`+author+`</dc:creator><dc:language>fr</dc:language>
  </metadata>
  <manifest>`+manifest.String()+coverItem+`</manifest>
  <spine>`+spine.String()+`</spine>
</package>`)
	for name, body := range chapters {
		add("OEBPS/"+name, body)
	}
	_ = w.Close()
	return buf.Bytes()
}

// TestParseEbook_TraversalRefused : un container.xml qui sort du zip
// (« ../../etc/passwd », « /absolu ») doit être refusé, jamais lu.
func TestParseEbook_TraversalRefused(t *testing.T) {
	build := func(fullPath string) []byte {
		var buf bytes.Buffer
		w := zip.NewWriter(&buf)
		f, _ := w.Create("META-INF/container.xml")
		_, _ = f.Write([]byte(`<?xml version="1.0"?><container><rootfiles><rootfile full-path="` + fullPath + `"/></rootfiles></container>`))
		g, _ := w.Create("secret.txt")
		_, _ = g.Write([]byte("../../etc/passwd"))
		_ = w.Close()
		return buf.Bytes()
	}
	for _, p := range []string{"../../etc/passwd", "..\\..\\windows\\system32", "OEBPS/../../secret.txt"} {
		if book, err := ParseEbook(build(p)); err == nil {
			t.Errorf("chemin %q accepté (chapitres=%d)", p, len(book.Chapters))
		}
	}
}

func FuzzParseEbook(f *testing.F) {
	f.Add([]byte{})
	f.Add([]byte("pas un zip du tout"))
	f.Add([]byte("PK\x03\x04 tronqué"))
	f.Add(mkEpubBytes("T", "A", map[string]string{
		"c1.xhtml": `<html><head><title>C1</title></head><body><h1>C1</h1><p>Bonjour <em>le monde</em>.</p></body></html>`,
	}, []byte("JPEG")))
	f.Add(mkEpubBytes("X", "Y", map[string]string{
		"c1.xhtml": `<html><body><p onclick="e()">T<script>alert(1)</script><img src="x" onerror="e()"/><a href="http://x">l</a></p><iframe src="x"/><style>p{}</style><div>d</div></body></html>`,
	}, nil))

	f.Fuzz(func(t *testing.T, raw []byte) {
		// Borne le corpus : l'entrée passe de toute façon par la borne du
		// parseur (20 Mo) — inutile de faire exploser la machine du CI.
		if len(raw) > 1<<20 {
			t.Skip()
		}
		book, err := ParseEbook(raw)
		if err != nil {
			return // refus explicite : comportement attendu
		}
		if book.Title == "" {
			t.Fatal("titre vide alors que le parse a réussi")
		}
		if len([]rune(book.Title)) > maxMetadataLength {
			t.Fatalf("titre non borné : %d runes", len([]rune(book.Title)))
		}
		if len(book.Chapters) == 0 || len(book.Chapters) > maxChapters {
			t.Fatalf("nombre de chapitres hors bornes : %d", len(book.Chapters))
		}
		if book.SizeBytes != len(raw) {
			t.Fatalf("taille stockée %d ≠ entrée %d", book.SizeBytes, len(raw))
		}
		if len(book.FileSha) != hex.EncodedLen(32) {
			t.Fatalf("empreinte invalide : %q", book.FileSha)
		}
		if len(book.Cover) > maxCoverBytes {
			t.Fatalf("couverture non bornée : %d octets", len(book.Cover))
		}
		total := 0
		for i, c := range book.Chapters {
			assertCleanHTML(t, "chapitre", c.HTML)
			total += len(c.HTML)
			if total > maxChapters*maxChapterText {
				t.Fatalf("texte total non borné")
			}
			if strings.TrimSpace(stripTags(c.HTML)) == "" {
				t.Fatalf("chapitre %d vide alors qu'il est stocké", i)
			}
		}
	})
}
