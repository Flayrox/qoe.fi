package workers

// =====================================================================
// ✅ SubscriberMailer — socle commun des emails d'abonnés (double opt-in)
// =====================================================================
// Un seul cœur au service des deux emails transactionnels d'abonné :
//   - TaskSubscriberConfirm : l'email de confirmation double opt-in,
//     envoyé après une inscription publique (POST /v1/home/subscribe) ;
//   - TaskSubscriberWelcome : l'email de bienvenue, envoyé après le clic
//     sur le lien de confirmation (voir welcome_email.go).
//
// Le lien de confirmation est signé HMAC-SHA256 (miroir de l'unsubscribe
// RFC 8058 : SignUnsubscribe/VerifyUnsubscribe) et pointe vers
// GET|POST /v1/newsletters/confirm, qui confirme l'abonnement.
//
// Le contenu est rendu par le moteur email_content.go : langue de
// l'abonné (Subscriber.locale), personnalisation par publication
// (Publication.emailSettings), coquille multipart texte+HTML orientée
// délivrabilité.
//
// Idempotence : si l'abonné a déjà confirmé (token effacé), l'email de
// confirmation est ignoré (pas de spam à la re-inscription, pas d'erreur
// asynq). Inactif sans fournisseur email configuré (EMAIL_PROVIDER).

import (
	"context"
	"encoding/json"
	"fmt"
	"html"
	"log"
	"net/url"
	"os"

	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgxpool"

	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/queue"
)

// subscriberMailer porte le pool + le fournisseur email partagés par les
// workers d'emails d'abonnés.
type subscriberMailer struct {
	pool     *pgxpool.Pool
	provider EmailProvider
	from     string
}

// SetEmailProvider branche le fournisseur email partagé (nil → worker inactif).
func (m *subscriberMailer) SetEmailProvider(p EmailProvider, from string) {
	m.provider = p
	m.from = from
}

// fromAddress retourne l'expéditeur par défaut (fallback noreply@qoe.fi).
func (m *subscriberMailer) fromAddress() string {
	if m.from != "" {
		return m.from
	}
	return "noreply@qoe.fi"
}

// ── Signature HMAC des liens de confirmation ─────────────────────────

// confirmEmailBaseURL est la racine des liens de confirmation.
// QOE_CONFIRM_BASE_URL surcharge (self-host / staging), défaut api.qoe.fi
// — même hôte que les liens de désinscription RFC 8058.
func confirmEmailBaseURL() string {
	if v := os.Getenv("QOE_CONFIRM_BASE_URL"); v != "" {
		return v
	}
	return "https://api.qoe.fi"
}

// SignConfirm génère la signature HMAC-SHA256 d'un lien de confirmation
// (pub + email) — miroir exact de SignUnsubscribe.
func SignConfirm(pubID, email string) string {
	return SignUnsubscribe("confirm:"+pubID, email)
}

// VerifyConfirm valide la signature d'un lien de confirmation de manière
// timing-safe (crypto/subtle côté VerifyUnsubscribe).
func VerifyConfirm(pubID, email, sig string) bool {
	return VerifyUnsubscribe("confirm:"+pubID, email, sig)
}

// buildConfirmURL construit le lien de confirmation signé (HMAC).
func buildConfirmURL(base, pubID, email, token string) string {
	sig := SignConfirm(pubID, email)
	return fmt.Sprintf("%s/v1/newsletters/confirm?pub=%s&email=%s&token=%s&sig=%s",
		base,
		url.QueryEscape(pubID), url.QueryEscape(email),
		url.QueryEscape(token), sig)
}

// ── Rendu commun : coquille + personnalisation + locale ──────────────

// subscriberShellInput décrit un email d'abonné avant rendu. pubName et
// bodyParagraphs sont échappés ici (une seule fois).
type subscriberShellInput struct {
	locale         string
	pubName        string
	pubURL         string
	fromName       string // nom d'expéditeur personnalisé ("" = nom de publication)
	replyTo        string // réponse personnalisée ("" = from plateforme)
	accentFallback string // couleur de la publication si emailSettings n'en fixe pas
	logoURL        string // logo de la publication si emailSettings n'en fixe pas
	unsubURL       string
	preheader      string
	title          string
	bodyParagraphs []string
	ctaLabel       string
	ctaURL         string
	consentLine    string
	footerNote     string
}

// renderSubscriberEmail rend l'email d'un abonné via le moteur : personnalisation
// (réglages > publication > défauts), coquille multipart texte+HTML, en-têtes
// anti-threading (X-Entity-Ref-ID unique par email).
func renderSubscriberEmail(m *subscriberMailer, email string, in subscriberShellInput) EmailMessage {
	// La coquille échappe elle-même tous les textes (contrat ShellInput) :
	// on lui passe du texte brut.
	var bodyHTML string
	for _, p := range in.bodyParagraphs {
		bodyHTML += `<p style="font-size:14px;line-height:1.65;color:#52525b;margin:0 0 12px;">` + html.EscapeString(p) + `</p>`
	}

	htmlPart, textPart := RenderTransactionEmail(ShellInput{
		Locale:      in.locale,
		Preheader:   in.preheader,
		Title:       in.title,
		BodyHTML:    bodyHTML,
		CTALabel:    in.ctaLabel,
		CTAURL:      in.ctaURL,
		Accent:      in.accentFallback,
		LogoURL:     in.logoURL,
		PubName:     in.pubName,
		PubURL:      in.pubURL,
		UnsubURL:    in.unsubURL,
		UnsubLabel:  T(in.locale, "Se désabonner", "Unsubscribe"),
		ConsentLine: in.consentLine,
		FooterNote:  in.footerNote,
	})

	fromName := in.pubName
	if in.fromName != "" {
		fromName = in.fromName
	}
	from := m.fromAddress()
	if fromName != "" {
		from = fmt.Sprintf("%s <%s>", fromName, m.fromAddress())
	}

	refID := "sub-" + shortHash(email+"|"+in.title+"|"+in.ctaURL)
	return EmailMessage{
		From:    from,
		To:      email,
		Subject: in.title,
		HTML:    htmlPart,
		Text:    textPart,
		ReplyTo: in.replyTo,
		ListID:  listIDFor(fromName),
		RefID:   refID,
	}
}

// localizedPublicationName échappe le nom de publication (vide → libellé
// localisé « la publication » pour les phrases).
func localizedPublicationName(locale, rawName string) string {
	if rawName != "" {
		return rawName
	}
	return T(locale, "la publication", "the publication")
}

// ── Worker de confirmation ───────────────────────────────────────────

// ConfirmEmailWorker envoie les emails de confirmation (TaskSubscriberConfirm).
type ConfirmEmailWorker struct {
	subscriberMailer
}

// NewConfirmEmailWorker construit le worker. Inactif tant que
// SetEmailProvider n'a pas été appelé (les tâches sont alors ignorées).
func NewConfirmEmailWorker(pool *pgxpool.Pool) *ConfirmEmailWorker {
	return &ConfirmEmailWorker{subscriberMailer{pool: pool}}
}

// HandleSubscriberConfirm traite TaskSubscriberConfirm.
func (w *ConfirmEmailWorker) HandleSubscriberConfirm(ctx context.Context, t *asynq.Task) error {
	var p queue.SubscriberConfirmPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return err
	}
	if p.Email == "" || p.PublicationID == "" {
		log.Printf("[confirm] payload incomplet : %v", p)
		return nil
	}
	if w.provider == nil {
		log.Printf("[confirm] aucun fournisseur email configuré (EMAIL_PROVIDER), email %s ignoré", p.Email)
		return nil
	}

	q := db.New(w.pool)
	info, err := q.GetPendingConfirmation(ctx, db.GetPendingConfirmationParams{
		Email:         p.Email,
		PublicationId: p.PublicationID,
	})
	if err != nil {
		// Déjà confirmé (ou abonné inexistant) → rien à faire, pas d'erreur :
		// une re-inscription ne doit jamais re-déclencher un envoi.
		log.Printf("[confirm] %s / %s : déjà confirmé ou absent (%v)", p.Email, p.PublicationID, err)
		return nil
	}

	locale := NormalizeEmailLocale(info.Locale)
	prefs := ParseEmailPrefs(info.EmailSettings)
	pubName := localizedPublicationName(locale, info.PublicationName)
	pubURL := publicationPublicURL(info.Subdomain, info.CustomDomain)
	link := buildConfirmURL(confirmEmailBaseURL(), p.PublicationID, p.Email, info.ConfirmationToken.String)

	// Priorité : réglages email > identité de la publication.
	accent := prefs.AccentColor
	if accent == "" && info.AccentColor.Valid {
		accent = info.AccentColor.String
	}
	logo := prefs.LogoURL
	if logo == "" && info.LogoUrl.Valid {
		logo = info.LogoUrl.String
	}
	subject := prefs.Subjects[EmailTemplateConfirm]
	if subject == "" {
		subject = T(locale, "Confirmez votre abonnement — ", "Confirm your subscription — ") + pubName
	}
	preheader := prefs.Preheaders[EmailTemplateConfirm]
	if preheader == "" {
		preheader = T(locale,
			"Confirmez votre inscription à la newsletter de "+pubName+".",
			"Confirm your subscription to "+pubName+".")
	}

	msg := renderSubscriberEmail(&w.subscriberMailer, p.Email, subscriberShellInput{
		locale:         locale,
		pubName:        pubName,
		pubURL:         pubURL,
		fromName:       prefs.FromName,
		replyTo:        prefs.ReplyTo,
		accentFallback: accent,
		logoURL:        logo,
		preheader:      preheader,
		title:          subject,
		bodyParagraphs: []string{
			T(locale,
				"Vous avez demandé à recevoir les nouvelles publications de "+pubName+". Confirmez votre adresse email pour finaliser votre inscription.",
				"You asked to receive new posts from "+pubName+". Confirm your email address to complete your subscription.",
			),
		},
		ctaLabel: T(locale, "Confirmer mon abonnement", "Confirm my subscription"),
		ctaURL:   link,
		consentLine: T(locale,
			"Vous recevez cet email suite à une demande d'inscription. Si vous n'en êtes pas à l'origine, ignorez simplement ce message — aucune inscription ne sera prise en compte.",
			"You received this email following a subscription request. If this wasn't you, simply ignore it — no subscription will be created.",
		),
		footerNote: prefs.FooterNote,
	})

	if err := w.provider.Send(ctx, msg); err != nil {
		return fmt.Errorf("confirm: envoi à %s: %w", p.Email, err)
	}
	log.Printf("[confirm] email de confirmation envoyé à %s (%s) [%s]", p.Email, p.PublicationID, locale)
	return nil
}
