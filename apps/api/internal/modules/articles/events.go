// =====================================================================
// 📜 Historique de publication — journal append-only
// =====================================================================
// Chaque transition qui change l'état public d'un article écrit une ligne
// dans "ArticleEvent". Le studio affiche cette chronologie au créateur :
// publication, mise à jour en ligne, dépublication, programmation,
// reprogrammation, publication automatique, cycle de relecture.
//
// Règles :
//   - jamais de mise à jour ni de suppression d'un événement ;
//   - l'écriture ne doit JAMAIS faire échouer l'action métier : une erreur
//     est journalisée et avalée (une publication ne se refuse pas parce que
//     l'audit a échoué) ;
//   - l'acteur est optionnel : le planificateur publie sans utilisateur.
// =====================================================================

package articles

import (
	"context"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
)

// Types d'événements — la liste est contrainte en base (CHECK).
const (
	EventCreated            = "CREATED"
	EventPublished          = "PUBLISHED"
	EventLiveUpdated        = "LIVE_UPDATED"
	EventUnpublished        = "UNPUBLISHED"
	EventScheduled          = "SCHEDULED"
	EventRescheduled        = "RESCHEDULED"
	EventScheduleCancelled  = "SCHEDULE_CANCELLED"
	EventScheduledPublished = "SCHEDULED_PUBLISHED"
	EventSubmitted          = "SUBMITTED"
	EventApproved           = "APPROVED"
	EventRejected           = "REJECTED"
)

// ArticleEvent est une entrée de la chronologie telle que servie à l'éditeur.
type ArticleEvent struct {
	ID            string     `json:"id"`
	Type          string     `json:"type"`
	FromStatus    string     `json:"fromStatus,omitempty"`
	ToStatus      string     `json:"toStatus,omitempty"`
	ScheduledAt   *time.Time `json:"scheduledAt,omitempty"`
	ActorID       string     `json:"actorId,omitempty"`
	ActorName     string     `json:"actorName,omitempty"`
	ActorUsername string     `json:"actorUsername,omitempty"`
	CreatedAt     time.Time  `json:"createdAt"`
}

// EventInput décrit un événement à enregistrer.
type EventInput struct {
	ArticleID     string
	PublicationID string
	// ActorID vide = action automatique (planificateur).
	ActorID     string
	Type        string
	FromStatus  string
	ToStatus    string
	ScheduledAt *time.Time
}

// recordEvent écrit une entrée d'historique. Silencieux en cas d'échec.
func (s *Service) recordEvent(ctx context.Context, in EventInput) {
	if s == nil || s.pool == nil || in.ArticleID == "" || in.Type == "" {
		return
	}

	var publicationID *string
	if in.PublicationID != "" {
		publicationID = &in.PublicationID
	}
	var scheduledAt pgtype.Timestamp
	if in.ScheduledAt != nil {
		scheduledAt = pgtype.Timestamp{Time: in.ScheduledAt.UTC(), Valid: true}
	}

	_, err := s.pool.Exec(ctx, `
		INSERT INTO "ArticleEvent" ("articleId", "publicationId", "actorId", "type", "fromStatus", "toStatus", "scheduledAt")
		VALUES ($1, $2, NULLIF($3, '')::uuid, $4, NULLIF($5, ''), NULLIF($6, ''), $7)`,
		in.ArticleID, publicationID, in.ActorID, in.Type,
		in.FromStatus, in.ToStatus, scheduledAt,
	)
	if err != nil {
		log.Printf("[articles] historique (article %s, %s) : %v", in.ArticleID, in.Type, err)
	}
}

// statusOrDraft évite d'écrire une chaîne vide dans fromStatus/toStatus.
func statusOrDraft(status string) string {
	if status == "" {
		return "DRAFT"
	}
	return status
}

// ListEvents renvoie la chronologie d'un article, la plus récente d'abord.
// Accès : mêmes droits que l'édition (auteur, média autorisé, co-auteur).
func (s *Service) ListEvents(ctx context.Context, articleID, userID string, limit int32) ([]ArticleEvent, error) {
	if _, _, err := s.authorizeEdit(ctx, articleID, userID, ""); err != nil {
		return nil, err
	}
	if limit <= 0 || limit > 200 {
		limit = 100
	}

	rows, err := s.pool.Query(ctx, `
		SELECT e.id,
		       e.type,
		       COALESCE(e."fromStatus", ''),
		       COALESCE(e."toStatus", ''),
		       e."scheduledAt",
		       COALESCE(e."actorId"::text, ''),
		       COALESCE(u.name, ''),
		       COALESCE(u.username, ''),
		       e."createdAt"
		FROM "ArticleEvent" e
		LEFT JOIN "User" u ON u.id = e."actorId"
		WHERE e."articleId" = $1
		ORDER BY e."createdAt" DESC
		LIMIT $2`, articleID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	events := make([]ArticleEvent, 0, 16)
	for rows.Next() {
		var ev ArticleEvent
		var scheduledAt pgtype.Timestamp
		if err := rows.Scan(
			&ev.ID, &ev.Type, &ev.FromStatus, &ev.ToStatus, &scheduledAt,
			&ev.ActorID, &ev.ActorName, &ev.ActorUsername, &ev.CreatedAt,
		); err != nil {
			return nil, err
		}
		if scheduledAt.Valid {
			t := scheduledAt.Time
			ev.ScheduledAt = &t
		}
		events = append(events, ev)
	}
	return events, rows.Err()
}
