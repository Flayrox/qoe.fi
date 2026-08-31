package workers

// =====================================================================
// 📮 Draining de la boîte d'envoi email (NotificationDelivery, channel EMAIL)
// =====================================================================
// Contrat : quand NOTIFICATION_DELIVERY_ENABLED=true, le worker récupère les
// lignes QUEUED (disponibles), les marque PROCESSING de façon atomique
// (FOR UPDATE SKIP LOCKED → plusieurs instances sans double envoi), appelle
// l'EmailProvider, puis SENT / FAILED (+ lastError exploitable).
//
// Le même EmailProvider (SMTP self-hosté ou Resend, cf. email_provider.go)
// est le bloc partagé avec le fanout newsletter : celui-ci crée ses propres
// lignes dans la même table avant de laisser ce drainer les expédier.

import (
	"context"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// RunEmailDeliveryLoop draine la boîte d'envoi au démarrage puis à intervalle
// régulier. Sans provider (EMAIL_PROVIDER non configuré) : désactivé.
func RunEmailDeliveryLoop(ctx context.Context, pool *pgxpool.Pool, provider EmailProvider, from string, interval time.Duration, batch int) {
	if provider == nil || pool == nil {
		log.Println("[email-delivery] désactivé (EMAIL_PROVIDER non configuré)")
		return
	}
	log.Printf("[email-delivery] fournisseur=%s (interval %s, lot %d)", provider.Name(), interval, batch)
	runOnce := func() {
		sent, failed, err := drainNotificationEmailOutboxOnce(ctx, pool, provider, from, batch)
		if err != nil {
			log.Printf("[email-delivery] %v", err)
			return
		}
		if sent > 0 || failed > 0 {
			log.Printf("[email-delivery] envoyés=%d échecs=%d", sent, failed)
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

// drainNotificationEmailOutboxOnce traite jusqu'à `batch` livraisons QUEUED.
// La prise de ligne est atomique (QUEUED → PROCESSING) : plusieurs instances
// du worker peuvent tourner sans envoyer deux fois le même email.
func drainNotificationEmailOutboxOnce(ctx context.Context, pool *pgxpool.Pool, provider EmailProvider, from string, batch int) (sent, failed int, err error) {
	if provider == nil || pool == nil {
		return 0, 0, nil
	}
	if batch <= 0 {
		batch = 50
	}

	// 1) Réclamation atomique (QUEUED → PROCESSING, attempts+1).
	const claim = `
WITH candidates AS (
	SELECT id FROM "NotificationDelivery"
	WHERE channel = 'EMAIL' AND status = 'QUEUED' AND "availableAt" <= now()
	ORDER BY "createdAt" ASC
	FOR UPDATE SKIP LOCKED
	LIMIT $1
)
UPDATE "NotificationDelivery" nd
SET status = 'PROCESSING',
    attempts = nd.attempts + 1,
    "updatedAt" = now()
FROM candidates c
WHERE nd.id = c.id
RETURNING nd.id, nd.recipient, nd."notificationId"`

	rows, err := pool.Query(ctx, claim, batch)
	if err != nil {
		return 0, 0, err
	}
	type claimed struct {
		id             string
		recipient      string
		notificationID string
	}
	var claimedRows []claimed
	for rows.Next() {
		var c claimed
		if err := rows.Scan(&c.id, &c.recipient, &c.notificationID); err != nil {
			continue
		}
		claimedRows = append(claimedRows, c)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, 0, err
	}

	for _, c := range claimedRows {
		msg, buildErr := buildNotificationEmail(ctx, pool, c.recipient, c.notificationID, from)
		if buildErr != nil {
			_ = markDelivery(ctx, pool, c.id, "FAILED", "", buildErr.Error())
			failed++
			continue
		}
		if err := provider.Send(ctx, msg); err != nil {
			_ = markDelivery(ctx, pool, c.id, "FAILED", provider.Name(), err.Error())
			failed++
			continue
		}
		if err := markDelivery(ctx, pool, c.id, "SENT", provider.Name(), ""); err != nil {
			log.Printf("[email-delivery] statut SENT non persisté (%s): %v", c.id, err)
		}
		sent++
	}
	return sent, failed, nil
}

// buildNotificationEmail construit un email minimal à partir de la
// notification (type + nom de l'émetteur) — template enrichissable plus tard.
func buildNotificationEmail(ctx context.Context, pool *pgxpool.Pool, recipient, notificationID, from string) (EmailMessage, error) {
	var nType, senderName string
	err := pool.QueryRow(ctx, `
		SELECT n.type::text, COALESCE(u.name, u.username, 'Un membre')
		FROM "Notification" n
		LEFT JOIN "User" u ON u.id = n."senderId"
		WHERE n.id = $1`, notificationID).Scan(&nType, &senderName)
	if err != nil {
		return EmailMessage{}, err
	}

	label := notificationTypeLabel(nType)
	subject := senderName + " " + label + " — qoe.fi"
	html := `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#18181b;">
  <h2 style="margin:0 0 12px;">` + senderName + ` ` + label + `</h2>
  <p style="color:#3f3f46;font-size:14px;line-height:1.6;">Vous avez une nouvelle notification sur <strong>qoe.fi</strong>. Connectez-vous pour la consulter.</p>
  <p style="margin-top:24px;font-size:12px;color:#a1a1aa;">Cet e-mail automatique vous est envoyé par qoe.fi pour la protection de votre compte.</p>
</div>`
	return EmailMessage{From: from, To: recipient, Subject: subject, HTML: html}, nil
}

// notificationTypeLabel traduit le type de notification en libellé court.
func notificationTypeLabel(t string) string {
	switch t {
	case "LIKE":
		return "a aimé votre publication"
	case "REPOST":
		return "a repartagé votre publication"
	case "REPLY":
		return "a répondu à votre publication"
	case "COMMENT":
		return "a commenté votre article"
	case "MENTION":
		return "vous a mentionné"
	case "FOLLOW":
		return "vous suit désormais"
	case "MEDIA_INVITE":
		return "vous a invité dans son Média"
	case "MEDIA_MEMBER_JOINED":
		return "a rejoint votre Média"
	case "MEDIA_ARTICLE_PUBLISHED":
		return "a publié un article dans le Média"
	case "MEDIA_ARTICLE_SUBMITTED":
		return "a soumis un article pour revue"
	case "ARTICLE_CONTRIBUTOR_INVITED":
		return "vous a invité à contribuer"
	case "ARTICLE_CONTRIBUTOR_ACCEPTED":
		return "a accepté votre invitation"
	case "ARTICLE_CONTRIBUTOR_DECLINED":
		return "a refusé votre invitation"
	case "ARTICLE_CONTRIBUTOR_REMOVED":
		return "a retiré votre attribution"
	default:
		return "vous a envoyé une notification"
	}
}

// markDelivery enregistre l'issue d'une livraison (SENT/FAILED).
func markDelivery(ctx context.Context, pool *pgxpool.Pool, id, status, provider, lastError string) error {
	var sentAt any
	if status == "SENT" {
		sentAt = time.Now()
	}
	_, err := pool.Exec(ctx, `
		UPDATE "NotificationDelivery"
		SET status = $2, provider = $3, "lastError" = $4, "sentAt" = $5, "updatedAt" = now()
		WHERE id = $1`, id, status, provider, lastError, sentAt)
	return err
}
