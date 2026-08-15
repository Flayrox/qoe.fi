// Package articles — normalisation du contenu (contrat créateurs).
//
// Le contrat accepte `contentFormat: "markdown" | "html"` (WordPress → HTML,
// Ghost/Payload → Markdown). Le format de stockage interne est TOUJOURS du
// HTML : le markdown est converti côté serveur (CommonMark, safe) avant écriture.
package articles

import (
	"bytes"

	"github.com/yuin/goldmark"
)

// ContentFormats valides du contrat (voir docs/openapi/creators-api.yaml).
const (
	ContentFormatMarkdown = "markdown"
	ContentFormatHTML     = "html"
)

// IsValidContentFormat vérifie qu'un contentFormat est accepté.
// Chaîne vide = html (comportement historique).
func IsValidContentFormat(format string) bool {
	switch format {
	case "", ContentFormatHTML, ContentFormatMarkdown:
		return true
	}
	return false
}

// NormalizeContent convertit le contenu vers le format interne (HTML).
//   - "markdown" → HTML CommonMark, raw HTML échappé (safe par défaut goldmark) ;
//   - "html" / ""  → contenu tel quel (comportement historique).
func NormalizeContent(content, format string) string {
	if format != ContentFormatMarkdown {
		return content
	}
	var buf bytes.Buffer
	if err := goldmark.Convert([]byte(content), &buf); err != nil {
		return content
	}
	return buf.String()
}
