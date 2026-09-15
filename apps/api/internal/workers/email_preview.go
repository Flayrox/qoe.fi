package workers

// =====================================================================
// 👁️ email_preview.go — cœur de rendu unique des emails d'abonné
// =====================================================================
// Un seul chemin de rendu pour DEUX consommateurs :
//   - les workers (confirm_email.go, welcome_email.go) qui envoient les
//     vrais emails aux abonnés ;
//   - l'endpoint de prévisualisation du studio
//     (POST /v1/settings/email/preview) qui montre au créateur, dans le
//     panneau de personnalisation, exactement ce que ses abonnés
//     recevront — même coquille, mêmes résolutions de sujet/preheader,
//     même personnalisation. Aucune divergence possible.
//
// PreviewSubscriberEmail ne touche ni la base ni le réseau : il rend un
// SubscriberEmailSpec en EmailMessage prêt à l'emploi (sujet, HTML,
// texte, en-têtes). C'est la fonction qu'appelle le studio.

import (
	"fmt"
	"html"

	"github.com/jackc/pgx/v5/pgtype"
)

// PublicationPublicURL calcule l'URL racine publique d'une publication
// (domaine personnalisé > sous-domaine > plateforme). Exporté pour le
// module settings (prévisualisation).
func PublicationPublicURL(subdomain, customDomain pgtype.Text) string {
	return publicationPublicURL(subdomain, customDomain)
}

// PubAccentColor extrait la couleur d'accent d'une publication (pgtype
// Text, "" si NULL) — fallback du rendu quand emailSettings n'en fixe pas.
func PubAccentColor(t pgtype.Text) string {
	if t.Valid {
		return t.String
	}
	return ""
}

// PubLogoURL extrait l'URL du logo d'une publication (pgtype Text, "" si
// NULL).
func PubLogoURL(t pgtype.Text) string {
	if t.Valid {
		return t.String
	}
	return ""
}

// localizedPublicationName borne le nom de publication (vide → libellé
// localisé « la publication » pour les phrases).
func localizedPublicationName(locale, rawName string) string {
	if rawName != "" {
		return rawName
	}
	return T(locale, "la publication", "the publication")
}

// SubscriberEmailSpec décrit un email d'abonné à rendre : quel template
// (confirm ou welcome), pour quelle publication, dans quelle langue, avec
// quelles personnalisation et identité de publication. Toutes les valeurs
// textuelles sont BRUTES : le rendu les échappe (contrat ShellInput).
type SubscriberEmailSpec struct {
	Template string // EmailTemplateConfirm | EmailTemplateWelcome
	Locale   string // déjà normalisée (NormalizeEmailLocale)
	Email    string // destinataire (X-Entity-Ref-ID + affichage aperçu)
	PubID    string // id de publication (lien de confirmation signé)
	PubName  string // nom de publication (brut)
	PubURL   string // URL publique de la publication
	Accent   string // couleur de la publication ("" → défaut coquille)
	LogoURL  string // logo de la publication ("" → pastille initiale)
}

// subscriberEmailContent est le contenu localisé + personnalisé résolu
// d'un email d'abonné (partagé par les deux workers et l'aperçu).
type subscriberEmailContent struct {
	locale     string
	pubName    string
	pubURL     string
	fromName   string
	replyTo    string
	accent     string
	logo       string
	preheader  string
	title      string
	body       []string
	ctaLabel   string
	ctaURL     string
	consent    string
	footerNote string
}

// buildContent résout le contenu du template demandé à partir des réglages
// et de l'identité de la publication. La personnalisation prime toujours
// sur l'identité (réglages emailSettings > colonnes Publication > défauts).
func buildContent(spec SubscriberEmailSpec, prefs EmailPrefs) subscriberEmailContent {
	locale := spec.Locale
	pubName := localizedPublicationName(locale, spec.PubName)

	c := subscriberEmailContent{
		locale:     locale,
		pubName:    pubName,
		pubURL:     spec.PubURL,
		fromName:   prefs.FromName,
		replyTo:    prefs.ReplyTo,
		footerNote: prefs.FooterNote,
	}
	// Couleur/logo : réglages email > identité de la publication.
	c.accent = prefs.AccentColor
	if c.accent == "" {
		c.accent = spec.Accent
	}
	c.logo = prefs.LogoURL
	if c.logo == "" {
		c.logo = spec.LogoURL
	}

	switch spec.Template {
	case EmailTemplateWelcome:
		c.title = WelcomeSubject(prefs, locale, pubName)
		c.preheader = WelcomePreheader(prefs, locale, pubName)
		c.body = []string{WelcomeBody(prefs, locale, pubName)}
		c.ctaLabel = T(locale, "Découvrir "+pubName, "Discover "+pubName)
		c.ctaURL = spec.PubURL
		c.consent = T(locale,
			"Vous recevez cet email car vous venez de confirmer votre abonnement.",
			"You're receiving this email because you just confirmed your subscription.")
	default: // EmailTemplateConfirm
		c.title = ConfirmSubject(prefs, locale, pubName)
		c.preheader = ConfirmPreheader(prefs, locale, pubName)
		c.body = []string{
			T(locale,
				"Vous avez demandé à recevoir les nouvelles publications de "+pubName+". Confirmez votre adresse email pour finaliser votre inscription.",
				"You asked to receive new posts from "+pubName+". Confirm your email address to complete your subscription.",
			),
		}
		c.ctaLabel = T(locale, "Confirmer mon abonnement", "Confirm my subscription")
		// Aperçu : token placeholder — le vrai lien signé n'existe qu'au
		// moment de l'envoi (worker), le lien d'aperçu n'est pas cliquable.
		c.ctaURL = buildConfirmURL(confirmEmailBaseURL(), spec.PubID, spec.Email, "TOKEN")
		c.consent = T(locale,
			"Vous recevez cet email suite à une demande d'inscription. Si vous n'en êtes pas à l'origine, ignorez simplement ce message — aucune inscription ne sera prise en compte.",
			"You received this email following a subscription request. If this wasn't you, simply ignore it — no subscription will be created.",
		)
	}
	return c
}

// renderContent assemble la coquille multipart + en-têtes à partir du
// contenu résolu (commun aux envois réels et à l'aperçu studio).
func renderContent(m *subscriberMailer, email string, c subscriberEmailContent) EmailMessage {
	// La coquille échappe elle-même tous les textes (contrat ShellInput) :
	// on lui passe du texte brut.
	var bodyHTML string
	for _, p := range c.body {
		bodyHTML += `<p style="font-size:14px;line-height:1.65;color:#52525b;margin:0 0 12px;">` + html.EscapeString(p) + `</p>`
	}

	htmlPart, textPart := RenderTransactionEmail(ShellInput{
		Locale:      c.locale,
		Preheader:   c.preheader,
		Title:       c.title,
		BodyHTML:    bodyHTML,
		CTALabel:    c.ctaLabel,
		CTAURL:      c.ctaURL,
		Accent:      c.accent,
		LogoURL:     c.logo,
		PubName:     c.pubName,
		PubURL:      c.pubURL,
		UnsubLabel:  T(c.locale, "Se désabonner", "Unsubscribe"),
		ConsentLine: c.consent,
		FooterNote:  c.footerNote,
	})

	fromName := c.pubName
	if c.fromName != "" {
		fromName = c.fromName
	}
	from := m.fromAddress()
	if fromName != "" {
		from = fmt.Sprintf("%s <%s>", fromName, m.fromAddress())
	}

	refID := "sub-" + shortHash(email+"|"+c.title+"|"+c.ctaURL)
	return EmailMessage{
		From:    from,
		To:      email,
		Subject: c.title,
		HTML:    htmlPart,
		Text:    textPart,
		ReplyTo: c.replyTo,
		ListID:  listIDFor(fromName),
		RefID:   refID,
	}
}

// BuildSubscriberEmail rend un email d'abonné réel via le mailer
// (expéditeur plateforme). C'est le chemin des workers (confirm, welcome).
func BuildSubscriberEmail(m *subscriberMailer, spec SubscriberEmailSpec, prefs EmailPrefs) EmailMessage {
	return renderContent(m, spec.Email, buildContent(spec, prefs))
}

// PreviewSubscriberEmail rend un email de prévisualisation sans base ni
// réseau : c'est la fonction qu'appelle POST /v1/settings/email/preview.
// Même rendu que BuildSubscriberEmail, expéditeur par défaut.
func PreviewSubscriberEmail(spec SubscriberEmailSpec, prefs EmailPrefs) EmailMessage {
	m := &subscriberMailer{}
	return renderContent(m, spec.Email, buildContent(spec, prefs))
}
