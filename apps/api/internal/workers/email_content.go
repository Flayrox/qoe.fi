package workers

// =====================================================================
// 🎨 email_content.go — moteur de contenu des emails transactionnels
// =====================================================================
// Trois piliers, branchés sur les emails double opt-in (confirm) et
// bienvenue (welcome) :
//
//  1. i18n — la langue de chaque email est celle de l'abonné
//     (Subscriber.locale, captée à l'inscription via ?locale= /
//     Accept-Language, défaut « fr »). Tous les libellés plateforme
//     existent en FR et EN ; NormalizeEmailLocale borne à ces deux
//     locales.
//
//  2. Personnalisation par publication — Publication.emailSettings
//     (JSONB, édité via PATCH /v1/settings/email) permet au créateur de
//     choisir nom d'expéditeur, sujets, preheaders, couleur d'accent,
//     logo, reply-to, note de pied de page et corps du bienvenue, et
//     d'activer/couper l'email de bienvenue. ParseEmailPrefs applique
//     des bornes strictes : toute valeur invalide est ignorée, jamais
//     bloquante (un JSON corrompu ne casse pas un envoi).
//
//  3. Délivrabilité — coquille multipart texte+HTML (note SpamAssassin
//     MultipartMessageNeeded, bonus Boîte aux lettres mobile), preheader
//     d'aperçu, bouton en couleur d'accent contrastée, lien de
//     désabonnement visible, en-têtes List-Id / X-Entity-Ref-ID. Le
//     transport (en-têtes RFC 5322, List-Unsubscribe One-Click) reste
//     dans email_provider.go.

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"html"
	"net/url"
	"regexp"
	"strings"
)

// ── Templates et locales ─────────────────────────────────────────────

// Identifiants des templates d'emails d'abonné (clés des overrides créateur).
const (
	EmailTemplateConfirm = "confirm"
	EmailTemplateWelcome = "welcome"
)

// NormalizeEmailLocale borne la locale aux deux langues supportées des
// emails transactionnels (« fr » par défaut, « en » accepté).
func NormalizeEmailLocale(raw string) string {
	lang := strings.ToLower(strings.TrimSpace(raw))
	if i := strings.IndexAny(lang, "-_"); i > 0 {
		lang = lang[:i]
	}
	if lang == "en" {
		return "en"
	}
	return "fr"
}

// T choisit le libellé selon la locale de l'abonné (défaut français).
func T(locale, fr, en string) string {
	if locale == "en" {
		return en
	}
	return fr
}

// ── Réglages par publication (Publication.emailSettings) ─────────────

const (
	maxEmailFromNameLen   = 60
	maxEmailSubjectLen    = 120
	maxEmailPreheaderLen  = 140
	maxEmailFooterNoteLen = 200
	maxEmailBodyLen       = 2000
	maxEmailURLLen        = 500
)

// EmailPrefs est la personnalisation email d'une publication (JSONB
// emailSettings). Tout est optionnel : absent = défauts plateforme
// localisés.
type EmailPrefs struct {
	FromName       string            `json:"fromName,omitempty"`       // nom d'expéditeur affiché
	ReplyTo        string            `json:"replyTo,omitempty"`        // adresse de réponse
	AccentColor    string            `json:"accentColor,omitempty"`    // couleur des boutons (#rgb/#rrggbb)
	LogoURL        string            `json:"logoUrl,omitempty"`        // logo en en-tête (http(s))
	Subjects       map[string]string `json:"subjects,omitempty"`       // sujet par template
	Preheaders     map[string]string `json:"preheaders,omitempty"`     // texte d'aperçu par template
	FooterNote     string            `json:"footerNote,omitempty"`     // note créateur en pied de page
	WelcomeEnabled *bool             `json:"welcomeEnabled,omitempty"` // nil = activé
	WelcomeBodyFR  string            `json:"welcomeBodyFr,omitempty"`  // corps du bienvenue (fr)
	WelcomeBodyEN  string            `json:"welcomeBodyEn,omitempty"`  // corps du bienvenue (en)
}

var (
	emailAccentRe = regexp.MustCompile(`^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$`)
	listIDLabelRe = regexp.MustCompile(`[^a-z0-9]+`)
)

// shortHash donne un identifiant court (12 hex) pour X-Entity-Ref-ID.
func shortHash(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:6])
}

// listIDFor compose un List-Id ASCII conforme (label « slugifié » + domaine
// d'envoi), ex. « la-gazette.qoe.fi ».
func listIDFor(pubName string) string {
	label := strings.Trim(listIDLabelRe.ReplaceAllString(strings.ToLower(pubName), "-"), "-")
	if label == "" {
		label = "subscribers"
	}
	return label + ".qoe.fi"
}

// clampString borne la longueur (en runes) et assainit une chaîne de
// personnalisation.
func clampString(s string, max int) string {
	s = strings.TrimSpace(s)
	r := []rune(s)
	if len(r) > max {
		r = r[:max]
	}
	return strings.TrimSpace(string(r))
}

// safeEmailURL n'accepte qu'une URL http(s) absolue (jamais javascript:).
func safeEmailURL(raw string) string {
	u := clampString(raw, maxEmailURLLen)
	if u == "" {
		return ""
	}
	parsed, err := url.Parse(u)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return ""
	}
	return u
}

// safeEmailReplyTo n'accepte qu'une adresse email nue (sans display name).
func safeEmailReplyTo(raw string) string {
	s := clampString(raw, 254)
	if s == "" || strings.ContainsAny(s, " \t\r\n<>,\"") {
		return ""
	}
	parts := strings.SplitN(s, "@", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" || !strings.Contains(parts[1], ".") {
		return ""
	}
	return s
}

// safeAccent n'accepte qu'un hex #rgb ou #rrggbb.
func safeAccent(raw string) string {
	s := clampString(raw, 7)
	if s != "" && emailAccentRe.MatchString(s) {
		return strings.ToLower(s)
	}
	return ""
}

func clampLocaleMap(m map[string]string, max int) map[string]string {
	if m == nil {
		return nil
	}
	out := make(map[string]string, 6)
	// Clés par template (« confirm ») et par template+locale (« confirm.fr ») :
	// l'override localisé prime sur l'override générique (voir resolvers).
	for _, k := range []string{
		EmailTemplateConfirm, EmailTemplateWelcome,
		EmailTemplateConfirm + ".fr", EmailTemplateConfirm + ".en",
		EmailTemplateWelcome + ".fr", EmailTemplateWelcome + ".en",
	} {
		if v := clampString(m[k], max); v != "" {
			out[k] = v
		}
	}
	return out
}

// subjectFor résout un sujet par template avec priorité locale :
// Subjects[template.locale] > Subjects[template] > défaut localisé.
func subjectFor(prefs EmailPrefs, template, locale, defFR, defEN string) string {
	if s := prefs.Subjects[template+"."+locale]; s != "" {
		return s
	}
	if s := prefs.Subjects[template]; s != "" {
		return s
	}
	return T(locale, defFR, defEN)
}

// preheaderFor résout un texte d'aperçu par template avec priorité locale :
// Preheaders[template.locale] > Preheaders[template] > défaut localisé.
func preheaderFor(prefs EmailPrefs, template, locale, defFR, defEN string) string {
	if s := prefs.Preheaders[template+"."+locale]; s != "" {
		return s
	}
	if s := prefs.Preheaders[template]; s != "" {
		return s
	}
	return T(locale, defFR, defEN)
}

// ParseEmailPrefs décode et assainit les réglages email d'une publication.
// Tolérant aux pannes : JSON invalide ou valeurs aberrantes → défauts.
func ParseEmailPrefs(raw []byte) EmailPrefs {
	var p EmailPrefs
	if len(raw) == 0 {
		return p
	}
	if err := json.Unmarshal(raw, &p); err != nil {
		return EmailPrefs{}
	}
	p.FromName = clampString(p.FromName, maxEmailFromNameLen)
	p.ReplyTo = safeEmailReplyTo(p.ReplyTo)
	p.FooterNote = clampString(p.FooterNote, maxEmailFooterNoteLen)
	p.WelcomeBodyFR = clampString(p.WelcomeBodyFR, maxEmailBodyLen)
	p.WelcomeBodyEN = clampString(p.WelcomeBodyEN, maxEmailBodyLen)
	p.AccentColor = safeAccent(p.AccentColor)
	p.LogoURL = safeEmailURL(p.LogoURL)
	p.Subjects = clampLocaleMap(p.Subjects, maxEmailSubjectLen)
	p.Preheaders = clampLocaleMap(p.Preheaders, maxEmailPreheaderLen)
	return p
}

// ── Résolution : réglages × locale de l'abonné ───────────────────────

// CustomizedEmail est la personnalisation résolue pour UN email envoyé à UN
// abonné (réglages de la publication × langue de l'abonné).
type CustomizedEmail struct {
	Locale     string
	FromName   string // nom d'expéditeur (réglage > nom de publication)
	ReplyTo    string
	Accent     string // couleur bouton ("" = défaut coquille)
	LogoURL    string
	FooterNote string
	// Subject résout le sujet : override créateur > défaut localisé.
	Subject func(template, defaultFR, defaultEN string) string
	// Preheader résout le texte d'aperçu : override créateur > défaut localisé.
	Preheader func(template, defaultFR, defaultEN string) string
	// WelcomeBody est le corps personnalisé du bienvenue ("" = défaut).
	WelcomeBody string
	// WelcomeDisabled : le créateur a coupé l'email de bienvenue.
	WelcomeDisabled bool
}

// ResolveCustomization croise les réglages de la publication avec la langue
// de l'abonné. locale doit déjà passer NormalizeEmailLocale.
func ResolveCustomization(prefs EmailPrefs, locale string) CustomizedEmail {
	c := CustomizedEmail{
		Locale:          locale,
		FromName:        prefs.FromName,
		ReplyTo:         prefs.ReplyTo,
		Accent:          prefs.AccentColor,
		LogoURL:         prefs.LogoURL,
		FooterNote:      prefs.FooterNote,
		WelcomeBody:     T(locale, prefs.WelcomeBodyFR, prefs.WelcomeBodyEN),
		WelcomeDisabled: prefs.WelcomeEnabled != nil && !*prefs.WelcomeEnabled,
	}
	c.Subject = func(template, defaultFR, defaultEN string) string {
		if s := prefs.Subjects[template]; s != "" {
			return s
		}
		return T(locale, defaultFR, defaultEN)
	}
	c.Preheader = func(template, defaultFR, defaultEN string) string {
		if s := prefs.Preheaders[template]; s != "" {
			return s
		}
		return T(locale, defaultFR, defaultEN)
	}
	return c
}

// ── Résolution des sujets/preheaders d'un email d'abonné ─────────────

// ConfirmSubject résout le sujet de l'email de confirmation : override
// créateur (Subjects[confirm]) > défaut localisé. Partagé par le worker
// (envoi réel) et l'endpoint de prévisualisation du studio — une seule
// source de vérité pour le rendu.
func ConfirmSubject(prefs EmailPrefs, locale, pubName string) string {
	return subjectFor(prefs, EmailTemplateConfirm, locale,
		"Confirmez votre abonnement — "+pubName,
		"Confirm your subscription — "+pubName)
}

// ConfirmPreheader résout le texte d'aperçu de l'email de confirmation.
func ConfirmPreheader(prefs EmailPrefs, locale, pubName string) string {
	return preheaderFor(prefs, EmailTemplateConfirm, locale,
		"Confirmez votre inscription à la newsletter de "+pubName+".",
		"Confirm your subscription to "+pubName+".")
}

// WelcomeSubject résout le sujet de l'email de bienvenue : override
// créateur (Subjects[welcome]) > défaut localisé.
func WelcomeSubject(prefs EmailPrefs, locale, pubName string) string {
	return subjectFor(prefs, EmailTemplateWelcome, locale,
		"Bienvenue chez "+pubName,
		"Welcome to "+pubName)
}

// WelcomePreheader résout le texte d'aperçu de l'email de bienvenue.
func WelcomePreheader(prefs EmailPrefs, locale, pubName string) string {
	return preheaderFor(prefs, EmailTemplateWelcome, locale,
		"Votre abonnement est confirmé — bienvenue !",
		"Your subscription is confirmed — welcome!")
}

// WelcomeBody resolves the welcome body: creator override (locale
// matching) else localized default. Shared by the welcome worker and the
// studio preview endpoint.
func WelcomeBody(prefs EmailPrefs, locale, pubName string) string {
	body := T(locale, prefs.WelcomeBodyFR, prefs.WelcomeBodyEN)
	if body == "" {
		body = T(locale,
			"Votre inscription à la newsletter de "+pubName+" est confirmée. À très vite !",
			"Your subscription to "+pubName+" is confirmed. See you soon!")
	}
	return body
}

// ── Coquille d'email transactionnel (HTML + texte) ───────────────────

// ShellInput décrit un email d'abonné à rendre (confirm, welcome).
// Sauf BodyHTML (assemblé par l'appelant avec paragraphes déjà échappés),
// toute valeur textuelle est échappée ICI : la coquille est responsable de
// l'échappement, les appelants passent du texte brut.
type ShellInput struct {
	Locale      string
	Preheader   string // texte d'aperçu (boîte de réception)
	Title       string
	BodyHTML    string // paragraphes déjà échappés par l'appelant
	CTALabel    string
	CTAURL      string
	Accent      string // couleur bouton (défaut : gris plateforme)
	LogoURL     string // "" → pastille avec l'initiale
	PubName     string // texte brut, échappé par la coquille
	PubURL      string
	UnsubURL    string // lien visible en pied de page ("" si sans désabonnement)
	UnsubLabel  string // libellé localisé du lien
	ConsentLine string // mention localisée (« vous recevez cet email car… »)
	FooterNote  string // note créateur (assainie en amont)
}

const emailFontStack = `-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',Roboto,sans-serif`

// defaultEmailAccent est la couleur plateforme quand le créateur n'a rien
// choisi (gris quasi-noir, contraste maximal).
const defaultEmailAccent = "#111827"

// RenderTransactionEmail rend la coquille multipart (texte + HTML) d'un
// email d'abonné : sobre (aucune police monospace), contrastes élevés,
// responsive, compatible Outlook (tables + largeur fixe).
func RenderTransactionEmail(in ShellInput) (htmlPart, textPart string) {
	accent := in.Accent
	if !emailAccentRe.MatchString(accent) {
		accent = defaultEmailAccent
	}

	escPub := html.EscapeString(in.PubName)
	logoHTML := ""
	if in.LogoURL != "" {
		logoHTML = `<img src="` + html.EscapeString(in.LogoURL) + `" width="44" height="44" alt="" style="border-radius:12px;display:block;margin:0 auto;" />`
	} else {
		initial := "•"
		if in.PubName != "" {
			initial = strings.ToUpper(string([]rune(in.PubName)[0:1]))
		}
		logoHTML = `<div style="width:44px;height:44px;background:#f4f4f5;border:1px solid #e4e4e7;border-radius:12px;display:flex;align-items:center;justify-content:center;margin:0 auto;font-size:19px;font-weight:600;color:` + accent + `;font-family:` + emailFontStack + `;">` + html.EscapeString(initial) + `</div>`
	}

	pubLinkHTML := ""
	if in.PubURL != "" && in.PubName != "" {
		pubLinkHTML = `<a href="` + html.EscapeString(in.PubURL) + `" style="color:#71717a;text-decoration:underline;">` + escPub + `</a>`
	} else {
		pubLinkHTML = escPub
	}

	ctaHTML := ""
	if in.CTAURL != "" && in.CTALabel != "" {
		ctaHTML = `<tr><td style="padding:4px 36px 12px;text-align:center;">
<a href="` + html.EscapeString(in.CTAURL) + `" style="display:inline-block;background:` + accent + `;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;padding:12px 30px;border-radius:9999px;font-family:` + emailFontStack + `;">` + html.EscapeString(in.CTALabel) + `</a>
</td></tr>`
	}

	unsubHTML := ""
	if in.UnsubURL != "" {
		unsubHTML = `<br><a href="` + html.EscapeString(in.UnsubURL) + `" style="color:#a1a1aa;text-decoration:underline;">` + html.EscapeString(in.UnsubLabel) + `</a>`
	}
	footerNoteHTML := ""
	if in.FooterNote != "" {
		footerNoteHTML = `<br>` + html.EscapeString(in.FooterNote)
	}

	htmlPart = `<!DOCTYPE html><html lang="` + html.EscapeString(in.Locale) + `"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>` + html.EscapeString(in.Title) + `</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">` + html.EscapeString(in.Preheader) + `&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border:1px solid #e4e4e7;border-radius:16px;overflow:hidden;">
<tr><td style="padding:40px 36px 4px;text-align:center;">` + logoHTML + `</td></tr>
<tr><td style="padding:14px 36px 0;text-align:center;">
<h1 style="font-size:20px;font-weight:600;color:#111827;margin:0 0 12px;letter-spacing:-0.01em;font-family:` + emailFontStack + `;">` + in.Title + `</h1>
</td></tr>
<tr><td style="padding:0 36px 8px;text-align:center;font-size:14px;line-height:1.65;color:#52525b;font-family:` + emailFontStack + `;">` + in.BodyHTML + `</td></tr>` +
		ctaHTML + `
<tr><td style="padding:16px 36px 32px;">
<div style="border-top:1px solid #f4f4f5;padding-top:20px;font-size:11px;line-height:1.7;color:#a1a1aa;text-align:center;font-family:` + emailFontStack + `;">
` + html.EscapeString(in.ConsentLine) + `<br>` + footerNoteHTML + `
` + pubLinkHTML + unsubHTML + `
</div>
</td></tr>
</table>
</td></tr></table>
</body></html>`

	textPart = renderTransactionText(in)
	return htmlPart, textPart
}

// renderTransactionText compose l'alternative texte brut (lecture sans
// images, lecteurs texte, note délivrabilité).
func renderTransactionText(in ShellInput) string {
	var b strings.Builder
	b.WriteString(in.Title)
	b.WriteString("\n\n")
	b.WriteString(stripHTML(in.BodyHTML))
	b.WriteString("\n\n")
	if in.CTAURL != "" {
		if in.CTALabel != "" {
			b.WriteString(in.CTALabel)
			b.WriteString(" :\n")
		}
		b.WriteString(in.CTAURL)
		b.WriteString("\n\n")
	}
	if in.ConsentLine != "" {
		b.WriteString(in.ConsentLine)
		b.WriteString("\n")
	}
	if in.FooterNote != "" {
		b.WriteString(in.FooterNote)
		b.WriteString("\n")
	}
	if in.PubURL != "" && in.PubName != "" {
		b.WriteString(in.PubName)
		b.WriteString(" : ")
		b.WriteString(in.PubURL)
		b.WriteString("\n")
	} else if in.PubName != "" {
		b.WriteString(in.PubName)
		b.WriteString("\n")
	}
	if in.UnsubURL != "" && in.UnsubLabel != "" {
		b.WriteString(in.UnsubLabel)
		b.WriteString(" : ")
		b.WriteString(in.UnsubURL)
		b.WriteString("\n")
	}
	return strings.TrimRight(b.String(), "\n")
}
