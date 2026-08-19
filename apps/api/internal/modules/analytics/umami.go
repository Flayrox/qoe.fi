// Umami DB insights — métriques absentes de l'API REST d'Umami (visiteurs
// récurrents vs nouveaux, heatmap horaire). On interroge la DB Postgres
// d'Umami en lecture seule (pool dédié UMAMI_DATABASE_URL).
//
// Umami v3 persiste un `distinct_id` (localStorage) par visiteur : un
// visiteur est « nouveau » si sa première session jamais vue tombe dans la
// période, « récurrent » sinon (il a déjà une session antérieure).
package analytics

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ReturningVisitors répartit les visiteurs uniques d'une période en
// nouveaux / récurrents.
type ReturningVisitors struct {
	Total             int `json:"total"`
	NewVisitors       int `json:"newVisitors"`
	ReturningVisitors int `json:"returningVisitors"`
}

// HourVisit est un point de heatmap (visites cumulées pour une heure, 0-23,
// fuseau de la DB — UTC par défaut).
type HourVisit struct {
	Hour   int `json:"hour"`
	Visits int `json:"visits"`
}

// ReturningVisitors calcule nouveaux vs récurrents entre startAt et endAt
// (epoch ms). Retourne des zéros si le pool Umami n'est pas configuré.
func (s *Service) ReturningVisitors(ctx context.Context, websiteID string, startAt, endAt int64) (ReturningVisitors, error) {
	var out ReturningVisitors
	if s.umami == nil {
		return out, nil
	}

	const q = `
WITH period AS (
  SELECT distinct_id, MIN(created_at) AS first_seen
  FROM session
  WHERE website_id = $1::uuid
    AND created_at >= to_timestamp($2 / 1000.0)
    AND created_at <  to_timestamp($3 / 1000.0)
    AND distinct_id IS NOT NULL AND distinct_id <> ''
  GROUP BY distinct_id
),
prior AS (
  SELECT DISTINCT distinct_id
  FROM session
  WHERE website_id = $1::uuid
    AND created_at < to_timestamp($2 / 1000.0)
    AND distinct_id IS NOT NULL AND distinct_id <> ''
)
SELECT
  (SELECT COUNT(*) FROM period) AS total,
  (SELECT COUNT(*) FROM period p
     WHERE NOT EXISTS (SELECT 1 FROM prior pr WHERE pr.distinct_id = p.distinct_id)) AS new_visitors,
  (SELECT COUNT(*) FROM period p
     WHERE EXISTS (SELECT 1 FROM prior pr WHERE pr.distinct_id = p.distinct_id)) AS returning_visitors`

	err := s.umami.QueryRow(ctx, q, websiteID, startAt, endAt).Scan(&out.Total, &out.NewVisitors, &out.ReturningVisitors)
	if err != nil {
		return ReturningVisitors{}, fmt.Errorf("umami returning: %w", err)
	}
	return out, nil
}

// VisitsByHour retourne la répartition des sessions par heure de la journée
// (0-23). Les heures vides sont incluses pour faciliter le rendu.
func (s *Service) VisitsByHour(ctx context.Context, websiteID string, startAt, endAt int64) ([]HourVisit, error) {
	if s.umami == nil {
		return []HourVisit{}, nil
	}

	const q = `
SELECT EXTRACT(HOUR FROM created_at)::int AS hour, COUNT(*) AS visits
FROM session
WHERE website_id = $1::uuid
  AND created_at >= to_timestamp($2 / 1000.0)
  AND created_at <  to_timestamp($3 / 1000.0)
GROUP BY hour
ORDER BY hour`

	rows, err := s.umami.Query(ctx, q, websiteID, startAt, endAt)
	if err != nil {
		return nil, fmt.Errorf("umami hours: %w", err)
	}
	defer rows.Close()

	byHour := make([]int, 24)
	for rows.Next() {
		var h int
		var visits int
		if err := rows.Scan(&h, &visits); err != nil {
			return nil, err
		}
		if h >= 0 && h < 24 {
			byHour[h] = visits
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	out := make([]HourVisit, 0, 24)
	for h, visits := range byHour {
		out = append(out, HourVisit{Hour: h, Visits: visits})
	}
	return out, nil
}

// connectUmamiPool crée un pool en lecture seule vers la DB Umami (si DSN fourni).
func connectUmamiPool(dsn string) (*pgxpool.Pool, error) {
	if dsn == "" {
		return nil, nil
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("umami dsn: %w", err)
	}
	cfg.MaxConns = 5
	// Lecture seule stricte : on ne veut JAMAIS écrire dans la DB d'Umami.
	cfg.ConnConfig.RuntimeParams["default_transaction_read_only"] = "on"
	return pgxpool.NewWithConfig(context.Background(), cfg)
}
