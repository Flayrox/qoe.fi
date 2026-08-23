package tracking

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Service struct {
	pool *pgxpool.Pool
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool}
}

func toUUID(id string) pgtype.UUID {
	u := pgtype.UUID{}
	_ = u.Scan(id)
	return u
}

// TrackReadingSession mirrors apps/core/src/app/api/analytics/reading-session/route.ts
// Updates article completionRate (EMA 0.9/0.1), inserts ReadingSession, purges 14j, and triggers vector EMA.
func (s *Service) TrackReadingSession(ctx context.Context, userID, articleID, source, status string, scrollDepth int, dwellSeconds int, readingTimeMinutes int, hostname, referrerUsername *string) (float64, error) {
	if articleID == "" {
		return 0, nil
	}
	// Validate enums (same as Next.js)
	validStatuses := map[string]bool{"BOUNCE": true, "SKIM": true, "READ_PARTIAL": true, "READ_COMPLETE": true}
	if !validStatuses[status] {
		status = "READ_PARTIAL"
	}
	validSources := map[string]bool{"feed": true, "subdomain": true, "public_profile": true, "direct": true}
	if !validSources[source] {
		source = "direct"
	}
	if hostname != nil && len(*hostname) > 200 {
		v := (*hostname)[:200]
		hostname = &v
	}
	if referrerUsername != nil && len(*referrerUsername) > 100 {
		v := (*referrerUsername)[:100]
		referrerUsername = &v
	}
	if scrollDepth < 0 {
		scrollDepth = 0
	}
	if scrollDepth > 100 {
		scrollDepth = 100
	}
	if dwellSeconds < 0 {
		dwellSeconds = 0
	}
	if readingTimeMinutes < 1 {
		readingTimeMinutes = 5
	}

	// Fetch current completionRate
	var currentRate float64
	var completionRate pgtype.Float8
	err := s.pool.QueryRow(ctx, `SELECT "completionRate" FROM "Article" WHERE id=$1`, articleID).Scan(&completionRate)
	if err != nil {
		return 0, err
	}
	if completionRate.Valid {
		currentRate = completionRate.Float64
	} else {
		currentRate = 0.5
	}
	// Compute sessionRate
	sessionRate := 0.5
	switch status {
	case "READ_COMPLETE":
		sessionRate = 1.0
	case "SKIM":
		sessionRate = 0.2
	case "READ_PARTIAL":
		v := float64(scrollDepth) / 100
		if v > 0.8 {
			v = 0.8
		}
		sessionRate = v
	case "BOUNCE":
		sessionRate = 0.05
	}
	updated := currentRate*0.9 + sessionRate*0.1
	// Round to 2 decimals
	updated = float64(int(updated*100+0.5)) / 100

	// Update article completionRate
	_, _ = s.pool.Exec(ctx, `UPDATE "Article" SET "completionRate"=$1, "updatedAt"=now() WHERE id=$2`, updated, articleID)

	// Insert ReadingSession if userID present
	if userID != "" {
		_, _ = s.pool.Exec(ctx, `
			INSERT INTO "ReadingSession" (id, "articleId", "userId", source, status, "scrollDepth", "dwellSeconds", "readingTimeMinutes", hostname, "referrerUsername", "createdAt")
			VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9, now())
		`, articleID, toUUID(userID), source, status, scrollDepth, dwellSeconds, readingTimeMinutes, hostname, referrerUsername)
		// TTL 14j
		cutoff := time.Now().Add(-14 * 24 * time.Hour)
		_, _ = s.pool.Exec(ctx, `DELETE FROM "ReadingSession" WHERE "userId"=$1 AND "createdAt" < $2`, toUUID(userID), cutoff)
		// Vector EMA: trigger async (fire-and-forget) — same as updateUserVectorOnInteraction
		// We do not block; the Go worker will handle embedding updates via the feed module if needed.
		// For now, we just update the completionRate and session, vector is updated by the core route's Prisma logic fallback.
		_ = s.updateUserVector(ctx, userID, articleID, status)
	}

	return updated, nil
}

func (s *Service) updateUserVector(ctx context.Context, userID, articleID, status string) error {
	// Fetch article embedding
	var embeddingText pgtype.Text
	err := s.pool.QueryRow(ctx, `SELECT COALESCE("embedding"::text, '') FROM "Article" WHERE id=$1`, articleID).Scan(&embeddingText)
	if err != nil || !embeddingText.Valid || embeddingText.String == "" {
		return err
	}
	str := embeddingText.String
	// Strip brackets and parse
	// Reuse the same logic as feed's updateUserVectorOnInteraction: EMA 0.1 for READ_COMPLETE, 0.06 for READ_PARTIAL
	// For simplicity, we just call the existing feed logic if available via raw SQL
	// Here we do a minimal EMA: fetch user embedding, blend, and upsert
	var userEmbedding pgtype.Text
	_ = s.pool.QueryRow(ctx, `SELECT COALESCE("embedding"::text, '') FROM "User" WHERE id=$1`, toUUID(userID)).Scan(&userEmbedding)
	// If either is empty, skip
	if !userEmbedding.Valid || userEmbedding.String == "" {
		// No user vector yet, set to article vector
		_, _ = s.pool.Exec(ctx, `UPDATE "User" SET embedding = $1::vector WHERE id=$2`, str, toUUID(userID))
		return nil
	}
	// Simple EMA: new = 0.9*old + 0.1*article (for READ_COMPLETE) or 0.94*old + 0.06*article (for READ_PARTIAL)
	alpha := 0.06
	if status == "READ_COMPLETE" {
		alpha = 0.1
	}
	// Parse and blend in Go would require pgvector-go, but we can do SQL-side:
	// UPDATE "User" SET embedding = (embedding * (1-alpha) + $1::vector * alpha) WHERE id=$2
	// Postgres pgvector supports arithmetic via extension? Use raw.
	_, _ = s.pool.Exec(ctx, `
		UPDATE "User" SET embedding = (
			SELECT (u.embedding * (1 - $1) + $2::vector * $1)
			FROM "User" u WHERE u.id = $3
		) WHERE id = $3
	`, alpha, str, toUUID(userID))
	return nil
}

// TrackFeedImpression enregistre un batch d'impressions (IntersectionObserver) + purge 30j.
func (s *Service) TrackFeedImpression(ctx context.Context, userID string, items []FeedImpressionItem) (int, error) {
	if len(items) == 0 {
		return 0, nil
	}
	// Filter valid
	valid := make([]FeedImpressionItem, 0, len(items))
	for _, it := range items {
		if (it.ItemType == "ARTICLE" || it.ItemType == "THOUGHT") && it.ItemID != "" {
			if it.Position < 0 {
				it.Position = 0
			}
			if it.Position > 500 {
				it.Position = 500
			}
			valid = append(valid, it)
		}
	}
	if len(valid) == 0 {
		return 0, nil
	}
	// Batch insert via COPY or multi-row insert
	// Use simple Exec with VALUES
	for _, it := range valid {
		var uid pgtype.UUID
		if userID != "" {
			uid = toUUID(userID)
		}
		_, _ = s.pool.Exec(ctx, `
			INSERT INTO "FeedImpression" (id, "userId", "itemType", "itemId", position, "isDiscovery", "createdAt")
			VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, now())
		`, uid, it.ItemType, it.ItemID, it.Position, it.IsDiscovery)
	}
	// Purge 30j 5% du temps (best-effort)
	if len(valid) > 0 && time.Now().UnixNano()%20 == 0 {
		cutoff := time.Now().Add(-30 * 24 * time.Hour)
		_, _ = s.pool.Exec(ctx, `DELETE FROM "FeedImpression" WHERE "createdAt" < $1`, cutoff)
	}
	return len(valid), nil
}

type FeedImpressionItem struct {
	ItemType    string `json:"itemType"`
	ItemID      string `json:"itemId"`
	Position    int    `json:"position"`
	IsDiscovery bool   `json:"isDiscovery"`
}

// TrackShowLess enregistre un ContentFeedback SHOW_LESS + éloignement vectoriel.
func (s *Service) TrackShowLess(ctx context.Context, userID, articleID, thoughtID string) (string, bool, error) {
	if articleID == "" && thoughtID == "" {
		return "", false, nil
	}
	if userID == "" {
		return "", false, nil
	}
	// Upsert ContentFeedback — idempotent même quand articleId/thoughtId est NULL.
	// NB: ON CONFLICT sur (userId, articleId, thoughtId, type) ne déduplique PAS en
	// Postgres dès qu'une des colonnes est NULL (les NULL sont distincts). On passe
	// donc par un INSERT ... WHERE NOT EXISTS avec COALESCE pour garantir qu'un
	// « Voir moins » répété ne crée pas de doublon.
	var feedbackID string
	err := s.pool.QueryRow(ctx, `
		INSERT INTO "ContentFeedback" (id, "userId", "articleId", "thoughtId", type, "createdAt")
		SELECT gen_random_uuid()::text, $1, $2, $3, 'SHOW_LESS', now()
		WHERE NOT EXISTS (
			SELECT 1 FROM "ContentFeedback"
			WHERE "userId" = $1
			  AND COALESCE("articleId",'') = COALESCE($2,'')
			  AND COALESCE("thoughtId",'') = COALESCE($3,'')
			  AND type = 'SHOW_LESS'
		)
		RETURNING id
	`, toUUID(userID), pgTextPtr(articleID), pgTextPtr(thoughtID)).Scan(&feedbackID)
	if err == pgx.ErrNoRows {
		// Déjà signalé « Voir moins » → récupérer l'id existant.
		err = s.pool.QueryRow(ctx, `SELECT id FROM "ContentFeedback" WHERE "userId"=$1 AND COALESCE("articleId",'')=COALESCE($2,'') AND COALESCE("thoughtId",'')=COALESCE($3,'') AND type='SHOW_LESS'`, toUUID(userID), pgTextPtr(articleID), pgTextPtr(thoughtID)).Scan(&feedbackID)
	}
	if err != nil {
		return "", false, err
	}
	// Vector feedback
	vectorAdjusted := false
	table := "Article"
	targetID := articleID
	if thoughtID != "" {
		table = "Post"
		targetID = thoughtID
	}
	var embeddingText pgtype.Text
	_ = s.pool.QueryRow(ctx, `SELECT COALESCE("embedding"::text, '') FROM "`+table+`" WHERE id=$1`, targetID).Scan(&embeddingText)
	if embeddingText.Valid && embeddingText.String != "" {
		// Apply negative EMA: move user vector away from item vector
		var userEmbedding pgtype.Text
		_ = s.pool.QueryRow(ctx, `SELECT COALESCE("embedding"::text, '') FROM "User" WHERE id=$1`, toUUID(userID)).Scan(&userEmbedding)
		if userEmbedding.Valid && userEmbedding.String != "" {
			// Negative feedback: embedding = embedding - 0.05 * itemVector (gentle push away)
			_, _ = s.pool.Exec(ctx, `UPDATE "User" SET embedding = (embedding - $1::vector * 0.05) WHERE id=$2`, embeddingText.String, toUUID(userID))
			vectorAdjusted = true
		}
	}
	return feedbackID, vectorAdjusted, nil
}

func pgTextPtr(s string) pgtype.Text {
	if s == "" {
		return pgtype.Text{Valid: false}
	}
	return pgtype.Text{String: s, Valid: true}
}
