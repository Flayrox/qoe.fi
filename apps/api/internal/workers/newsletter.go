// Package workers — handlers de tâches asynq (newsletter fanout).
package workers

import (
	"context"
	"encoding/json"
	"log"
	"net/url"
	"regexp"
	"strings"

	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/queue"
)

const newsletterBatch = 500

// NewsletterWorker distribue un article publié aux abonnés de la publication
// (HandleArticlePublished) et envoie les newsletters créateurs (HandleNewsletterSend).
type NewsletterWorker struct {
	pool *pgxpool.Pool
	q    *db.Queries

	// provider/from sont injectés par le point d'entrée worker (SetEmailProvider)
	// quand un fournisseur email est configuré (EMAIL_PROVIDER).
	provider EmailProvider
	from     string
}

func NewNewsletterWorker(pool *pgxpool.Pool) *NewsletterWorker {
	return &NewsletterWorker{pool: pool, q: db.New(pool)}
}

// SetEmailProvider branche le fournisseur d'envoi (SMTP/Resend) partagé avec
// le drain NotificationDelivery.
func (n *NewsletterWorker) SetEmailProvider(p EmailProvider, from string) {
	n.provider = p
	n.from = from
}

// HandleArticlePublished traite TaskArticlePublished : webhooks (délégué)
// puis newsletter aux abonnés.
func (n *NewsletterWorker) HandleArticlePublished(ctx context.Context, t *asynq.Task) error {
	var p queue.ArticlePublishedPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return err
	}

	log.Printf("[newsletter] article %s (%s) — fanout pour publication %s", p.ArticleID, p.Visibility, p.PublicationID)

	// 🔔 Notification MEDIA_ARTICLE_PUBLISHED (fan-out ≤500, prefs + dédup, no-op hors MEDIA) — best-effort.
	if err := n.q.InsertMediaArticlePublishedFanout(ctx, db.InsertMediaArticlePublishedFanoutParams{
		SenderID:      toUUID(p.AuthorID),
		ArticleID:     pgtype.Text{String: p.ArticleID, Valid: true},
		PublicationID: p.PublicationID,
	}); err != nil {
		log.Printf("[newsletter] notif MEDIA_ARTICLE_PUBLISHED fanout: %v", err)
	}

	offset := 0
	processed := 0
	for {
		batch, err := n.q.GetActiveSubscribersByPublication(ctx, db.GetActiveSubscribersByPublicationParams{
			PublicationId: p.PublicationID, Limit: newsletterBatch, Offset: int32(offset),
		})
		if err != nil {
			return err
		}
		if len(batch) == 0 {
			break
		}
		for _, sub := range batch {
			log.Printf("[newsletter] → %s (premium=%v)", sub.Email, sub.IsPremium)
			processed++
		}
		offset += len(batch)
		if len(batch) < newsletterBatch {
			break
		}
	}
	log.Printf("[newsletter] terminé pour %s : %d abonnés traités", p.ArticleID, processed)
	return nil
}

// HandleNewsletterSend traite TaskNewsletterSend : matérialise les livraisons
// (abonnés actifs receiveArticles=true), envoie via l'EmailProvider puis
// clôt l'issue avec les compteurs.
func (n *NewsletterWorker) HandleNewsletterSend(ctx context.Context, t *asynq.Task) error {
	var p queue.NewsletterSendPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return err
	}
	issue, err := n.q.GetNewsletterIssue(ctx, p.IssueID)
	if err != nil {
		return err
	}
	if issue.Status != "SENDING" {
		return nil // déjà traité (retry) ou non déclenché
	}

	if n.provider == nil {
		_, _ = n.q.FinishNewsletterIssue(ctx, db.FinishNewsletterIssueParams{
			ID: issue.ID, Status: "FAILED",
		})
		log.Printf("[newsletter] issue %s : aucun fournisseur email configuré (EMAIL_PROVIDER)", issue.ID)
		return nil
	}

	if err := n.q.InsertNewsletterDeliveries(ctx, db.InsertNewsletterDeliveriesParams{
		IssueId:       issue.ID,
		PublicationId: issue.PublicationId,
	}); err != nil {
		return err
	}
	deliveries, err := n.q.ListNewsletterDeliveriesByIssue(ctx, issue.ID)
	if err != nil {
		return err
	}

	sent, failed := 0, 0
	for _, d := range deliveries {
		msg := n.buildNewsletterEmail(issue, d.Email)
		if err := n.provider.Send(ctx, msg); err != nil {
			failed++
			_ = n.q.MarkNewsletterDelivery(ctx, db.MarkNewsletterDeliveryParams{
				IssueId: issue.ID, Email: d.Email, Status: "FAILED",
				Error: pgtype.Text{String: err.Error(), Valid: true},
			})
			log.Printf("[newsletter] issue %s → %s : %v", issue.ID, d.Email, err)
			continue
		}
		sent++
		_ = n.q.MarkNewsletterDelivery(ctx, db.MarkNewsletterDeliveryParams{
			IssueId: issue.ID, Email: d.Email, Status: "SENT",
		})
	}

	status := "SENT"
	if sent == 0 && failed > 0 {
		status = "FAILED"
	}
	if _, err := n.q.FinishNewsletterIssue(ctx, db.FinishNewsletterIssueParams{
		ID:              issue.ID,
		Status:          status,
		SentCount:       int32(sent),
		FailedCount:     int32(failed),
		TotalRecipients: int32(len(deliveries)),
	}); err != nil {
		return err
	}
	log.Printf("[newsletter] issue %s : %d envoyés / %d échecs / %d destinataires", issue.ID, sent, failed, len(deliveries))
	return nil
}

// buildNewsletterEmail enveloppe le contenu HTML du créateur dans une coquille
// email brandée avec preheader + lien de désabonnement (réversible, sans auth).
func (n *NewsletterWorker) buildNewsletterEmail(issue db.NewsletterIssue, email string) EmailMessage {
	unsub := "https://api.qoe.fi/v1/newsletters/unsubscribe?publicationId=" +
		url.QueryEscape(issue.PublicationId) + "&email=" + url.QueryEscape(email)
	preview := ""
	if issue.PreviewText.Valid {
		preview = issue.PreviewText.String
	}
	if preview == "" {
		preview = stripHTML(issue.Html)
		if len(preview) > 140 {
			preview = preview[:140]
		}
	}
	html := `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">` + preview + `</div>` +
		`<div style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f6f7f9;padding:32px 16px;">` +
		`<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">` +
		`<div style="padding:24px 32px;border-bottom:1px solid #ececef;font-size:20px;font-weight:700;color:#111;">qoe.fi</div>` +
		`<div style="padding:28px 32px;color:#18181b;font-size:15px;line-height:1.65;">` + issue.Html + `</div>` +
		`<div style="padding:20px 32px;border-top:1px solid #ececef;font-size:12px;color:#8a8f98;line-height:1.6;">` +
		`Vous recevez cet email car vous êtes abonné(e) à cette publication.` +
		` <a href="` + unsub + `" style="color:#8a8f98;">Se désabonner</a></div></div></div>`
	return EmailMessage{From: n.from, To: email, Subject: issue.Subject, HTML: html}
}

// HandlePostLiked est un placeholder (futur usage : analytics temps réel).
func (n *NewsletterWorker) HandlePostLiked(ctx context.Context, t *asynq.Task) error {
	var p queue.PostLikedPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return err
	}
	_ = p
	return nil
}

// stripHTML enlève les balises et compresse les espaces pour une preview
// texte propre (ex. aperçu de newsletter).
func stripHTML(html string) string {
	re := regexp.MustCompile(`<[^>]*>`)
	text := re.ReplaceAllString(html, " ")
	// Remplace les suites d'espaces (y compris \n\t) par un seul espace.
	spaces := regexp.MustCompile(`\s+`)
	return strings.TrimSpace(spaces.ReplaceAllString(text, " "))
}
