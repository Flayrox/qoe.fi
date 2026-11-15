package books

import (
	"archive/zip"
	"bytes"
	"io"
	"strings"
	"testing"
	"time"
)

func TestBuildEPUB_Structure(t *testing.T) {
	data, err := BuildEPUB("Mon livre", "Jeanne", []Chapter{
		{Title: "Premier", HTML: "<p>Bonjour<br>le monde</p><img src=\"a.png\">"},
		{Title: "Second", HTML: "<h2>Suite</h2><p>Fin.</p>"},
	}, time.Date(2026, 11, 15, 12, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("BuildEPUB: %v", err)
	}

	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatalf("zip: %v", err)
	}
	if len(reader.File) == 0 || reader.File[0].Name != "mimetype" {
		t.Fatalf("le premier fichier doit être mimetype, got %v", reader.File[0].Name)
	}
	if reader.File[0].Method != zip.Store {
		t.Fatal("mimetype doit être stocké sans compression")
	}

	files := map[string]string{}
	for _, file := range reader.File {
		rc, err := file.Open()
		if err != nil {
			t.Fatal(err)
		}
		body, _ := io.ReadAll(rc)
		_ = rc.Close()
		files[file.Name] = string(body)
	}

	if files["mimetype"] != "application/epub+zip" {
		t.Fatalf("mimetype = %q", files["mimetype"])
	}
	opf := files["OEBPS/content.opf"]
	for _, want := range []string{"<dc:title>Mon livre</dc:title>", "chap001", "chap002"} {
		if !strings.Contains(opf, want) {
			t.Fatalf("content.opf sans %q", want)
		}
	}
	nav := files["OEBPS/nav.xhtml"]
	if !strings.Contains(nav, "Premier") || !strings.Contains(nav, "Second") {
		t.Fatalf("sommaire incomplet : %s", nav)
	}
	first := files["OEBPS/chap001.xhtml"]
	if !strings.Contains(first, "<br/>") {
		t.Fatalf("br non refermé en XHTML : %s", first)
	}
	if !strings.Contains(first, `alt=""`) {
		t.Fatalf("img sans alt : %s", first)
	}
}

func TestBuildEPUB_Refus(t *testing.T) {
	if _, err := BuildEPUB("", "A", []Chapter{{Title: "x", HTML: "<p>x</p>"}}, time.Now()); err == nil {
		t.Fatal("titre vide accepté")
	}
	if _, err := BuildEPUB("T", "A", nil, time.Now()); err == nil {
		t.Fatal("livre sans chapitre accepté")
	}
}

func TestBookFileName(t *testing.T) {
	if got := bookFileName("Été 2026 : mon livre !"); got != "t-2026-mon-livre" {
		t.Fatalf("bookFileName = %q", got)
	}
}
