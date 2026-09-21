package workers

// =====================================================================
// 📣 Drain de la boîte d'envoi des avis légaux (legal_notice_delivery)
// =====================================================================
// Quand une nouvelle version d'un document « à accepter » est publiée, le
// service legal écrit une livraison par destinataire. Ce worker les expédie :
// réclamation atomique (QUEUED → PROCESSING, FOR UPDATE SKIP LOCKED), appel du
// EmailProvider partagé, puis SENT / FAILED avec un délai de reprise.
//
// Contrat de contenu : l'email dit trois choses — quel document a changé, ce
// qui a changé (changelog), et comment renouveler ou retirer son consentement.
// Un avis légal sans changement lisible ne vaut rien.
//
// Aucun opt-out : ce sont des messages de service (art. 12 RGPD). Le retrait du
// CONSENTEMENT, lui, reste possible depuis le portail — c'est ce que le lien
// permet.
// =====================================================================

import (
	"context"
	"fmt"
	"html"
	"log"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api/internal/database"
)

// RunLegalNoticeLoop expédie les avis légaux en attente. Sans provider, le
// drain est désactivé proprement (les livraisons restent QUEUED et partiront
// dès qu'un fournisseur est configuré).
func RunLegalNoticeLoop(ctx context.Context, pool *pgxpool.Pool, provider EmailProvider, from string, portalBase string, interval time.Duration, batch int) {
	if provider == nil || pool == nil {
		log.Println("[legal-notice] désactivé (EMAIL_PROVIDER non configuré)")
		return
	}
	if interval <= 0 {
		interval = time.Minute
	}
	if batch <= 0 {
		batch = 50
	}
	log.Printf("[legal-notice] fournisseur=%s (interval %s, lot %d)", provider.Name(), interval, batch)

	runOnce := func() {
		sent, failed, err := drainLegalNoticesOnce(ctx, pool, provider, from, portalBase, batch)
		if err != nil {
			log.Printf("[legal-notice] %v", err)
			return
		}
		if sent > 0 || failed > 0 {
			log.Printf("[legal-notice] envoyés=%d échecs=%d", sent, failed)
		}
	}
	runOnce()
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			runOnce()
		}
	}
}

// drainLegalNoticesOnce traite jusqu'à `batch` livraisons QUEUED.
func drainLegalNoticesOnce(ctx context.Context, pool *pgxpool.Pool, provider EmailProvider, from, portalBase string, batch int) (sent, failed int, err error) {
	if provider == nil || pool == nil {
		return 0, 0, nil
	}
	q := db.New(pool)
	claimed, err := q.ClaimLegalNoticeDeliveries(ctx, int32(batch))
	if err != nil {
		return 0, 0, err
	}

	for _, item := range claimed {
		msg, buildErr := buildLegalNoticeEmail(ctx, q, item, from, portalBase)
		if buildErr != nil {
			_ = q.MarkLegalNoticeDelivery(ctx, db.MarkLegalNoticeDeliveryParams{
				ID: item.ID, Status: "FAILED", LastError: noticeText(buildErr.Error()),
			})
			failed++
			continue
		}
		if sendErr := provider.Send(ctx, msg); sendErr != nil {
			_ = q.MarkLegalNoticeDelivery(ctx, db.MarkLegalNoticeDeliveryParams{
				ID: item.ID, Status: "FAILED", Provider: noticeText(provider.Name()),
				LastError: noticeText(sendErr.Error()),
			})
			failed++
			continue
		}
		if err := q.MarkLegalNoticeDelivery(ctx, db.MarkLegalNoticeDeliveryParams{
			ID: item.ID, Status: "SENT", Provider: noticeText(provider.Name()),
			SentAt: pgtype.Timestamp{Time: time.Now(), Valid: true},
		}); err != nil {
			log.Printf("[legal-notice] statut SENT non persisté (%s): %v", item.ID, err)
		}
		sent++
	}
	return sent, failed, nil
}

// noticeText convertit une chaîne en colonne texte nullable.
func noticeText(s string) pgtype.Text {
	if strings.TrimSpace(s) == "" {
		return pgtype.Text{}
	}
	return pgtype.Text{String: s, Valid: true}
}

// buildLegalNoticeEmail construit l'email d'information : document, version,
// changelog et lien vers le portail de re-consentement.
func buildLegalNoticeEmail(ctx context.Context, q *db.Queries, item db.ClaimLegalNoticeDeliveriesRow, from, portalBase string) (EmailMessage, error) {
	notice, err := q.GetLegalNoticeEmailContext(ctx, db.GetLegalNoticeEmailContextParams{
		UserID:   item.UserID,
		NoticeID: item.NoticeID,
	})
	if err != nil {
		return EmailMessage{}, err
	}

	base := strings.TrimRight(strings.TrimSpace(portalBase), "/")
	if base == "" {
		base = "https://qoe.fi"
	}
	link := base + notice.PortalPath
	title := html.EscapeString(notice.Title)
	version := html.EscapeString(notice.Version)
	pseudo := strings.TrimSpace(notice.RecipientName)

	greeting := "Bonjour"
	if pseudo != "" {
		greeting = "Bonjour " + html.EscapeString(pseudo)
	}

	changeBlock := ""
	if notice.Changelog.Valid && strings.TrimSpace(notice.Changelog.String) != "" {
		changeBlock = fmt.Sprintf(
			`<div style="margin:16px 0;padding:12px 16px;border-left:3px solid #EE4B2B;background:#faf7f6;">
  <p style="margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#71717a;">Ce qui change</p>
  <p style="margin:0;color:#3f3f46;font-size:14px;line-height:1.6;white-space:pre-line;">%s</p>
</div>`, html.EscapeString(notice.Changelog.String))
	}

	htmlBody := fmt.Sprintf(`<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#18181b;">
  <h2 style="margin:0 0 12px;font-size:20px;">%s</h2>
  <p style="color:#3f3f46;font-size:14px;line-height:1.6;">
    Nous avons publié une nouvelle version de <strong>%s</strong> (version %s). Comme ce document
    fait partie de ceux que vous avez acceptés, votre confirmation est nécessaire pour continuer à
    utiliser votre compte.
  </p>
  %s
  <p style="margin:24px 0;">
    <a href="%s" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:600;font-size:14px;">
      Lire et confirmer
    </a>
  </p>
  <p style="color:#71717a;font-size:12px;line-height:1.6;">
    Vous pouvez lire le texte complet et l&apos;historique des versions avant de vous prononcer.
    Refuser un document obligatoire entraîne la fermeture du compte ; vos données restent
    récupérables pendant la période de rétention prévue par notre politique de confidentialité.
  </p>
  <p style="margin-top:24px;font-size:12px;color:#a1a1aa;">
    Cet e-mail est un message de service envoyé par qoefi : il informe d&apos;un changement de
    conditions et ne peut pas être désabonné.
  </p>
</div>`, greeting, title, version, changeBlock, link)

	subjectVersion := notice.Version
	msg := EmailMessage{
		From:    from,
		To:      item.Email,
		Subject: fmt.Sprintf("%s : nouvelle version (%s) — qoefi", notice.Title, subjectVersion),
		HTML:    htmlBody,
	}
	return msg, nil
}
