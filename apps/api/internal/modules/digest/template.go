// Rendu de l'aperçu — HTML simple, lisible dans tous les clients mail.
package digest

import (
	"fmt"
	"html"
	"strings"
	"time"
)

// Subject compose l'objet de l'email.
func Subject(publisherName string, articles []Article) string {
	name := strings.TrimSpace(publisherName)
	if name == "" {
		name = "Votre publication"
	}
	if len(articles) == 0 {
		return name + " — récapitulatif"
	}
	return name + " — " + fmt.Sprintf("%d lecture(s) de la semaine", len(articles))
}

// RenderPreview produit un HTML autonome (aucune ressource externe).
func RenderPreview(publisherName string, cfg Config, articles []Article, origin string) string {
	name := html.EscapeString(strings.TrimSpace(publisherName))
	if name == "" {
		name = "Votre publication"
	}
	var b strings.Builder
	b.WriteString(`<!doctype html><html lang="fr"><body style="margin:0;padding:24px;background:#f6f6f7;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111827;">`)
	b.WriteString(`<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px;">`)
	b.WriteString(`<p style="margin:0 0 6px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#6b7280;">Récapitulatif</p>`)
	b.WriteString(`<h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;">` + name + `</h1>`)

	if strings.TrimSpace(cfg.Intro) != "" {
		b.WriteString(`<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#374151;">` +
			html.EscapeString(cfg.Intro) + `</p>`)
	}

	if len(articles) == 0 {
		b.WriteString(`<p style="margin:0;font-size:14px;color:#6b7280;">Aucun article publié sur la période : l’aperçu restera vide tant qu’il n’y a rien à envoyer.</p>`)
	}

	for _, article := range articles {
		href := origin + "/" + strings.TrimPrefix(article.Slug, "/")
		b.WriteString(`<div style="padding:16px 0;border-top:1px solid #e5e7eb;">`)
		b.WriteString(`<a href="` + html.EscapeString(href) + `" style="font-size:16px;font-weight:600;color:#111827;text-decoration:none;">` +
			html.EscapeString(article.Title) + `</a>`)
		if article.Excerpt != "" {
			b.WriteString(`<p style="margin:6px 0 0;font-size:13px;line-height:1.6;color:#4b5563;">` +
				html.EscapeString(article.Excerpt) + `</p>`)
		}
		if !article.CreatedAt.IsZero() {
			b.WriteString(`<p style="margin:6px 0 0;font-size:11px;color:#9ca3af;">` +
				article.CreatedAt.UTC().Format("02/01/2006") + `</p>`)
		}
		b.WriteString(`</div>`)
	}

	b.WriteString(`<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Envoyé par ` + name +
		` via qoe.fi · ` + time.Now().UTC().Format("02/01/2006") + `</p>`)
	b.WriteString(`</div></body></html>`)
	return b.String()
}
