package ebooks

// Parseur EPUB minimal (stdlib uniquement : archive/zip + encoding/xml).
// On n'extrait que le TEXTE STRUCTURÉ (titres, paragraphes, citations,
// listes, emphases) + métadonnées + couverture — jamais de scripts,
// styles, iframes, images (hors cover), handlers ou CSS embarqué : ce qui
// n'est pas dans l'allowlist n'est ni lu ni stocké (XSS impossible par
// construction, pas par filtrage a posteriori).
//
// Bornes anti-abus (zip bomb et monstres) : fichier ≤ 20 Mo, décompressé
// total ≤ 50 Mo, ≤ 1000 entrées, ≤ 300 chapitres, chapitre ≤ 1 Mo de texte,
// couverture ≤ 2 Mo. Tout dépassement = erreur explicite (pas de troncature
// silencieuse qui corromprait un livre).

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"path"
	"strings"
)

const (
	maxEpubBytes      = 20 << 20 // 20 Mo (fichier uploadé)
	maxExpandedBytes  = 50 << 20 // 50 Mo (décompressé total — zip bomb)
	maxZipEntries     = 1000
	maxChapters       = 300
	maxChapterText    = 1 << 20 // 1 Mo de texte par chapitre
	maxCoverBytes     = 2 << 20 // 2 Mo (couverture)
	maxMetadataLength = 300
)

// ErrEpubInvalid : fichier non-EPUB, corrompu ou hors bornes (400 côté route,
// message explicite — jamais « erreur interne » pour un fichier du user).
var ErrEpubInvalid = errors.New("EPUB invalide")

// Chapter est un chapitre parsé (titre + HTML strict).
type Chapter struct {
	Title string `json:"title"`
	HTML  string `json:"html"`
}

// ParsedEbook est le résultat du parse (prêt à stocker).
type ParsedEbook struct {
	Title     string
	Author    string
	Language  string
	Chapters  []Chapter
	Cover     []byte
	CoverMime string
	FileSha   string
	SizeBytes int
}

// container.xml : où est l'OPF.
type containerXML struct {
	Rootfiles struct {
		Rootfile []struct {
			FullPath string `xml:"full-path,attr"`
		} `xml:"rootfile"`
	} `xml:"rootfiles"`
}

// opfPackage : métadonnées + manifest + spine.
type opfPackage struct {
	Metadata struct {
		Title    []string `xml:"title"`
		Creator  []string `xml:"creator"`
		Language []string `xml:"language"`
	} `xml:"metadata"`
	Manifest struct {
		Items []struct {
			ID         string `xml:"id,attr"`
			Href       string `xml:"href,attr"`
			MediaType  string `xml:"media-type,attr"`
			Properties string `xml:"properties,attr"`
		} `xml:"item"`
	} `xml:"manifest"`
	Spine struct {
		Items []struct {
			IDRef string `xml:"idref,attr"`
		} `xml:"itemref"`
	} `xml:"spine"`
}

// allowedTags : l'allowlist (balise → rendue telle quelle). Tout le reste
// (script, style, iframe, img, a, div, span, table…) est APLATI (texte
// conservé, balise jetée) ou IGNORÉ avec son contenu (script/style).
var allowedTags = map[string]bool{
	"p": true, "h1": true, "h2": true, "h3": true, "h4": true, "h5": true, "h6": true,
	"blockquote": true, "ul": true, "ol": true, "li": true,
	"em": true, "strong": true, "br": true,
}

// droppedTags : contenu jeté avec la balise (jamais de texte actif).
var droppedTags = map[string]bool{
	"script": true, "style": true, "iframe": true, "object": true,
	"embed": true, "form": true, "noscript": true,
}

// ParseEbook parse un EPUB depuis ses octets (upload déjà borné en taille
// par la route — re-vérifié ici en défense en profondeur).
func ParseEbook(raw []byte) (ParsedEbook, error) {
	var out ParsedEbook
	if len(raw) == 0 || len(raw) > maxEpubBytes {
		return out, fmt.Errorf("%w : taille (max 20 Mo)", ErrEpubInvalid)
	}
	sum := sha256.Sum256(raw)
	out.FileSha = hex.EncodeToString(sum[:])
	out.SizeBytes = len(raw)

	zr, err := zip.NewReader(bytes.NewReader(raw), int64(len(raw)))
	if err != nil {
		return out, fmt.Errorf("%w : zip illisible", ErrEpubInvalid)
	}
	if len(zr.File) == 0 || len(zr.File) > maxZipEntries {
		return out, fmt.Errorf("%w : entrées (%d, max %d)", ErrEpubInvalid, len(zr.File), maxZipEntries)
	}
	files := map[string]*zip.File{}
	var expanded int64
	for _, f := range zr.File {
		if f.UncompressedSize64 > maxExpandedBytes {
			return out, fmt.Errorf("%w : entrée trop grosse", ErrEpubInvalid)
		}
		expanded += int64(f.UncompressedSize64)
		if expanded > maxExpandedBytes {
			return out, fmt.Errorf("%w : décompressé total (max 50 Mo — zip bomb ?)", ErrEpubInvalid)
		}
		files[f.Name] = f
	}
	read := func(name string) ([]byte, error) {
		f, ok := files[name]
		if !ok {
			return nil, fmt.Errorf("%w : %s manquant", ErrEpubInvalid, name)
		}
		rc, err := f.Open()
		if err != nil {
			return nil, fmt.Errorf("%w : %s illisible", ErrEpubInvalid, name)
		}
		defer rc.Close()
		return io.ReadAll(io.LimitReader(rc, maxExpandedBytes+1))
	}

	// container.xml → OPF (chemin résolu contre META-INF/, traversal refusé).
	rawContainer, err := read("META-INF/container.xml")
	if err != nil {
		return out, err
	}
	var container containerXML
	if err := xml.Unmarshal(rawContainer, &container); err != nil || len(container.Rootfiles.Rootfile) == 0 {
		return out, fmt.Errorf("%w : container.xml", ErrEpubInvalid)
	}
	// full-path est relatif à la RACINE du zip (pas à META-INF/) — et un
	// chemin qui sort (.. ×2+) est refusé (traversal via container.xml).
	opfPath := path.Clean("/" + container.Rootfiles.Rootfile[0].FullPath)
	if opfPath == "/" || strings.HasPrefix(opfPath, "/..") {
		return out, fmt.Errorf("%w : chemin OPF suspect", ErrEpubInvalid)
	}
	opfPath = strings.TrimPrefix(opfPath, "/")
	rawOPF, err := read(opfPath)
	if err != nil {
		return out, err
	}
	var pkg opfPackage
	decoder := xml.NewDecoder(bytes.NewReader(rawOPF))
	decoder.Strict = false
	decoder.Entity = xml.HTMLEntity
	if err := decoder.Decode(&pkg); err != nil {
		return out, fmt.Errorf("%w : OPF illisible", ErrEpubInvalid)
	}
	if len(pkg.Spine.Items) == 0 {
		return out, fmt.Errorf("%w : aucun chapitre (spine vide)", ErrEpubInvalid)
	}
	if len(pkg.Spine.Items) > maxChapters {
		return out, fmt.Errorf("%w : trop de chapitres (max %d)", ErrEpubInvalid, maxChapters)
	}
	if len(pkg.Metadata.Title) > 0 {
		out.Title = clampMeta(pkg.Metadata.Title[0])
	}
	if out.Title == "" {
		out.Title = "Sans titre"
	}
	if len(pkg.Metadata.Creator) > 0 {
		out.Author = clampMeta(pkg.Metadata.Creator[0])
	}
	if len(pkg.Metadata.Language) > 0 {
		out.Language = strings.ToLower(strings.TrimSpace(pkg.Metadata.Language[0]))
	}

	base := path.Dir(opfPath)
	byID := map[string]string{}
	for _, it := range pkg.Manifest.Items {
		href := path.Clean(base + "/" + it.Href)
		byID[it.ID] = href
		// Couverture : properties="cover-image" (EPUB3) ou image référencée
		// comme cover (EPUB2 : meta name="cover" — traité ci-dessous).
		if strings.Contains(it.Properties, "cover-image") && strings.HasPrefix(it.MediaType, "image/") {
			if out.Cover == nil {
				if data, err := read(href); err == nil && len(data) > 0 && len(data) <= maxCoverBytes {
					out.Cover = data
					out.CoverMime = it.MediaType
				}
			}
		}
	}
	// EPUB2 : <meta name="cover" content="ID">.
	if out.Cover == nil {
		var metaCover struct {
			Meta []struct {
				Name    string `xml:"name,attr"`
				Content string `xml:"content,attr"`
			} `xml:"metadata>meta"`
		}
		_ = xml.Unmarshal(rawOPF, &metaCover)
		for _, m := range metaCover.Meta {
			if strings.ToLower(m.Name) == "cover" {
				if href, ok := byID[m.Content]; ok {
					if data, err := read(href); err == nil && len(data) > 0 && len(data) <= maxCoverBytes {
						out.Cover = data
						out.CoverMime = mimeByExt(href)
					}
				}
			}
		}
	}

	for _, ref := range pkg.Spine.Items {
		href, ok := byID[ref.IDRef]
		if !ok {
			continue // idref orphelin : ignoré (pas d'échec — EPUBs réels imparfaits)
		}
		raw, err := read(href)
		if err != nil {
			continue // chapitre illisible : ignoré, les autres passent
		}
		title, html := extractChapter(raw)
		if strings.TrimSpace(stripTags(html)) == "" {
			continue // chapitre vide : ignoré
		}
		out.Chapters = append(out.Chapters, Chapter{Title: title, HTML: html})
	}
	if len(out.Chapters) == 0 {
		return out, fmt.Errorf("%w : aucun chapitre lisible", ErrEpubInvalid)
	}
	return out, nil
}

func clampMeta(s string) string {
	s = strings.TrimSpace(s)
	if len([]rune(s)) > maxMetadataLength {
		s = string([]rune(s)[:maxMetadataLength])
	}
	return s
}

func mimeByExt(href string) string {
	switch strings.ToLower(path.Ext(href)) {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	default:
		return "application/octet-stream"
	}
}

// extractChapter extrait (titre, HTML strict) d'un XHTML : allowlist de
// balises, texte échappé, handlers/attributs TOUS jetés (on ne recopie
// jamais un attribut — pas de onerror, pas de style, pas de href).
// Règles simples et totales :
//   - dropping > 0 : tout est jeté (profondeur comptée, imbrications incluses) ;
//   - balise allowlistée : rendue (ouvrante + fermante appariées par pile) ;
//   - autre balise : aplatie (texte gardé, balise jetée) ;
//   - <head>/<title> : titre extrait, reste du head ignoré.
func extractChapter(raw []byte) (string, string) {
	decoder := xml.NewDecoder(bytes.NewReader(raw))
	decoder.Strict = false
	decoder.Entity = xml.HTMLEntity
	var title strings.Builder
	var body strings.Builder
	var stack []string
	var inTitle, inHead bool
	dropping := 0
	textLen := 0
	for {
		tok, err := decoder.Token()
		if err != nil {
			break
		}
		switch t := tok.(type) {
		case xml.StartElement:
			name := strings.ToLower(t.Name.Local)
			switch name {
			case "head":
				inHead = true
			case "title":
				if inHead {
					inTitle = true
				}
			}
			if dropping > 0 {
				dropping++
				continue
			}
			if droppedTags[name] {
				dropping = 1
				continue
			}
			if allowedTags[name] {
				if name == "br" {
					body.WriteString("<br>")
				} else {
					stack = append(stack, name)
					body.WriteString("<" + name + ">")
				}
			}
			// Sinon : aplatie (texte gardé plus bas, balise jetée).
		case xml.EndElement:
			name := strings.ToLower(t.Name.Local)
			if name == "head" {
				inHead = false
			}
			if name == "title" {
				inTitle = false
			}
			if dropping > 0 {
				dropping--
				continue
			}
			if len(stack) > 0 && stack[len(stack)-1] == name {
				stack = stack[:len(stack)-1]
				body.WriteString("</" + name + ">")
			}
			// Fin sans ouvrante appariée (ou aplatie) : ignorée.
		case xml.CharData:
			if inTitle {
				title.WriteString(string(t))
				continue
			}
			if dropping > 0 || inHead {
				continue
			}
			s := string(t)
			if textLen+len(s) > maxChapterText {
				s = s[:max(0, maxChapterText-textLen)]
			}
			textLen += len(s)
			body.WriteString(escapeText(s))
		}
	}
	return strings.TrimSpace(title.String()), strings.TrimSpace(body.String())
}

// stripTags retire les balises (test de vacuité des chapitres).
func stripTags(s string) string {
	var b strings.Builder
	in := false
	for _, r := range s {
		switch r {
		case '<':
			in = true
		case '>':
			in = false
		default:
			if !in {
				b.WriteRune(r)
			}
		}
	}
	return b.String()
}

// escapeText échappe le texte (jamais d'HTML auteur dans le stocké).
func escapeText(s string) string {
	r := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;")
	return r.Replace(s)
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
