package workers

// =====================================================================
// 🔄 Cycle de vie légal + rappels aux superadmins
// =====================================================================
// Deux responsabilités dans une boucle, dans cet ordre :
//
//   1. le **cycle** lui-même (ouverture des revues, brouillon proposé,
//      publication planifiée) — injecté sous forme de fonction pour que ce
//      paquet n'ait pas à connaître le module legal ;
//   2. le **drain des rappels** (`legal_review_reminder`), qui réclame
//      atomiquement les rappels en attente, appelle le fournisseur email
//      partagé, puis marque SENT ou FAILED.
//
// Sans fournisseur email, le cycle continue de tourner : les revues
// s'ouvrent et les brouillons se préparent même si personne ne peut encore
// être prévenu. Le jour où un fournisseur est configuré, la file se vide.
//
// Le cycle tourne aussi sans lui-même tourner (fonction nil) : on peut ne
// brancher que le rappel, ou que le cycle.
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

// RunLegalLifecycleLoop exécute le cycle puis draine les rappels.
//
//   - run : passe unique du cycle (nil = ne pas piloter le cycle ici) ;
//   - provider : fournisseur email partagé (nil = rappels laissés en file).
func RunLegalLifecycleLoop(
	ctx context.Context,
	pool *pgxpool.Pool,
	provider EmailProvider,
	from string,
	adminBase string,
	interval time.Duration,
	batch int,
	run func(context.Context) error,
) {
	if pool == nil {
		return
	}
	if interval <= 0 {
		interval = 15 * time.Minute
	}
	if batch <= 0 {
		batch = 50
	}
	log.Printf("[legal-lifecycle] démarré (interval %s, rappels lot %d, email=%t)", interval, batch, provider != nil)

	tick := func() {
		if run != nil {
			if err := run(ctx); err != nil {
				log.Printf("[legal-lifecycle] cycle: %v", err)
			}
		}
		if provider == nil {
			return
		}
		sent, failed, err := drainLegalReviewRemindersOnce(ctx, pool, provider, from, adminBase, batch)
		if err != nil {
			log.Printf("[legal-lifecycle] rappels: %v", err)
			return
		}
		if sent > 0 || failed > 0 {
			log.Printf("[legal-lifecycle] rappels envoyés=%d échecs=%d", sent, failed)
		}
	}

	tick()
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			tick()
		}
	}
}

// drainLegalReviewRemindersOnce expédie jusqu'à `batch` rappels QUEUED.
func drainLegalReviewRemindersOnce(ctx context.Context, pool *pgxpool.Pool, provider EmailProvider, from, adminBase string, batch int) (sent, failed int, err error) {
	if provider == nil || pool == nil {
		return 0, 0, nil
	}
	q := db.New(pool)
	claimed, err := q.ClaimLegalReviewReminders(ctx, int32(batch))
	if err != nil {
		return 0, 0, err
	}

	for _, item := range claimed {
		msg, buildErr := buildLegalReviewReminderEmail(ctx, q, item, from, adminBase)
		if buildErr != nil {
			_ = q.MarkLegalReviewReminder(ctx, db.MarkLegalReviewReminderParams{
				ID: item.ID, Status: "FAILED", LastError: noticeText(buildErr.Error()),
			})
			failed++
			continue
		}
		if sendErr := provider.Send(ctx, msg); sendErr != nil {
			// Reprise dans 15 minutes : un incident SMTP ne doit pas perdre
			// l'échéance, mais ne doit pas non plus boucler serré.
			_ = q.MarkLegalReviewReminder(ctx, db.MarkLegalReviewReminderParams{
				ID: item.ID, Status: "FAILED", Provider: noticeText(provider.Name()),
				LastError:   noticeText(sendErr.Error()),
				AvailableAt: pgtype.Timestamp{Time: time.Now().Add(15 * time.Minute), Valid: true},
			})
			failed++
			continue
		}
		if err := q.MarkLegalReviewReminder(ctx, db.MarkLegalReviewReminderParams{
			ID: item.ID, Status: "SENT", Provider: noticeText(provider.Name()),
			SentAt: pgtype.Timestamp{Time: time.Now(), Valid: true},
		}); err != nil {
			log.Printf("[legal-lifecycle] statut SENT non persisté (%s): %v", item.ID, err)
		}
		sent++
	}
	return sent, failed, nil
}

// buildLegalReviewReminderEmail compose le rappel : quelle revue, pourquoi
// cette échéance, ce qui est déjà prêt, et où agir.
func buildLegalReviewReminderEmail(ctx context.Context, q *db.Queries, item db.ClaimLegalReviewRemindersRow, from, adminBase string) (EmailMessage, error) {
	info, err := q.GetLegalReviewReminderContext(ctx, item.ID)
	if err != nil {
		return EmailMessage{}, err
	}

	base := strings.TrimRight(strings.TrimSpace(adminBase), "/")
	if base == "" {
		base = "https://admin.qoe.fi"
	}
	link := base + "/admin/compliance"

	rawTitle := info.DocumentTitle
	greeting := "Bonjour"
	if pseudo := strings.TrimSpace(info.RecipientName); pseudo != "" {
		greeting = "Bonjour " + html.EscapeString(pseudo)
	}

	dueAt := ""
	if info.DueAt.Valid {
		dueAt = info.DueAt.Time.UTC().Format("02/01/2006")
	}

	headline, lead := stageCopy(info.Stage, rawTitle, dueAt)

	// Le motif de l'échéance est repris tel quel : celui qui reçoit le rappel
	// doit pouvoir vérifier d'où il sort sans fouiller le code.
	legal := ""
	if info.Notes.Valid && strings.TrimSpace(info.Notes.String) != "" {
		legal = fmt.Sprintf(
			`<div style="margin:16px 0;padding:12px 16px;border-left:3px solid #71717a;background:#fafafa;">
  <p style="margin:0;color:#52525b;font-size:13px;line-height:1.6;">%s</p>
</div>`, html.EscapeString(info.Notes.String))
	}

	draftBlock := ""
	if strings.TrimSpace(info.DraftVersion) != "" {
		scheduled := ""
		if info.DraftScheduledAt.Valid {
			scheduled = fmt.Sprintf(
				`<p style="margin:6px 0 0;color:#3f3f46;font-size:14px;">Publication planifiée le <strong>%s</strong> — elle partira automatiquement à cette date si personne ne la déplace.</p>`,
				info.DraftScheduledAt.Time.UTC().Format("02/01/2006 15:04")+" UTC",
			)
		} else {
			scheduled = `<p style="margin:6px 0 0;color:#3f3f46;font-size:14px;">Aucune date programmée : relisez puis publiez, ou fixez une fenêtre de publication.</p>`
		}
		draftBlock = fmt.Sprintf(
			`<div style="margin:16px 0;padding:12px 16px;border-left:3px solid #EE4B2B;background:#faf7f6;">
  <p style="margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#71717a;">Brouillon prêt</p>
  <p style="margin:0;color:#3f3f46;font-size:14px;line-height:1.6;">Version <strong>%s</strong> — le texte publié a été repris comme point de départ.</p>
  %s
</div>`, html.EscapeString(info.DraftVersion), scheduled)
	}

	body := fmt.Sprintf(`<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#18181b;">
  <p style="margin:0 0 6px;color:#71717a;font-size:13px;">%s,</p>
  <h2 style="margin:0 0 12px;font-size:20px;">%s</h2>
  <p style="color:#3f3f46;font-size:14px;line-height:1.6;">%s</p>
  %s
  %s
  <p style="margin:24px 0;">
    <a href="%s" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:600;font-size:14px;">
      Ouvrir la console de conformité
    </a>
  </p>
  <p style="color:#71717a;font-size:12px;line-height:1.6;">
    Vous recevez ce rappel parce que votre compte est superadmin. Un même palier
    n'est notifié qu'une fois : vous serez prévenu à nouveau si l'échéance se
    dégrade, jamais pour vous relancer deux fois pour la même chose.
  </p>
</div>`,
		greeting,
		html.EscapeString(headline),
		html.EscapeString(lead),
		legal,
		draftBlock,
		link,
	)

	return EmailMessage{
		From:    from,
		To:      item.Email,
		Subject: fmt.Sprintf("[qoefi] %s — %s", headline, rawTitle),
		HTML:    body,
	}, nil
}

// stageCopy traduit un palier en une phrase d'objet et de corps.
func stageCopy(stage, title, dueAt string) (headline, lead string) {
	switch stage {
	case "DRAFTED":
		return "Brouillon prêt à publier",
			"Le brouillon de revue de « " + title + " » est prêt. Il ne reste plus qu'à le relire et à le publier — " +
				"c'est cette publication qui remet le compteur d'échéance à zéro."
	case "OVERDUE":
		return "Revue réglementaire en retard",
			"La revue périodique de « " + title + " » devait être faite le " + dueAt + " : elle est dépassée depuis ce jour. " +
				"Un brouillon a été préparé automatiquement pour que la relecture ne parte pas d'une page blanche."
	case "SOON":
		return "Revue réglementaire à programmer",
			"La revue périodique de « " + title + " » arrive à échéance le " + dueAt + ". " +
				"Un brouillon a été préparé automatiquement : relisez-le, ajustez-le, puis publiez-le avant la date."
	default:
		return "Revue réglementaire à traiter",
			"Une échéance de revue concerne « " + title + " »."
	}
}
