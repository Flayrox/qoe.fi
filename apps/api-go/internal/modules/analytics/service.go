// Package analytics — métriques financières, top content et audience créateur.
package analytics

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api-go/internal/database"
)

var errForbidden = errors.New("permission insuffisante")

// FinancialMetrics est le récap financier (miroir TS).
type FinancialMetrics struct {
	MRRCents               int     `json:"mrrCents"`
	ARRCents               int     `json:"arrCents"`
	GrossVolumeCents       int     `json:"grossVolumeCents"`
	ActiveSubscribersCount int     `json:"activeSubscribersCount"`
	FreeSubscribersCount   int     `json:"freeSubscribersCount"`
	ConversionRatePercent  float64 `json:"conversionRatePercent"`
}

// TopContentItem est un contenu du top (miroir TS).
type TopContentItem struct {
	ID           string    `json:"id"`
	Title        string    `json:"title"`
	Type         string    `json:"type"`
	PublishedAt  time.Time `json:"publishedAt"`
	ViewsCount   int       `json:"viewsCount"`
	LikesCount   int       `json:"likesCount"`
	RepostsCount int       `json:"repostsCount"`
}

// AudienceSummary est la répartition des abonnés.
type AudienceSummary struct {
	Total   int `json:"total"`
	Active  int `json:"active"`
	Premium int `json:"premium"`
}

type Service struct {
	pool *pgxpool.Pool
	q    *db.Queries
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool, q: db.New(pool)}
}

// canAccess vérifie que l'utilisateur est owner/editor de la publication.
func (s *Service) canAccess(ctx context.Context, userID, publicationID string) bool {
	if personal, err := s.q.GetUserPersonalPublication(ctx, userID); err == nil && personal.String == publicationID {
		return true
	}
	role, err := s.q.GetMediaRoleForUser(ctx, db.GetMediaRoleForUserParams{
		PublicationId: publicationID, UserId: toUUID(userID),
	})
	if err != nil {
		return false
	}
	return role == "owner" || role == "editor"
}

// Financial calcule MRR/ARR/volume brut + conversion (miroir TS).
func (s *Service) Financial(ctx context.Context, userID, publicationID string) (FinancialMetrics, error) {
	if !s.canAccess(ctx, userID, publicationID) {
		return FinancialMetrics{}, errForbidden
	}

	premiums, err := s.q.GetPremiumActiveSubscribers(ctx, publicationID)
	if err != nil {
		return FinancialMetrics{}, err
	}
	free, err := s.q.GetFreeSubscriberCount(ctx, publicationID)
	if err != nil {
		return FinancialMetrics{}, err
	}

	mrr := 0
	gross := 0
	for _, sub := range premiums {
		gross += int(sub.LtvCents)
		if sub.MonthlyPriceCents.Valid {
			mrr += int(sub.MonthlyPriceCents.Int32)
		}
	}

	active := len(premiums)
	total := active + int(free)
	conversion := 0.0
	if total > 0 {
		conversion = round2(float64(active) / float64(total) * 100)
	}

	return FinancialMetrics{
		MRRCents:               mrr,
		ARRCents:               mrr * 12,
		GrossVolumeCents:       gross,
		ActiveSubscribersCount: active,
		FreeSubscribersCount:   int(free),
		ConversionRatePercent:  conversion,
	}, nil
}

// TopContent retourne les contenus récents (articles + pensées) triés par date.
func (s *Service) TopContent(ctx context.Context, userID, publicationID string, limit int) ([]TopContentItem, error) {
	if !s.canAccess(ctx, userID, publicationID) {
		return nil, errForbidden
	}
	if limit <= 0 || limit > 50 {
		limit = 5
	}

	articles, err := s.q.GetRecentArticlesForAnalytics(ctx, db.GetRecentArticlesForAnalyticsParams{
		PublicationId: publicationID, Limit: int32(limit),
	})
	if err != nil {
		return nil, err
	}
	thoughts, err := s.q.GetRecentThoughtsForAnalytics(ctx, db.GetRecentThoughtsForAnalyticsParams{
		AuthorId: userID, Limit: int32(limit),
	})
	if err != nil {
		return nil, err
	}

	items := make([]TopContentItem, 0, len(articles)+len(thoughts))
	for _, a := range articles {
		items = append(items, TopContentItem{
			ID: a.ID, Title: a.Title, Type: "article", PublishedAt: a.CreatedAt.Time,
		})
	}
	for _, t := range thoughts {
		title := t.Content
		if len(title) > 60 {
			title = title[:60] + "..."
		}
		items = append(items, TopContentItem{
			ID: t.ID, Title: title, Type: "thought", PublishedAt: t.CreatedAt.Time,
			LikesCount: int(t.LikeCount), RepostsCount: int(t.RepostCount),
		})
	}

	// Trie par date desc puis tronque.
	for i := 1; i < len(items); i++ {
		for j := i; j > 0 && items[j-1].PublishedAt.Before(items[j].PublishedAt); j-- {
			items[j-1], items[j] = items[j], items[j-1]
		}
	}
	if len(items) > limit {
		items = items[:limit]
	}
	return items, nil
}

// Audience retourne la répartition des abonnés.
func (s *Service) Audience(ctx context.Context, userID, publicationID string) (AudienceSummary, error) {
	if !s.canAccess(ctx, userID, publicationID) {
		return AudienceSummary{}, errForbidden
	}
	row, err := s.q.GetAudienceSummary(ctx, publicationID)
	if err != nil {
		return AudienceSummary{}, err
	}
	return AudienceSummary{Total: int(row.Total), Active: int(row.Active), Premium: int(row.Premium)}, nil
}

func toUUID(id string) pgtype.UUID {
	u := pgtype.UUID{}
	_ = u.Scan(id)
	return u
}

func round2(v float64) float64 {
	return float64(int(v*100+0.5)) / 100
}
