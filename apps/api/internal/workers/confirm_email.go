package workers

// =====================================================================
// ✅ ConfirmEmailWorker — double opt-in des inscriptions newsletter
// =====================================================================
// L'inscription publique (POST /v1/home/subscribe) crée un abonné sans
// receiveArticles et enfile TaskSubscriberConfirm ; ce worker lui envoie
// l'email de confirmation. Le lien signé (HMAC-SHA256, miroir de l'unsub
// RFC 8058 : SignUnsubscribe/VerifyUnsubscribe) pointe vers
// GET|POST /v1/newsletters/confirm, qui confirme l'abonnement.
//
// Idempotence : si l'abonné a déjà confirmé (token effacé), l'email est
// simplement ignoré (pas de spam à la re-inscription, pas d'erreur asynq).
// Inactif sans fournisseur email configuré (EMAIL_PROVIDER).

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

// ConfirmEmailWorker envoie les emails de confirmation (TaskSubscriberConfirm).
type ConfirmEmailWorker struct {
	pool     *pgxpool.Pool
	provider EmailProvider
	from     string
}

// NewConfirmEmailWorker construit le worker. Inactif tant que
// SetEmailProvider n'a pas été appelé (les tâches sont alors ignorées).
func NewConfirmEmailWorker(pool *pgxpool.Pool) *ConfirmEmailWorker {
	return &ConfirmEmailWorker{pool: pool}
}

// SetEmailProvider branche le fournisseur email partagé (nil → worker inactif).
func (w *ConfirmEmailWorker) SetEmailProvider(p EmailProvider, from string) {
	w.provider = p
	w.from = from
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

	link := buildConfirmURL(confirmEmailBaseURL(), p.PublicationID, p.Email, info.ConfirmationToken.String)
	name := "la publication"
	if info.PublicationName != "" {
		name = html.EscapeString(info.PublicationName)
	}
	from := w.from
	if from == "" {
		from = "noreply@qoe.fi"
	}
	msg := EmailMessage{
		From:    from,
		To:      p.Email,
		Subject: "Confirmez votre abonnement — " + name,
		HTML:    buildConfirmEmailHTML(name, link, publicationPublicURL(info.Subdomain, info.CustomDomain)),
	}
	if err := w.provider.Send(ctx, msg); err != nil {
		return fmt.Errorf("confirm: envoi à %s: %w", p.Email, err)
	}
	log.Printf("[confirm] email de confirmation envoyé à %s (%s)", p.Email, p.PublicationID)
	return nil
}

// buildConfirmURL construit le lien de confirmation signé (HMAC).
func buildConfirmURL(base, pubID, email, token string) string {
	sig := SignConfirm(pubID, email)
	return fmt.Sprintf("%s/v1/newsletters/confirm?pub=%s&email=%s&token=%s&sig=%s",
		base,
		url.QueryEscape(pubID), url.QueryEscape(email),
		url.QueryEscape(token), sig)
}

// buildConfirmEmailHTML compose l'email de confirmation (option Apple : pas de
// monospace, contrastes élevés, mise en page simple et sobre).
func buildConfirmEmailHTML(publicationName, confirmURL, publicationURL string) string {
	pubLink := ""
	if publicationURL != "" {
		pubLink = `<a href="` + html.EscapeString(publicationURL) + `" style="color:#6b7280;text-decoration:underline;">` + publicationName + `</a>`
	} else {
		pubLink = publicationName
	}
	return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Confirmation d'abonnement</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',Roboto,sans-serif;background:#f9fafb;margin:0;padding:32px 20px;-webkit-font-smoothing:antialiased;">
<div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,0.04);padding:40px 32px;max-width:440px;margin:0 auto;text-align:center;">
<div style="width:48px;height:48px;background:#eef2ff;border:1px solid #e0e7ff;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:22px;">✉️</div>
<h1 style="font-size:20px;font-weight:600;color:#111827;margin:0 0 8px;letter-spacing:-0.01em;">Confirmez votre abonnement</h1>
<p style="font-size:14px;line-height:1.6;color:#6b7280;margin:0 0 24px;">Vous avez demandé à recevoir les nouvelles publications de ` + pubLink + `. Confirmez votre adresse email pour finaliser votre inscription.</p>
<a href="` + html.EscapeString(confirmURL) + `" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;padding:12px 28px;border-radius:9999px;">Confirmer mon abonnement</a>
<p style="font-size:12px;line-height:1.6;color:#9ca3af;margin:24px 0 0;">Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email — aucune inscription ne sera prise en compte.</p>
</div></body></html>`
}
