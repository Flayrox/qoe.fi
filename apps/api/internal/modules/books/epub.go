// Package books — compiler des articles en livre EPUB 3.
//
// Aucune persistance dans ce lot : on produit un fichier propre, lisible
// par les lecteurs (Apple Books, Kobo, Calibre), à partir d'articles qui
// appartiennent déjà au créateur. La vente et la bibliothèque publiée
// viendront après (elles demandent une migration).
package books

import (
	"archive/zip"
	"bytes"
	"fmt"
	"html"
	"regexp"
	"strings"
	"time"
)

// Chapter est un chapitre prêt à écrire (HTML d'article).
type Chapter struct {
	Title string
	HTML  string
}

var (
	reVoid    = regexp.MustCompile(`(?is)<(br|hr|img)([^>]*?)(/?)>`)
	reImgAttr = regexp.MustCompile(`(?is)<img([^>]*?)/?>`)
)

// normalizeXHTML referme les balises void (EPUB = XHTML strict).
func normalizeXHTML(in string) string {
	out := reVoid.ReplaceAllStringFunc(in, func(m string) string {
		sub := reVoid.FindStringSubmatch(m)
		if len(sub) < 4 {
			return m
		}
		tag, attrs := sub[1], strings.TrimSpace(sub[2])
		if attrs == "" {
			return "<" + tag + "/>"
		}
		return "<" + tag + " " + attrs + "/>"
	})
	// Une image sans alt est invalide en EPUB : on ajoute un alt vide.
	out = reImgAttr.ReplaceAllStringFunc(out, func(m string) string {
		if strings.Contains(strings.ToLower(m), "alt=") {
			return m
		}
		trimmed := strings.TrimSuffix(strings.TrimSpace(m), "/>")
		trimmed = strings.TrimSuffix(trimmed, ">")
		return trimmed + ` alt=""/>`
	})
	return out
}

// BuildEPUB assemble un EPUB 3 en mémoire.
func BuildEPUB(title, author string, chapters []Chapter, now time.Time) ([]byte, error) {
	if strings.TrimSpace(title) == "" {
		return nil, fmt.Errorf("titre requis")
	}
	if len(chapters) == 0 {
		return nil, fmt.Errorf("aucun chapitre")
	}
	if strings.TrimSpace(author) == "" {
		author = "Auteur"
	}

	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)

	// 1) mimetype : premier fichier, SANS compression (spec EPUB).
	mime, err := zw.CreateHeader(&zip.FileHeader{
		Name:   "mimetype",
		Method: zip.Store,
	})
	if err != nil {
		return nil, err
	}
	if _, err := mime.Write([]byte("application/epub+zip")); err != nil {
		return nil, err
	}

	write := func(name, content string) error {
		file, err := zw.Create(name)
		if err != nil {
			return err
		}
		_, err = file.Write([]byte(content))
		return err
	}

	if err := write("META-INF/container.xml", `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`); err != nil {
		return nil, err
	}

	uid := fmt.Sprintf("urn:uuid:%d", now.UTC().UnixNano())
	chapterItems := make([]string, 0, len(chapters))
	spineItems := make([]string, 0, len(chapters))
	navItems := make([]string, 0, len(chapters))

	for index, chapter := range chapters {
		chapterTitle := strings.TrimSpace(chapter.Title)
		if chapterTitle == "" {
			chapterTitle = fmt.Sprintf("Chapitre %d", index+1)
		}
		id := fmt.Sprintf("chap%03d", index+1)
		file := id + ".xhtml"
		chapterItems = append(chapterItems, fmt.Sprintf(
			`    <item id="%s" href="%s" media-type="application/xhtml+xml"/>`, id, file))
		spineItems = append(spineItems, fmt.Sprintf(`    <itemref idref="%s"/>`, id))
		navItems = append(navItems, fmt.Sprintf(`      <li><a href="%s">%s</a></li>`,
			file, html.EscapeString(chapterTitle)))

		body := normalizeXHTML(chapter.HTML)
		page := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="fr" lang="fr">
<head>
  <meta charset="utf-8"/>
  <title>%s</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <h1>%s</h1>
%s
</body>
</html>`, html.EscapeString(chapterTitle), html.EscapeString(chapterTitle), body)
		if err := write("OEBPS/"+file, page); err != nil {
			return nil, err
		}
	}

	if err := write("OEBPS/style.css", `body { font-family: Georgia, serif; line-height: 1.6; margin: 5%; }
h1 { font-size: 1.6em; line-height: 1.25; margin: 0 0 1.2em; }
h2 { font-size: 1.3em; margin: 1.6em 0 0.6em; }
p { margin: 0 0 1em; }
blockquote { margin: 1em 0; padding-left: 1em; border-left: 3px solid #ccc; color: #444; }
img { max-width: 100%; height: auto; }`); err != nil {
		return nil, err
	}

	if err := write("OEBPS/nav.xhtml", fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="fr" lang="fr">
<head><meta charset="utf-8"/><title>Sommaire</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Sommaire</h1>
    <ol>
%s
    </ol>
  </nav>
</body>
</html>`, strings.Join(navItems, "\n"))); err != nil {
		return nil, err
	}

	modified := now.UTC().Format("2006-01-02T15:04:05Z")
	if err := write("OEBPS/content.opf", fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">%s</dc:identifier>
    <dc:title>%s</dc:title>
    <dc:creator>%s</dc:creator>
    <dc:language>fr</dc:language>
    <meta property="dcterms:modified">%s</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="style.css" media-type="text/css"/>
%s
  </manifest>
  <spine>
%s
  </spine>
</package>`, uid, html.EscapeString(title), html.EscapeString(author), modified,
		strings.Join(chapterItems, "\n"), strings.Join(spineItems, "\n"))); err != nil {
		return nil, err
	}

	if err := zw.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
