package creator

import (
	"strings"
	"sync"

	md "github.com/JohannesKaufmann/html-to-markdown"
)

// Convertisseur HTML → Markdown partagé (thread-safe après création).
// Le contenu des articles est stocké en HTML côté éditeur ; l'API créateur
// l'expose en double format (contentHtml + contentMarkdown) pour que les
// fronts personnalisés choisissent leur moteur de rendu.
var (
	htmlToMdOnce sync.Once
	htmlToMd     *md.Converter
)

func htmlToMarkdown(html string) string {
	if strings.TrimSpace(html) == "" {
		return ""
	}
	htmlToMdOnce.Do(func() {
		htmlToMd = md.NewConverter("", true, nil)
	})
	out, err := htmlToMd.ConvertString(html)
	if err != nil {
		// Dégradation acceptable : on renvoie le HTML brut plutôt qu'une 500.
		return html
	}
	return out
}
