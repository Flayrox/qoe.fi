package legal

// =====================================================================
// 🔄 Cycle de vie légal — un texte ne périme pas tout seul
// =====================================================================
// Le tableau de bord de conformité dit « cette revue est en retard ». Il ne
// fait rien. Ce fichier fait le travail, une fois par jour, sans que personne
// ait à y penser :
//
//   1. **Revue ouverte** — dès qu'une échéance réglementaire approche (30 j) ou
//      est dépassée, une revue est ouverte. Une échéance = une revue : rejouer
//      le cycle ne duplique rien (contrainte d'unicité en base, pas seulement
//      une garde applicative).
//   2. **Brouillon proposé** — la revue n'est pas une alerte vide : elle arrive
//      avec un brouillon reprenant le texte publié, prêt à être retravaillé.
//      Relire coûte moins cher que repartir d'une page blanche, donc on le fait.
//   3. **Rappel envoyé** — un email aux superadmins, une fois par palier
//      (`SOON`, puis `OVERDUE`, puis `DRAFTED`). L'escalade est dans le temps,
//      pas dans le nombre de relances : trois emails maximum par revue.
//   4. **Publication planifiée** — un brouillon peut être publié automatiquement
//      dans une fenêtre choisie. Le chemin est *exactement* celui d'une
//      publication manuelle : archivage de l'ancienne version, avis aux
//      personnes concernées, clôture de la revue.
//
// Les actions du cycle automatique n'écrivent pas de journal d'audit
// superadmin (aucun acteur humain) : la trace, ce sont les lignes
// `legal_review` et leurs rappels — qui disent quoi, quand et à qui.
// =====================================================================

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
)

const (
	// Palier « bientôt » : au-delà, on ne prévient pas encore.
	reviewSoonDays = obligationDueSoonDays
	// Nombre maximum de versions publiées par passage (garde-fou).
	reviewPublishBatch = 10
)

// ReviewStage est le palier de rappel d'une revue.
const (
	ReviewStageSoon    = "SOON"
	ReviewStageOverdue = "OVERDUE"
	ReviewStageDrafted = "DRAFTED"
)

// LegalReview est une revue périodique, exposée à la console.
type LegalReview struct {
	ID               string     `json:"id"`
	DocumentID       string     `json:"documentId"`
	DocumentSlug     string     `json:"documentSlug"`
	Audience         string     `json:"audience"`
	RuleKey          string     `json:"ruleKey"`
	Label            string     `json:"label"`
	Legal            string     `json:"legal"`
	DueAt            *time.Time `json:"dueAt,omitempty"`
	DaysLeft         int        `json:"daysLeft"`
	Status           string     `json:"status"`
	DraftVersionID   *string    `json:"draftVersionId,omitempty"`
	DraftVersion     string     `json:"draftVersion,omitempty"`
	DraftScheduledAt *time.Time `json:"draftScheduledAt,omitempty"`
	Notes            *string    `json:"notes,omitempty"`
	OpenedAt         *time.Time `json:"openedAt,omitempty"`
	CompletedAt      *time.Time `json:"completedAt,omitempty"`
	Reminders        int64      `json:"reminders"`
	RemindersSent    int64      `json:"remindersSent"`
}

// LifecycleRun est le compte rendu d'un passage du cycle.
type LifecycleRun struct {
	RanAt           time.Time `json:"ranAt"`
	ReviewsOpened   int       `json:"reviewsOpened"`
	DraftsProposed  int       `json:"draftsProposed"`
	RemindersQueued int       `json:"remindersQueued"`
	Published       []string  `json:"published"`
	Errors          []string  `json:"errors"`
}

// RunLifecycle exécute un passage complet. Sans acteur : appelé par le worker.
func (s *Service) RunLifecycle(ctx context.Context, now time.Time) (*LifecycleRun, error) {
	now = now.UTC()
	run := &LifecycleRun{RanAt: now, Published: []string{}, Errors: []string{}}

	// 1) Ouvrir les revues dont l'échéance approche ou est dépassée.
	if err := s.openDueReviews(ctx, now, run); err != nil {
		run.Errors = append(run.Errors, err.Error())
	}

	// 2) Proposer un brouillon pour chaque revue ouverte qui n'en a pas.
	if err := s.proposeDraftsForOpenReviews(ctx, run); err != nil {
		run.Errors = append(run.Errors, err.Error())
	}

	// 3) Prévenir les superadmins (un email par palier franchi).
	queued, err := s.queueReviewReminders(ctx, now)
	if err != nil {
		run.Errors = append(run.Errors, err.Error())
	} else {
		run.RemindersQueued = queued
	}

	// 4) Publier les brouillons arrivés dans leur fenêtre planifiée.
	published, errs := s.publishScheduledVersions(ctx, now, reviewPublishBatch)
	run.Published = published
	for _, e := range errs {
		run.Errors = append(run.Errors, e.Error())
	}

	return run, nil
}

// openDueReviews crée les revues manquantes pour les échéances atteintes.
func (s *Service) openDueReviews(ctx context.Context, now time.Time, run *LifecycleRun) error {
	rows, err := s.q.ListLegalComplianceDocuments(ctx)
	if err != nil {
		return err
	}
	lastPublished := make(map[string]time.Time, len(rows))
	for _, r := range rows {
		if ts := tsTime(r.LastPublishedAt); ts != nil {
			lastPublished[r.Slug] = *ts
		}
	}

	horizon := now.AddDate(0, 0, reviewSoonDays)
	for _, rule := range obligationRules() {
		last, ok := lastPublished[rule.Document]
		if !ok {
			// Document jamais publié : c'est un autre problème, déjà signalé
			// comme critique par le tableau de conformité. On n'ouvre pas une
			// revue sur un texte qui n'existe pas.
			continue
		}
		next := last.Add(rule.Cadence)
		if next.After(horizon) {
			continue
		}
		doc, err := s.q.GetLegalDocumentBySlugAdmin(ctx, rule.Document)
		if err != nil {
			run.Errors = append(run.Errors, fmt.Sprintf("revue %s: document %s illisible: %v", rule.Key, rule.Document, err))
			continue
		}
		review, err := s.q.UpsertLegalReview(ctx, db.UpsertLegalReviewParams{
			DocumentID: doc.ID,
			RuleKey:    rule.Key,
			DueAt:      pgtype.Timestamp{Time: next, Valid: true},
			Notes:      optText(rule.Label + " — " + rule.Legal),
		})
		if err != nil {
			run.Errors = append(run.Errors, fmt.Sprintf("revue %s: ouverture impossible: %v", rule.Key, err))
			continue
		}
		if review.Status == "OPEN" && !review.DraftVersionID.Valid {
			run.ReviewsOpened++
		}
	}
	return nil
}

// proposeDraftsForOpenReviews prépare un brouillon reprenant le texte publié.
func (s *Service) proposeDraftsForOpenReviews(ctx context.Context, run *LifecycleRun) error {
	reviews, err := s.q.ListOpenLegalReviews(ctx)
	if err != nil {
		return err
	}
	for _, review := range reviews {
		if review.DraftVersionID.Valid {
			continue
		}
		base, err := s.q.GetReferencePublishedVersion(ctx, review.DocumentID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				continue
			}
			run.Errors = append(run.Errors, fmt.Sprintf("brouillon %s: lecture du texte publié impossible: %v", review.DocumentSlug, err))
			continue
		}
		due := tsTime(review.DueAt)
		version := reviewVersionLabel(base.Version, due)
		changelog := "Revue périodique programmée. Le texte publié est repris tel quel à titre de point de départ : " +
			"relisez-le, corrigez ce qui doit l'être, puis publiez cette version."
		if due != nil {
			changelog = fmt.Sprintf("Revue périodique échue le %s. ", due.Format("02/01/2006")) + changelog
		}
		draft, err := s.q.InsertLegalDocumentVersion(ctx, db.InsertLegalDocumentVersionParams{
			DocumentID: review.DocumentID,
			Locale:     base.Locale,
			Version:    version,
			Title:      base.Title,
			Summary:    base.Summary,
			Body:       base.Body,
			Changelog:  optText(changelog),
			CreatedBy:  pgtype.UUID{},
		})
		if err != nil {
			if isUniqueViolation(err) {
				// Une revue antérieure a déjà produit ce brouillon : on
				// s'aligne dessus plutôt que d'échouer bruyamment.
				continue
			}
			run.Errors = append(run.Errors, fmt.Sprintf("brouillon %s: création impossible: %v", review.DocumentSlug, err))
			continue
		}
		if _, err := s.q.SetLegalReviewDraft(ctx, db.SetLegalReviewDraftParams{
			DraftVersionID: optText(draft.ID),
			ID:             review.ID,
		}); err != nil {
			run.Errors = append(run.Errors, fmt.Sprintf("brouillon %s: rattachement à la revue impossible: %v", review.DocumentSlug, err))
			continue
		}
		run.DraftsProposed++
	}
	return nil
}

// queueReviewReminders programme les rappels non encore émis.
func (s *Service) queueReviewReminders(ctx context.Context, now time.Time) (int, error) {
	reviews, err := s.q.ListOpenLegalReviews(ctx)
	if err != nil {
		return 0, err
	}
	if len(reviews) == 0 {
		return 0, nil
	}
	admins, err := s.q.ListLegalSuperadmins(ctx)
	if err != nil {
		return 0, err
	}
	if len(admins) == 0 {
		// Aucun destinataire : mieux vaut le dire une fois que boucler.
		log.Printf("[legal-review] aucune adresse superadmin : rappels non programmés")
		return 0, nil
	}

	queued := int64(0)
	for _, review := range reviews {
		stage := reviewStage(review, now)
		if stage == "" {
			continue
		}
		for _, admin := range admins {
			if strings.TrimSpace(admin.Email) == "" {
				continue
			}
			inserted, err := s.q.InsertLegalReviewReminder(ctx, db.InsertLegalReviewReminderParams{
				ReviewID: review.ID,
				UserID:   toUUID(admin.ID),
				Email:    admin.Email,
				Stage:    stage,
			})
			if err != nil {
				log.Printf("[legal-review] rappel non programmé (%s, %s): %v", review.DocumentSlug, admin.Email, err)
				continue
			}
			queued += inserted
		}
	}
	return int(queued), nil
}

// reviewStage détermine le palier à notifier, "" si rien à faire.
//
// L'ordre des priorités est celui de l'urgence : une échéance dépassée prime
// sur tout le reste, un brouillon prêt sur une échéance lointaine. Un même
// palier n'est notifié qu'une fois, donc une revue laissée de côté produit
// naturellement l'escalade : bientôt → brouillon prêt → en retard.
func reviewStage(review db.ListOpenLegalReviewsRow, now time.Time) string {
	due := tsTime(review.DueAt)
	if due != nil && due.Before(now) {
		return ReviewStageOverdue
	}
	if review.DraftVersionID.Valid && review.Status == "DRAFTED" {
		return ReviewStageDrafted
	}
	if due != nil && !due.After(now.AddDate(0, 0, reviewSoonDays)) {
		return ReviewStageSoon
	}
	return ""
}

// publishScheduledVersions publie les brouillons dont la fenêtre est arrivée.
//
// Chaque publication est réclamée sous verrou dans sa propre transaction :
// deux instances du worker ne peuvent pas publier la même version, et une
// publication à moitié faite n'existe pas.
func (s *Service) publishScheduledVersions(ctx context.Context, now time.Time, max int) ([]string, []error) {
	published := make([]string, 0, max)
	errs := make([]error, 0)

	for i := 0; i < max; i++ {
		tx, err := s.pool.Begin(ctx)
		if err != nil {
			return published, append(errs, err)
		}
		q := s.q.WithTx(tx)

		due, err := q.LockDueScheduledLegalVersion(ctx)
		if err != nil {
			_ = tx.Rollback(ctx)
			if errors.Is(err, pgx.ErrNoRows) {
				return published, errs
			}
			return published, append(errs, err)
		}

		if _, err := publishTxRow(ctx, q, due.ID, due.DocumentID, due.Locale); err != nil {
			_ = tx.Rollback(ctx)
			// On s'arrête : réessayer la même ligne dans la foulée ne ferait
			// que répéter l'échec. Le prochain passage la reprendra.
			return published, append(errs, fmt.Errorf("publication planifiée %s: %w", due.Version, err))
		}
		if err := q.CompleteLegalReviewsForVersion(ctx, optText(due.ID)); err != nil {
			_ = tx.Rollback(ctx)
			return published, append(errs, fmt.Errorf("clôture de revue (version %s): %w", due.Version, err))
		}
		if err := tx.Commit(ctx); err != nil {
			return published, append(errs, err)
		}

		published = append(published, due.ID)
		log.Printf("[legal-lifecycle] version planifiée publiée: %s (%s, %s, prévue %s)",
			due.Version, due.DocumentID, due.Locale, tsText(due.ScheduledAt))

		// 📣 Avis aux personnes concernées : best-effort, après le commit. Une
		// campagne qui échoue ne doit pas défaire une publication actée.
		if version, err := s.q.GetLegalDocumentVersion(ctx, due.ID); err == nil {
			if _, err := s.EnqueueNotice(ctx, "", version); err != nil {
				log.Printf("[legal-lifecycle] avis de publication non préparé (version %s): %v", due.ID, err)
			}
		}
	}
	return published, errs
}

// ─── Actions superadmin ──────────────────────────────────────────────

// AdminReviews liste les revues suivies (ouvertes et récentes).
func (s *Service) AdminReviews(ctx context.Context, actor string, limit int32) ([]LegalReview, error) {
	if err := s.checkSuperadmin(ctx, actor); err != nil {
		return nil, err
	}
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	rows, err := s.q.ListLegalReviewsAdmin(ctx, limit)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	out := make([]LegalReview, 0, len(rows))
	for _, r := range rows {
		out = append(out, *reviewFromRow(r, now))
	}
	return out, nil
}

// ScheduleVersion programme la publication automatique d'un brouillon.
// Une date nulle déprogramme.
func (s *Service) ScheduleVersion(ctx context.Context, actor, versionID, at string) (*Version, error) {
	if err := s.checkSuperadmin(ctx, actor); err != nil {
		return nil, err
	}
	scheduled := parseEffectiveAt(at)
	if strings.TrimSpace(at) != "" && !scheduled.Valid {
		return nil, fmt.Errorf("%w: date de publication invalide (RFC3339 attendue)", errInvalid)
	}
	if scheduled.Valid && scheduled.Time.Before(time.Now().Add(-time.Minute)) {
		return nil, fmt.Errorf("%w: la fenêtre planifiée est déjà passée", errInvalid)
	}
	row, err := s.q.ScheduleLegalDocumentVersion(ctx, db.ScheduleLegalDocumentVersionParams{
		ID:          versionID,
		ScheduledAt: scheduled,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, fmt.Errorf("%w: seule une version en brouillon peut être planifiée", errConflict)
		}
		return nil, err
	}
	s.audit(ctx, actor, "legal.version.schedule", row.DocumentID, map[string]any{
		"versionId": row.ID, "version": row.Version, "scheduledAt": at,
	})
	return adminVersion(row), nil
}

// OpenReview programme une revue à la demande (audit interne, mise à jour
// volontaire) et propose immédiatement son brouillon.
func (s *Service) OpenReview(ctx context.Context, actor, slug, dueAt, notes string) (*LegalReview, error) {
	if err := s.checkSuperadmin(ctx, actor); err != nil {
		return nil, err
	}
	slug = strings.TrimSpace(slug)
	if slug == "" {
		return nil, fmt.Errorf("%w: document requis", errInvalid)
	}
	due := parseEffectiveAt(dueAt)
	if !due.Valid {
		due = pgtype.Timestamp{Time: time.Now().UTC().AddDate(0, 0, reviewSoonDays), Valid: true}
	}
	doc, err := s.q.GetLegalDocumentBySlugAdmin(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errNotFound
		}
		return nil, err
	}
	row, err := s.q.UpsertLegalReview(ctx, db.UpsertLegalReviewParams{
		DocumentID: doc.ID,
		RuleKey:    "manual-" + due.Time.UTC().Format("20060102"),
		DueAt:      due,
		Notes:      optText(strings.TrimSpace(notes)),
	})
	if err != nil {
		return nil, err
	}
	s.audit(ctx, actor, "legal.review.open", doc.ID, map[string]any{
		"reviewId": row.ID, "dueAt": due.Time.UTC().Format(time.RFC3339),
	})

	run := &LifecycleRun{}
	_ = s.proposeDraftsForOpenReviews(ctx, run) // best-effort : la revue existe déjà
	return s.reviewByID(ctx, row.ID)
}

// DismissReview clôt une revue sans publication (décision tracée).
func (s *Service) DismissReview(ctx context.Context, actor, reviewID, notes string) (*LegalReview, error) {
	if err := s.checkSuperadmin(ctx, actor); err != nil {
		return nil, err
	}
	if strings.TrimSpace(notes) == "" {
		return nil, fmt.Errorf("%w: un motif est requis pour clore une revue sans publication", errInvalid)
	}
	if _, err := s.q.DismissLegalReview(ctx, db.DismissLegalReviewParams{
		ID: reviewID, Notes: optText(notes),
	}); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, fmt.Errorf("%w: revue déjà close ou introuvable", errConflict)
		}
		return nil, err
	}
	s.audit(ctx, actor, "legal.review.dismiss", reviewID, map[string]any{"notes": notes})
	return s.reviewByID(ctx, reviewID)
}

// ─── Helpers ─────────────────────────────────────────────────────────

func (s *Service) reviewByID(ctx context.Context, id string) (*LegalReview, error) {
	rows, err := s.q.ListLegalReviewsAdmin(ctx, 500)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	for _, r := range rows {
		if r.ID == id {
			return reviewFromRow(r, now), nil
		}
	}
	return nil, errNotFound
}

func reviewFromRow(row db.ListLegalReviewsAdminRow, now time.Time) *LegalReview {
	due := tsTime(row.DueAt)
	review := &LegalReview{
		ID: row.ID, DocumentID: row.DocumentID, DocumentSlug: row.DocumentSlug,
		Audience: row.Audience, RuleKey: row.RuleKey, Status: row.Status,
		DueAt: due, DraftVersion: row.DraftVersion,
		DraftScheduledAt: tsTime(row.DraftScheduledAt),
		Notes:            textPtr(row.Notes),
		OpenedAt:         tsTime(row.OpenedAt), CompletedAt: tsTime(row.CompletedAt),
		Reminders: row.Reminders, RemindersSent: row.RemindersSent,
	}
	if due != nil {
		review.DaysLeft = int(due.Sub(now).Hours() / 24)
	}
	for _, rule := range obligationRules() {
		if rule.Key == row.RuleKey {
			review.Label = rule.Label
			review.Legal = rule.Legal
		}
	}
	if review.Label == "" {
		review.Label = "Revue programmée"
	}
	return review
}

// reviewVersionLabel produit un numéro de version lisible et rejouable :
// « 1.0.0 » → « 1.0.0-revue-20260912 ». Rejouer le cycle le même jour donne la
// même chaîne, donc pas de doublon ; un jour différent donne un nouveau label.
func reviewVersionLabel(published string, due *time.Time) string {
	base := strings.TrimSpace(published)
	if base == "" {
		base = "1.0.0"
	}
	if i := strings.Index(base, "-revue-"); i > 0 {
		base = base[:i]
	}
	stamp := "00000000"
	if due != nil {
		stamp = due.UTC().Format("20060102")
	}
	return base + "-revue-" + stamp
}

func tsText(t pgtype.Timestamp) string {
	if !t.Valid {
		return "—"
	}
	return t.Time.UTC().Format(time.RFC3339)
}
