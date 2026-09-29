package ebooks

// Parseur EPUB : construit des EPUBs minimaux en mémoire (zip + OPF +
// chapitres) — aucun fichier, aucun réseau. Pur.

import (
	"archive/zip"
	"bytes"
	"strings"
	"testing"
)

// buildEpub assemble un EPUB minimal valide (container + OPF + chapitres).
func buildEpub(t *testing.T, title, author string, chapters map[string]string, cover []byte) []byte {
	t.Helper()
	var buf bytes.Buffer
	w := zip.NewWriter(&buf)
	add := func(name, content string) {
		t.Helper()
		f, err := w.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := f.Write([]byte(content)); err != nil {
			t.Fatal(err)
		}
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
		if err != nil {
			t.Fatal(err)
		}
		if _, err := f.Write(cover); err != nil {
			t.Fatal(err)
		}
		coverItem = `<item id="cover" href="cover.jpg" media-type="image/jpeg" properties="cover-image"/>`
	}
	add("OEBPS/content.opf", `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>`+title+`</dc:title>
    <dc:creator>`+author+`</dc:creator>
    <dc:language>fr</dc:language>
  </metadata>
  <manifest>`+manifest.String()+coverItem+`</manifest>
  <spine>`+spine.String()+`</spine>
</package>`)
	for name, body := range chapters {
		add("OEBPS/"+name, body)
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestParseEbook_HappyPath(t *testing.T) {
	raw := buildEpub(t, "Mon Livre", "Léa", map[string]string{
		"c1.xhtml": `<html><head><title>Chapitre Un</title></head><body><h1>Chapitre Un</h1><p>Bonjour <em>le monde</em>.</p></body></html>`,
		"c2.xhtml": `<html><body><p>Second chapitre.</p></body></html>`,
	}, []byte("FAKEJPEGDATA"))
	book, err := ParseEbook(raw)
	if err != nil {
		t.Fatalf("parse : %v", err)
	}
	if book.Title != "Mon Livre" || book.Author != "Léa" || book.Language != "fr" {
		t.Fatalf("métadonnées : %+v", book)
	}
	if len(book.Chapters) != 2 {
		t.Fatalf("2 chapitres attendus, obtenu %d", len(book.Chapters))
	}
	if !strings.Contains(book.Chapters[0].HTML, "<h1>Chapitre Un</h1>") ||
		!strings.Contains(book.Chapters[0].HTML, "<em>le monde</em>") {
		t.Fatalf("HTML strict attendu, obtenu %q", book.Chapters[0].HTML)
	}
	if string(book.Cover) != "FAKEJPEGDATA" || book.CoverMime != "image/jpeg" {
		t.Fatal("couverture extraite attendue")
	}
	if book.FileSha == "" || book.SizeBytes != len(raw) {
		t.Fatal("empreinte + taille attendues")
	}
}

func TestParseEbook_XSSStripped(t *testing.T) {
	raw := buildEpub(t, "X", "Y", map[string]string{
		"c1.xhtml": `<html><body><p onclick="evil()">Texte <script>alert(1)</script>suite.</p><style>p{color:red}</style><iframe src="x"/><img src="x" onerror="e()"/><a href="http://x">lien</a><div>bloc</div></body></html>`,
	}, nil)
	book, err := ParseEbook(raw)
	if err != nil {
		t.Fatalf("parse : %v", err)
	}
	if len(book.Chapters) != 1 {
		t.Fatalf("1 chapitre attendu, obtenu %d", len(book.Chapters))
	}
	html := book.Chapters[0].HTML
	for _, bad := range []string{"<script", "onclick", "<style", "<iframe", "<img", "<a ", "<div", "alert", "evil"} {
		if strings.Contains(html, bad) {
			t.Errorf("XSS : %q présent dans %q", bad, html)
		}
	}
	for _, good := range []string{"Texte", "suite.", "lien", "bloc"} {
		if !strings.Contains(html, good) {
			t.Errorf("texte légitime perdu : %q dans %q", good, html)
		}
	}
	if !strings.HasPrefix(strings.TrimSpace(html), "<p>") {
		t.Errorf("paragraphe conservé attendu, obtenu %q", html)
	}
}

func TestParseEbook_Invalid(t *testing.T) {
	for name, raw := range map[string][]byte{
		"vide":       {},
		"pas un zip": []byte("ceci n'est pas un zip du tout"),
		"zip sans opf": func() []byte {
			var buf bytes.Buffer
			w := zip.NewWriter(&buf)
			f, _ := w.Create("hello.txt")
			f.Write([]byte("hi"))
			w.Close()
			return buf.Bytes()
		}(),
	} {
		if _, err := ParseEbook(raw); err == nil {
			t.Errorf("%s : erreur attendue", name)
		}
	}
	// Trop gros : refusé avant parse (pas d'allocation monstre).
	huge := make([]byte, maxEpubBytes+1)
	if _, err := ParseEbook(huge); err == nil {
		t.Error("surpoids : erreur attendue")
	}
}
