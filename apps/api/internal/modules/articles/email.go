package articles

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"html"
	"net/url"
	"os"
	"regexp"
	"strings"

	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
)

// RenderedArticleEmail contient les métadonnées et le corps HTML rendu d'un email de parution.
type RenderedArticleEmail struct {
	FromName        string
	Subject         string
	HTML            string
	ListUnsubscribe string
	PreviewText     string
}

// SignUnsubscribe génère une signature cryptographique HMAC-SHA256 infalsifiable pour la désinscription.
func SignUnsubscribe(pubID, email string) string {
	secret := os.Getenv("NEWSLETTER_UNSUB_SECRET")
	if secret == "" {
		secret = "qoe-unsub-default-secret-min32chars"
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(pubID + ":" + strings.ToLower(strings.TrimSpace(email))))
	return hex.EncodeToString(mac.Sum(nil))
}

// VerifyUnsubscribe valide de manière timing-safe (crypto/subtle) la signature de désinscription RFC 8058.
func VerifyUnsubscribe(pubID, email, sig string) bool {
	if pubID == "" || email == "" || sig == "" {
		return false
	}
	expected := SignUnsubscribe(pubID, email)
	return subtle.ConstantTimeCompare([]byte(expected), []byte(sig)) == 1
}

// unsubscribeBaseURL est la racine des liens de désinscription (et de
// confirmation, même hôte). QOE_CONFIRM_BASE_URL surcharge en self-host /
// staging — sans elle, un email parti d'un environnement local pointerait
// vers la production.
func unsubscribeBaseURL() string {
	if v := strings.TrimSpace(os.Getenv("QOE_CONFIRM_BASE_URL")); v != "" {
		return strings.TrimRight(v, "/")
	}
	return "https://api.qoe.fi"
}

// BuildUnsubURL construit le lien de désinscription RFC 8058 One-Click.
func BuildUnsubURL(pubID, email string) string {
	sig := SignUnsubscribe(pubID, email)
	return fmt.Sprintf("%s/v1/newsletters/unsubscribe?pub=%s&email=%s&sig=%s",
		unsubscribeBaseURL(), url.QueryEscape(pubID), url.QueryEscape(email), sig)
}

// TruncateRunes coupe un texte à max caractères sans séparer un rune UTF-8.
// `preview[:140]` sur un texte accentué produit un octet invalide dans le
// preheader (« é » coupé en deux) : le client mail affiche alors un caractère
// de remplacement.
func TruncateRunes(s string, max int) string {
	if max <= 0 {
		return ""
	}
	runes := []rune(s)
	if len(runes) <= max {
		return s
	}
	return strings.TrimSpace(string(runes[:max])) + "…"
}

// PublicationPublicURL calcule l'URL racine d'un média.
func PublisherPublicURL(subdomain, customDomain pgtype.Text) string {
	if customDomain.Valid && customDomain.String != "" {
		return "https://" + customDomain.String
	}
	if subdomain.Valid && subdomain.String != "" {
		return fmt.Sprintf("https://%s.qoe.fi", subdomain.String)
	}
	return "https://qoe.fi"
}

// ArticlePublicURL construit l'URL publique d'un article.
func ArticlePublicURL(subdomain, customDomain pgtype.Text, slug string) string {
	if customDomain.Valid && customDomain.String != "" {
		return "https://" + customDomain.String + "/" + url.PathEscape(slug)
	}
	if subdomain.Valid && subdomain.String != "" {
		return fmt.Sprintf("https://%s.qoe.fi/%s", subdomain.String, url.PathEscape(slug))
	}
	return "https://qoe.fi/p/" + url.PathEscape(slug)
}

// RenderEmailLayout compose un template HTML responsive haute délivrabilité (Dark/Light mode).
func RenderEmailLayout(pubName, pubLogoURL, pubURL, preheader, subject, bodyHTML, unsubURL, webLink string) string {
	// Tout ce qui vient du créateur est du TEXTE qui entre dans du HTML : il
	// doit être échappé (un nom de publication « R&D <3 » casserait sinon
	// l'en-tête). Le corps (bodyHTML) reste du HTML assumé.
	pubName = html.EscapeString(pubName)
	pubLogoURL = html.EscapeString(pubLogoURL)
	pubURL = html.EscapeString(pubURL)
	preheader = html.EscapeString(preheader)
	subject = html.EscapeString(subject)
	unsubURL = html.EscapeString(unsubURL)
	webLink = html.EscapeString(webLink)

	logoHTML := ""
	if pubLogoURL != "" {
		logoHTML = fmt.Sprintf(`<img src="%s" alt="%s" width="48" height="48" style="border-radius:10px;object-fit:cover;display:block;margin-bottom:12px;" />`, pubLogoURL, pubName)
	}

	webLinkHTML := ""
	if webLink != "" {
		webLinkHTML = fmt.Sprintf(` · <a href="%s" style="color:#71717a;text-decoration:underline;">Afficher dans le navigateur</a>`, webLink)
	}

	return fmt.Sprintf(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>%s</title>
  <style>
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    body { margin: 0; padding: 0; -webkit-text-size-adjust: 100%%; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    .email-container { max-width: 600px; margin: 24px auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e4e4e7; }
    .email-header { padding: 32px 36px 20px; border-bottom: 1px solid #f4f4f5; }
    .email-body { padding: 32px 36px; color: #18181b; font-size: 16px; line-height: 1.7; }
    .email-body h1 { font-size: 24px; font-weight: 800; line-height: 1.25; margin: 0 0 16px; color: #09090b; letter-spacing: -0.02em; }
    .email-body h2 { font-size: 20px; font-weight: 700; margin: 24px 0 12px; color: #09090b; }
    .email-body p { margin: 0 0 18px; color: #27272a; }
    .email-body img { max-width: 100%%; height: auto; border-radius: 8px; margin: 16px 0; }
    .email-body blockquote { border-left: 3px solid #18181b; margin: 20px 0; padding-left: 18px; font-style: italic; color: #52525b; }
    .email-footer { padding: 24px 36px; border-top: 1px solid #f4f4f5; font-size: 13px; color: #71717a; line-height: 1.6; background-color: #fafafa; }
    @media (prefers-color-scheme: dark) {
      body { background-color: #09090b !important; }
      .email-container { background: #121215 !important; border-color: #27272a !important; }
      .email-header { border-bottom-color: #27272a !important; }
      .email-body { color: #d4d4d8 !important; }
      .email-body h1, .email-body h2 { color: #f4f4f5 !important; }
      .email-body p { color: #d4d4d8 !important; }
      .email-body blockquote { border-left-color: #f4f4f5 !important; color: #a1a1aa !important; }
      .email-footer { background-color: #0c0c0e !important; border-top-color: #27272a !important; color: #a1a1aa !important; }
    }
  </style>
</head>
<body>
  <!-- Preheader caché RFC compliant -->
  <div style="display:none;font-size:1px;color:#f4f4f5;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    %s
  </div>

  <div class="email-container">
    <div class="email-header">
      %s
      <a href="%s" style="font-size:14px;font-weight:700;letter-spacing:-0.01em;text-decoration:none;color:#18181b;">%s</a>
    </div>
    <div class="email-body">
      %s
    </div>
    <div class="email-footer">
      <p style="margin:0 0 6px;">
        Cet e-mail a été envoyé par <strong>%s</strong>.
      </p>
      <p style="margin:0;">
        <a href="%s" style="color:#71717a;text-decoration:underline;">Se désabonner</a>%s
      </p>
    </div>
  </div>
</body>
</html>`,
		subject,
		preheader,
		logoHTML,
		pubURL,
		pubName,
		bodyHTML,
		pubName,
		unsubURL,
		webLinkHTML,
	)
}

// StripHTML enlève les balises et compresse les espaces pour un aperçu texte propre.
func StripHTML(html string) string {
	re := regexp.MustCompile(`<[^>]*>`)
	text := re.ReplaceAllString(html, " ")
	spaces := regexp.MustCompile(`\s+`)
	return strings.TrimSpace(spaces.ReplaceAllString(text, " "))
}

// BuildArticleReleaseEmail compose l'email de parution d'un article façon Substack :
// titre, contenu complet formaté pour email ou teaser + CTA paywall si article premium.
func BuildArticleReleaseEmail(info db.GetArticleReleaseInfoRow, link, email string) RenderedArticleEmail {
	pubName := info.PublisherName
	pubURL := PublisherPublicURL(info.Subdomain, info.CustomDomain)
	unsub := BuildUnsubURL(info.PublisherId, email)

	subject := info.Title
	if info.EmailSubject.Valid && strings.TrimSpace(info.EmailSubject.String) != "" {
		subject = info.EmailSubject.String
	}

	body := fmt.Sprintf(`<h1 style="margin:0 0 20px;font-size:26px;line-height:1.25;color:#09090b;font-weight:700;">%s</h1>`, html.EscapeString(info.Title))

	if !info.IsPremium {
		// Article gratuit : distribution intégrale du contenu façon Substack
		articleHTML := strings.TrimSpace(info.Content)
		if articleHTML != "" {
			body += fmt.Sprintf(`<div style="color:#27272a;line-height:1.75;font-size:16px;">%s</div>`, articleHTML)
		}
		body += fmt.Sprintf(`<div style="margin:36px 0 16px;text-align:center;"><a href="%s" style="display:inline-block;background:#09090b;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;">Lire l'article sur %s →</a></div>`, html.EscapeString(link), html.EscapeString(pubName))
	} else {
		// Article premium : découpage Zero-Leak côté serveur
		// Si un marqueur <!--qoe-paywall--> est présent, on affiche le teaser pré-paywall.
		// Si aucun marqueur n'est présent, zéro contenu payant n'est exposé par email.
		if strings.Contains(info.Content, "<!--qoe-paywall-->") {
			parts := strings.SplitN(info.Content, "<!--qoe-paywall-->", 2)
			teaser := strings.TrimSpace(parts[0])
			if teaser != "" {
				body += fmt.Sprintf(`<div style="color:#27272a;line-height:1.75;font-size:16px;">%s</div>`, teaser)
			}
		}
		body += fmt.Sprintf(`
<div style="margin:28px 0;padding:24px;background:#f8f9fa;border-radius:12px;text-align:center;border:1px solid #e4e4e7;">
  <p style="margin:0 0 8px;font-weight:700;color:#18181b;font-size:16px;">Cet article est réservé aux abonnés payants</p>
  <p style="margin:0 0 20px;color:#71717a;font-size:14px;line-height:1.5;">Pour lire l'intégralité et soutenir %s, rejoignez les membres Premium.</p>
  <a href="%s" style="display:inline-block;background:#09090b;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;">Lire l'article sur %s →</a>
</div>`, html.EscapeString(pubName), html.EscapeString(link), html.EscapeString(pubName))
	}

	preview := ""
	if info.EmailPreviewText.Valid && strings.TrimSpace(info.EmailPreviewText.String) != "" {
		preview = info.EmailPreviewText.String
	} else if info.IsPremium {
		if strings.Contains(info.Content, "<!--qoe-paywall-->") {
			parts := strings.SplitN(info.Content, "<!--qoe-paywall-->", 2)
			preview = TruncateRunes(StripHTML(parts[0]), 140)
		}
		if preview == "" {
			preview = "Nouvel article réservé aux abonnés : " + info.Title
		}
	} else {
		preview = TruncateRunes(StripHTML(info.Content), 140)
		if preview == "" {
			preview = "Nouvel article : " + info.Title
		}
	}

	html := RenderEmailLayout(pubName, "", pubURL, preview, subject, body, unsub, link)

	return RenderedArticleEmail{
		FromName:        pubName,
		Subject:         subject,
		HTML:            html,
		ListUnsubscribe: unsub,
		PreviewText:     preview,
	}
}
