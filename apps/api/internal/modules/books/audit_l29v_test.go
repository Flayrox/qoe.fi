package books

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"io"
	"regexp"
	"strings"
	"testing"
	"time"
)

// readEPUB rend le contenu des fichiers de l'archive, indexé par nom.
func readEPUB(t *testing.T, data []byte) map[string]string {
	t.Helper()
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatalf("zip: %v", err)
	}
	files := map[string]string{}
	for _, file := range reader.File {
		rc, err := file.Open()
		if err != nil {
			t.Fatalf("open %s: %v", file.Name, err)
		}
		body, err := io.ReadAll(rc)
		_ = rc.Close()
		if err != nil {
			t.Fatalf("read %s: %v", file.Name, err)
		}
		files[file.Name] = string(body)
	}
	return files
}

// TestAuditL29V_EpubIdentifierIsUUID : `dc:identifier` valait
// `urn:uuid:<nanos>` — ce n'est pas un UUID (RFC 4122) : epubcheck le rejette
// et les bibliothèques de lecture ne peuvent pas rapprocher l'ouvrage.
func TestAuditL29V_EpubIdentifierIsUUID(t *testing.T) {
	data, err := BuildEPUB("Mon livre", "Jeanne",
		[]Chapter{{Title: "Un", HTML: "<p>Texte</p>"}},
		time.Date(2026, 11, 22, 10, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("BuildEPUB: %v", err)
	}
	opf := readEPUB(t, data)["OEBPS/content.opf"]
	m := regexp.MustCompile(`<dc:identifier id="bookid">([^<]+)</dc:identifier>`).FindStringSubmatch(opf)
	if m == nil {
		t.Fatalf("dc:identifier absent : %s", opf)
	}
	valid := regexp.MustCompile(`^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
	if !valid.MatchString(m[1]) {
		t.Fatalf("dc:identifier = %q, attendu un UUID RFC 4122", m[1])
	}
}

// TestAuditL29V_EpubChaptersAreWellFormedXHTML : les entités HTML nommées
// (`&nbsp;`, `&laquo;`…) et un `&` nu restaient tels quels ; en XHTML/XML ce
// sont des entités non déclarées, donc chaque chapitre importé est illisible.
func TestAuditL29V_EpubChaptersAreWellFormedXHTML(t *testing.T) {
	data, err := BuildEPUB("Mon livre", "Jeanne",
		[]Chapter{{Title: "Un", HTML: `<p>Un&nbsp;mot &amp; &laquo; cité &raquo; — AT&T</p>`}},
		time.Date(2026, 11, 22, 10, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("BuildEPUB: %v", err)
	}
	page := readEPUB(t, data)["OEBPS/chap001.xhtml"]
	if page == "" {
		t.Fatal("chap001.xhtml absent")
	}
	decoder := xml.NewDecoder(strings.NewReader(page))
	for {
		_, err := decoder.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatalf("chapitre XHTML mal formé : %v", err)
		}
	}
}
