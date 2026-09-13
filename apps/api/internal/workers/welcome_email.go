package workers

// =====================================================================
// 👋 welcome_email.go — email de bienvenue après confirmation
// =====================================================================
// Enfilé par Service.ConfirmSubscriber (modules/newsletters) au moment où
// le lecteur clique sur le lien de confirmation du double opt-in — c'est
// le VRAI moment « abonné actif », le seul honnête pour un bienvenue.
//
// Le créateur garde la maîtrise : corps personnalisé (WelcomeBodyFR/EN
// dans emailSettings), sujet, preheader, expéditeur, reply-to, couleurs,
// et peut tout simplement couper l'email (welcomeEnabled=false).
// Idempotent par nature : le déclencheur n'enfile la tâche qu'après une
// confirmation effective (UPDATE ... RETURNING).
//
// Pas de lien de désabonnement ici (email transactionnel de relation, le
// lecteur vient de confirmer — la mention de consentement reste visible),
// mais la coquille reste multipart et localisée.

import (
	"context"
	"encoding/json"
	"log"

	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgxpool"

	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/queue"
)

// WelcomeEmailWorker envoie les emails de bienvenue (TaskSubscriberWelcome).
type WelcomeEmailWorker struct {
	subscriberMailer
}

// NewWelcomeEmailWorker construit le worker. Inactif tant que
// SetEmailProvider n'a pas été appelé (les tâches sont alors ignorées).
func NewWelcomeEmailWorker(pool *pgxpool.Pool) *WelcomeEmailWorker {
	return &WelcomeEmailWorker{subscriberMailer{pool: pool}}
}

// HandleSubscriberWelcome traite TaskSubscriberWelcome.
func (w *WelcomeEmailWorker) HandleSubscriberWelcome(ctx context.Context, t *asynq.Task) error {
	var p queue.SubscriberWelcomePayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return err
	}
	if p.Email == "" || p.PublicationID == "" {
		log.Printf("[welcome] payload incomplet : %v", p)
		return nil
	}
	if w.provider == nil {
		log.Printf("[welcome] aucun fournisseur email configuré (EMAIL_PROVIDER), email %s ignoré", p.Email)
		return nil
	}

	q := db.New(w.pool)
	info, err := q.GetSubscriberEmailContext(ctx, db.GetSubscriberEmailContextParams{
		Email:         p.Email,
		PublicationId: p.PublicationID,
	})
	if err != nil {
		// Abonné absent (nettoyage) → rien à faire, pas d'erreur asynq.
		log.Printf("[welcome] %s / %s : abonné absent (%v)", p.Email, p.PublicationID, err)
		return nil
	}
	// Garde : un abonné qui aurait été dé-confirmé entre-temps ne reçoit
	// pas de bienvenue (aucun envoi hors abonné actif).
	if !info.ConfirmedAt.Valid {
		log.Printf("[welcome] %s / %s : abonné non confirmé, bienvenue ignoré", p.Email, p.PublicationID)
		return nil
	}

	locale := NormalizeEmailLocale(info.Locale)
	prefs := ParseEmailPrefs(info.EmailSettings)
	if prefs.WelcomeEnabled != nil && !*prefs.WelcomeEnabled {
		log.Printf("[welcome] bienvenue désactivé par le créateur pour %s", p.PublicationID)
		return nil
	}

	pubName := localizedPublicationName(locale, info.PublicationName)
	pubURL := publicationPublicURL(info.Subdomain, info.CustomDomain)

	// Priorité : réglages email > identité de la publication.
	accent := prefs.AccentColor
	if accent == "" && info.AccentColor.Valid {
		accent = info.AccentColor.String
	}
	logo := prefs.LogoURL
	if logo == "" && info.LogoUrl.Valid {
		logo = info.LogoUrl.String
	}

	// Corps : personnalisé (locale correspondante) sinon défaut localisé.
	body := T(locale, prefs.WelcomeBodyFR, prefs.WelcomeBodyEN)
	if body == "" {
		body = T(locale,
			"Votre inscription à la newsletter de "+pubName+" est confirmée. À très vite !",
			"Your subscription to "+pubName+" is confirmed. See you soon!")
	}

	subject := prefs.Subjects[EmailTemplateWelcome]
	if subject == "" {
		subject = T(locale, "Bienvenue chez ", "Welcome to ") + pubName
	}
	preheader := prefs.Preheaders[EmailTemplateWelcome]
	if preheader == "" {
		preheader = T(locale,
			"Votre abonnement est confirmé — bienvenue !",
			"Your subscription is confirmed — welcome!")
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
		bodyParagraphs: []string{body},
		ctaLabel:       T(locale, "Découvrir "+pubName, "Discover "+pubName),
		ctaURL:         pubURL,
		consentLine: T(locale,
			"Vous recevez cet email car vous venez de confirmer votre abonnement.",
			"You're receiving this email because you just confirmed your subscription."),
		footerNote: prefs.FooterNote,
	})

	if err := w.provider.Send(ctx, msg); err != nil {
		return err
	}
	log.Printf("[welcome] email de bienvenue envoyé à %s (%s) [%s]", p.Email, p.PublicationID, locale)
	return nil
}
