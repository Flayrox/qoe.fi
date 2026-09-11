// Package workers — handlers de tâches asynq (newsletter fanout).
package workers

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/flags"
	"github.com/qoefi/api/internal/queue"
)

const (
	// newsletterDefaultRate est le rythme d'envoi par défaut (emails/minute)
	// quand NEWSLETTER_RATE_PER_MINUTE n'est pas configuré.
	newsletterDefaultRate = 30
	// newsletterBatchMax borne la taille d'un lot même si le rythme est haut.
	newsletterBatchMax = 200
)

// NewsletterWorker distribue un article publié aux abonnés de la publication
// (HandleArticlePublished → HandleArticleRelease) et envoie les newsletters
// créateurs (HandleNewsletterSend). Les deux flux passent par le même
// pipeline par lots : rate-limit configurable (emails/minute), re-enqueue
// asynq (ProcessIn) pour étaler l'envoi, et dédup (issue/email ou
// article/email) pour ne jamais envoyer deux fois le même email.
type NewsletterWorker struct {
	pool *pgxpool.Pool
	q    *db.Queries

	// provider/from sont injectés par le point d'entrée worker (SetEmailProvider)
	// quand un fournisseur email est configuré (EMAIL_PROVIDER).
	provider EmailProvider
	from     string

	// flags lit la table feature_flags partagée (cache TTL) : le flag
	// workers-newsletter-dispatch est le coupe-feu d'envoi automatique.
	flags *flags.Service

	// ac permet au worker de re-enqueuer ses propres lots (batches suivants).
	ac *asynq.Client

	// ratePerMinute est le rythme d'envoi (emails/minute) ; 0 = défaut.
	ratePerMinute int

	// pacer attend le temps requis entre deux envois (injectable en test :
	// un no-op rend les tests déterministes et rapides).
	pacer func()
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

// SetFlags branche le service feature flags (coupe-feu newsletter).
func (n *NewsletterWorker) SetFlags(f *flags.Service) {
	n.flags = f
}

// SetAsynqClient branche le client asynq pour la re-enqueue des lots.
func (n *NewsletterWorker) SetAsynqClient(ac *asynq.Client) {
	n.ac = ac
}

// SetRatePerMinute configure le rythme d'envoi (0 = défaut 30/min). En test,
// un rythme très élevé + un pacer no-op rend l'envoi déterministe.
func (n *NewsletterWorker) SetRatePerMinute(r int) {
	n.ratePerMinute = r
}

// SetPacer remplace l'attente entre deux envois (hook de test).
func (n *NewsletterWorker) SetPacer(p func()) {
	n.pacer = p
}

// rate retourne le rythme effectif (borré 1..newsletterBatchMax*10).
func (n *NewsletterWorker) rate() int {
	if n.ratePerMinute <= 0 {
		return newsletterDefaultRate
	}
	if n.ratePerMinute > 10_000 {
		return 10_000
	}
	return n.ratePerMinute
}

// batchSize est la taille d'un lot : ~une minute d'envoi au rythme configuré
// (jamais plus que newsletterBatchMax pour rester sous le timeout asynq).
func (n *NewsletterWorker) batchSize() int {
	b := n.rate()
	if b > newsletterBatchMax {
		b = newsletterBatchMax
	}
	if b < 1 {
		b = 1
	}
	return b
}

// spacing est l'attente entre deux envois (60s / rythme).
func (n *NewsletterWorker) spacing() time.Duration {
	return time.Duration(60_000_000_000.0 / float64(n.rate())) // ns
}

// waitPace attend le temps requis entre deux envois (no-op si pacer custom).
func (n *NewsletterWorker) waitPace() {
	if n.pacer != nil {
		n.pacer()
		return
	}
	time.Sleep(n.spacing())
}

// dispatchEnabled vérifie le coupe-feu workers-newsletter-dispatch (console
// admin / feature_flags). Flag absent ou service non branché → envoi permis
// (défaut sûr : le flag ne coupe que s'il est explicitement désactivé).
func (n *NewsletterWorker) dispatchEnabled(ctx context.Context) bool {
	return n.flags == nil || n.flags.IsOn(ctx, flags.WorkersNewsletter)
}

// delivery est une ligne d'envoi en attente (campagne ou release d'article).
type delivery struct {
	email string
}

// deliverySender construit le message email d'une livraison.
type deliverySender func(email string) EmailMessage

// deliveryMarker marque une livraison SENT/FAILED (best-effort : une erreur
// de marquage n'arrête pas le lot).
type deliveryMarker func(ctx context.Context, email, status string, sendErr error)

// sendBatch envoie un lot en respectant le rythme configuré (attente entre
// chaque envoi). Retourne sent/failed.
func (n *NewsletterWorker) sendBatch(ctx context.Context, deliveries []delivery, build deliverySender, mark deliveryMarker) (sent, failed int) {
	for _, d := range deliveries {
		msg := build(d.email)
		if err := n.provider.Send(ctx, msg); err != nil {
			failed++
			mark(ctx, d.email, "FAILED", err)
			log.Printf("[newsletter] → %s : %v", d.email, err)
			continue
		}
		sent++
		mark(ctx, d.email, "SENT", nil)
		n.waitPace()
	}
	return sent, failed
}

// HandleArticlePublished traite TaskArticlePublished : webhooks (délégué),
// notification fanout, puis enqueue la synchro release (TaskNewsletterArticleRel)
// qui matérialise et envoie les emails par lots rate-limités.
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

	// Coupe-feu : pas d'email si le flag coupe l'envoi (la matérialisation se
	// fera au prochain événement, la dédup article/email protège des doublons).
	if !n.dispatchEnabled(ctx) {
		log.Printf("[newsletter] release %s : envoi coupé (flag workers-newsletter-dispatch OFF)", p.ArticleID)
		return nil
	}
	if n.ac != nil {
		_ = queue.PublishArticleRelease(n.ac, queue.ArticleReleasePayload{ArticleID: p.ArticleID}, 0)
	} else {
		log.Printf("[newsletter] release %s : enqueue impossible (client asynq absent)", p.ArticleID)
	}
	return nil
}

// HandleArticleRelease traite TaskNewsletterArticleRel : matérialise les
// livraisons de la release (abonnés actifs receiveArticles=true, dédup
// article/email), envoie un lot rate-limité, puis re-enqueue le lot suivant
// s'il reste des destinataires.
func (n *NewsletterWorker) HandleArticleRelease(ctx context.Context, t *asynq.Task) error {
	var p queue.ArticleReleasePayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return err
	}

	if !n.dispatchEnabled(ctx) {
		log.Printf("[newsletter] release %s : envoi coupé (flag workers-newsletter-dispatch OFF)", p.ArticleID)
		return nil
	}
	if n.provider == nil {
		log.Printf("[newsletter] release %s : aucun fournisseur email configuré (EMAIL_PROVIDER)", p.ArticleID)
		return nil
	}

	info, err := n.q.GetArticleReleaseInfo(ctx, p.ArticleID)
	if err != nil {
		// Article plus publié (dépublié entre-temps) → rien à envoyer.
		log.Printf("[newsletter] release %s : article non publié, skip (%v)", p.ArticleID, err)
		return nil
	}

	if err := n.q.InsertArticleReleaseDeliveries(ctx, db.InsertArticleReleaseDeliveriesParams{
		ArticleId: p.ArticleID, PublicationId: info.PublicationId,
	}); err != nil {
		return err
	}

	rows, err := n.q.ListQueuedArticleReleaseDeliveries(ctx, db.ListQueuedArticleReleaseDeliveriesParams{
		ArticleId: p.ArticleID, Limit: int32(n.batchSize()),
	})
	if err != nil {
		return err
	}
	if len(rows) == 0 {
		return nil // tout est envoyé
	}

	deliveries := make([]delivery, 0, len(rows))
	for _, r := range rows {
		deliveries = append(deliveries, delivery{email: r.Email})
	}

	link := articlePublicURL(info.Subdomain, info.CustomDomain, info.Slug)
	sent, failed := n.sendBatch(ctx, deliveries,
		func(email string) EmailMessage {
			return n.buildArticleReleaseEmail(info, link, email)
		},
		func(ctx context.Context, email, status string, sendErr error) {
			errText := pgtype.Text{}
			if sendErr != nil {
				errText = pgtype.Text{String: sendErr.Error(), Valid: true}
			}
			_ = n.q.MarkArticleReleaseDelivery(ctx, db.MarkArticleReleaseDeliveryParams{
				ArticleId: p.ArticleID, Email: email, Status: status, Error: errText,
			})
		})

	// Re-enqueue le lot suivant s'il reste potentiellement des destinataires
	// (on a rempli un lot complet) — espacé du rythme configuré.
	if len(rows) >= n.batchSize() && n.ac != nil {
		_ = queue.PublishArticleRelease(n.ac, queue.ArticleReleasePayload{ArticleID: p.ArticleID}, n.spacing()*time.Duration(len(rows)))
	}

	stats, err := n.q.CountArticleReleaseDeliveries(ctx, p.ArticleID)
	if err == nil {
		log.Printf("[newsletter] release %s : lot %d envoyés / %d échecs (total sent=%d failed=%d)",
			p.ArticleID, sent, failed, stats.Sent, stats.Failed)
	}
	return nil
}

// HandleNewsletterSend traite TaskNewsletterSend : matérialise les livraisons
// (abonnés actifs receiveArticles=true), envoie un lot rate-limité puis
// re-enqueue le lot suivant s'il reste des destinataires ; quand tout est
// envoyé, clôt l'issue avec les compteurs.
func (n *NewsletterWorker) HandleNewsletterSend(ctx context.Context, t *asynq.Task) error {
	var p queue.NewsletterSendPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return err
	}
	issueWithPub, err := n.q.GetNewsletterIssueWithPublication(ctx, p.IssueID)
	if err != nil {
		return err
	}
	if issueWithPub.Status != "SENDING" {
		return nil // déjà traité (retry) ou non déclenché
	}

	// Coupe-feu serveur : le flag workers-newsletter-dispatch (console admin /
	// feature_flags) coupe l'envoi sans redéploiement. L'issue repasse en
	// DRAFT pour repartir proprement à la réactivation : les livraisons déjà
	// SENT restent marquées (dédup), seules les QUEUED seront reprises.
	if !n.dispatchEnabled(ctx) {
		if err := n.q.ResetNewsletterIssueToDraft(ctx, issueWithPub.ID); err != nil {
			return err
		}
		log.Printf("[newsletter] issue %s : envoi coupé (flag workers-newsletter-dispatch OFF), retour DRAFT", issueWithPub.ID)
		return nil
	}

	if n.provider == nil {
		_, _ = n.q.FinishNewsletterIssue(ctx, db.FinishNewsletterIssueParams{
			ID: issueWithPub.ID, Status: "FAILED",
		})
		log.Printf("[newsletter] issue %s : aucun fournisseur email configuré (EMAIL_PROVIDER)", issueWithPub.ID)
		return nil
	}

	// Matérialise les destinataires (idempotent : ON CONFLICT DO NOTHING).
	if err := n.q.InsertNewsletterDeliveries(ctx, db.InsertNewsletterDeliveriesParams{
		IssueId: issueWithPub.ID, PublicationId: issueWithPub.PublicationId,
	}); err != nil {
		return err
	}

	rows, err := n.q.ListNewsletterDeliveriesByIssue(ctx, db.ListNewsletterDeliveriesByIssueParams{
		IssueId: issueWithPub.ID, Limit: int32(n.batchSize()),
	})
	if err != nil {
		return err
	}
	if len(rows) == 0 {
		// Tout est envoyé → clôture avec les compteurs réels.
		return n.finishNewsletterIssue(ctx, issueWithPub.ID)
	}

	deliveries := make([]delivery, 0, len(rows))
	for _, r := range rows {
		deliveries = append(deliveries, delivery{email: r.Email})
	}

	sent, failed := n.sendBatch(ctx, deliveries,
		func(email string) EmailMessage { return n.buildNewsletterEmail(issueWithPub, email) },
		func(ctx context.Context, email, status string, sendErr error) {
			errText := pgtype.Text{}
			if sendErr != nil {
				errText = pgtype.Text{String: sendErr.Error(), Valid: true}
			}
			_ = n.q.MarkNewsletterDelivery(ctx, db.MarkNewsletterDeliveryParams{
				IssueId: issueWithPub.ID, Email: email, Status: status, Error: errText,
			})
		})

	// Lot plein : il reste potentiellement des destinataires → re-enqueue le
	// lot suivant (ou laisse l'issue en SENDING si aucun client asynq n'est
	// branché — un appel suivant reprendra les QUEUED). Jamais de clôture ici.
	if len(rows) >= n.batchSize() {
		if n.ac != nil {
			_ = queue.PublishNewsletterSend(n.ac, queue.NewsletterSendPayload{IssueID: issueWithPub.ID})
			log.Printf("[newsletter] issue %s : lot %d envoyés / %d échecs (re-enqueue)", issueWithPub.ID, sent, failed)
		} else {
			log.Printf("[newsletter] issue %s : lot %d envoyés / %d échecs, reste SENDING (reprise possible)", issueWithPub.ID, sent, failed)
		}
		return nil
	}
	// Lot partiel = dernier lot → clôture l'issue avec les compteurs réels.
	log.Printf("[newsletter] issue %s : lot final %d envoyés / %d échecs", issueWithPub.ID, sent, failed)
	return n.finishNewsletterIssue(ctx, issueWithPub.ID)
}

// finishNewsletterIssue clôt une issue SENDING avec les compteurs réels
// (SENT si au moins un envoi réussi, FAILED si tout a échoué).
func (n *NewsletterWorker) finishNewsletterIssue(ctx context.Context, issueID string) error {
	stats, err := n.q.CountNewsletterDeliveriesByIssue(ctx, issueID)
	if err != nil {
		return err
	}
	status := "SENT"
	if stats.Sent == 0 && stats.Failed > 0 {
		status = "FAILED"
	}
	if _, err := n.q.FinishNewsletterIssue(ctx, db.FinishNewsletterIssueParams{
		ID:              issueID,
		Status:          status,
		SentCount:       int32(stats.Sent),
		FailedCount:     int32(stats.Failed),
		TotalRecipients: int32(stats.Total),
	}); err != nil {
		return err
	}
	log.Printf("[newsletter] issue %s clôturée : %d envoyés / %d échecs / %d destinataires",
		issueID, stats.Sent, stats.Failed, stats.Total)
	return nil
}

// signUnsubscribe génère une signature cryptographique HMAC-SHA256 infalsifiable pour la désinscription.
func signUnsubscribe(pubID, email string) string {
	secret := os.Getenv("NEWSLETTER_UNSUB_SECRET")
	if secret == "" {
		secret = "qoe-unsub-default-secret-min32chars"
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(pubID + ":" + email))
	return hex.EncodeToString(mac.Sum(nil))
}

// buildUnsubURL construit le lien de désinscription RFC 8058 One-Click.
func buildUnsubURL(pubID, email string) string {
	sig := signUnsubscribe(pubID, email)
	return fmt.Sprintf("https://api.qoe.fi/v1/newsletters/unsubscribe?pub=%s&email=%s&sig=%s",
		url.QueryEscape(pubID), url.QueryEscape(email), sig)
}

// publicationPublicURL calcule l'URL racine d'un média.
func publicationPublicURL(subdomain, customDomain pgtype.Text) string {
	if customDomain.Valid && customDomain.String != "" {
		return "https://" + customDomain.String
	}
	if subdomain.Valid && subdomain.String != "" {
		return fmt.Sprintf("https://%s.qoe.fi", subdomain.String)
	}
	return "https://qoe.fi"
}

// renderEmailLayout compose un template HTML responsive haute délivrabilité (Dark/Light mode).
func renderEmailLayout(pubName, pubLogoURL, pubURL, preheader, subject, bodyHTML, unsubURL, webLink string) string {
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
      .email-container { background-color: #18181b !important; border-color: #27272a !important; }
      .email-header { border-color: #27272a !important; }
      .email-body { color: #f4f4f5 !important; }
      .email-body h1, .email-body h2 { color: #ffffff !important; }
      .email-body p { color: #e4e4e7 !important; }
      .email-body blockquote { border-color: #71717a !important; color: #a1a1aa !important; }
      .email-footer { background-color: #121214 !important; border-color: #27272a !important; color: #a1a1aa !important; }
    }
  </style>
</head>
<body>
  <div style="display:none;font-size:1px;color:#333;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">%s</div>
  <div class="email-container">
    <div class="email-header">
      %s
      <a href="%s" style="text-decoration:none;color:#09090b;font-size:20px;font-weight:700;letter-spacing:-0.02em;">%s</a>
    </div>
    <div class="email-body">
      %s
    </div>
    <div class="email-footer">
      <div>Vous recevez cet email car vous êtes abonné(e) à <strong>%s</strong>.</div>
      <div style="margin-top:8px;">
        <a href="%s" style="color:#71717a;text-decoration:underline;">Se désabonner</a>%s
      </div>
      <div style="margin-top:16px;font-size:11px;color:#a1a1aa;letter-spacing:0.02em;text-transform:uppercase;">
        Propulsé par <a href="https://qoe.fi" style="color:#71717a;text-decoration:none;font-weight:600;">qoe.fi</a>
      </div>
    </div>
  </div>
</body>
</html>`, subject, preheader, logoHTML, pubURL, pubName, bodyHTML, pubName, unsubURL, webLinkHTML)
}

// buildNewsletterEmail enveloppe le contenu HTML du créateur dans une coquille
// email brandée avec preheader + lien de désabonnement RFC 8058 et token HMAC.
func (n *NewsletterWorker) buildNewsletterEmail(issue db.GetNewsletterIssueWithPublicationRow, email string) EmailMessage {
	pubName := issue.PublicationName
	logoURL := ""
	if issue.PublicationLogoUrl.Valid {
		logoURL = issue.PublicationLogoUrl.String
	}
	pubURL := publicationPublicURL(issue.PublicationSubdomain, issue.PublicationCustomDomain)
	unsub := buildUnsubURL(issue.PublicationId, email)

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

	html := renderEmailLayout(pubName, logoURL, pubURL, preview, issue.Subject, issue.Html, unsub, pubURL)

	from := fmt.Sprintf("%s <%s>", pubName, n.from)
	return EmailMessage{
		From:            from,
		To:              email,
		Subject:         issue.Subject,
		HTML:            html,
		ListUnsubscribe: unsub,
		IsBulk:          true,
	}
}

// buildArticleReleaseEmail compose l'email de release d'un article :
// titre + extrait (jamais de contenu premium) + CTA vers l'article public.
func (n *NewsletterWorker) buildArticleReleaseEmail(info db.GetArticleReleaseInfoRow, link, email string) EmailMessage {
	pubName := info.PublicationName
	pubURL := publicationPublicURL(info.Subdomain, info.CustomDomain)
	unsub := buildUnsubURL(info.PublicationId, email)

	body := fmt.Sprintf(`<h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;color:#09090b;">%s</h1>`, info.Title)
	if !info.IsPremium {
		excerpt := stripHTML(info.Content)
		if len(excerpt) > 400 {
			excerpt = excerpt[:400] + "…"
		}
		if excerpt != "" {
			body += fmt.Sprintf(`<p style="margin:0 0 24px;color:#27272a;line-height:1.7;">%s</p>`, excerpt)
		}
	} else {
		body += `<p style="margin:0 0 24px;color:#71717a;font-style:italic;">Article exclusif réservé aux abonnés — découvrez la suite en ligne.</p>`
	}
	body += fmt.Sprintf(`<div style="margin:24px 0;"><a href="%s" style="display:inline-block;background:#09090b;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600;font-size:15px;">Lire l'article sur %s →</a></div>`, link, pubName)

	preview := "Nouvel article : " + info.Title
	html := renderEmailLayout(pubName, "", pubURL, preview, preview, body, unsub, link)

	from := fmt.Sprintf("%s <%s>", pubName, n.from)
	return EmailMessage{
		From:            from,
		To:              email,
		Subject:         "Nouvel article : " + info.Title,
		HTML:            html,
		ListUnsubscribe: unsub,
		IsBulk:          true,
	}
}

// articlePublicURL construit l'URL publique d'un article : domaine custom,
// sinon sous-domaine qoe.fi, sinon fallback qoe.fi/p/{slug}.
func articlePublicURL(subdomain, customDomain pgtype.Text, slug string) string {
	if customDomain.Valid && customDomain.String != "" {
		return "https://" + customDomain.String + "/" + url.PathEscape(slug)
	}
	if subdomain.Valid && subdomain.String != "" {
		return fmt.Sprintf("https://%s.qoe.fi/%s", subdomain.String, url.PathEscape(slug))
	}
	return "https://qoe.fi/p/" + url.PathEscape(slug)
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
