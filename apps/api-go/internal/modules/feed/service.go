// Package feed implémente le moteur de feed (following + trending).
package feed

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api-go/internal/database"
	"github.com/qoefi/api-go/internal/modules/posts"
)

type Service struct {
	pool *pgxpool.Pool
	q    *db.Queries
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool, q: db.New(pool)}
}

// FollowingFeed retourne le feed des publications suivies (paginated, offset).
func (s *Service) FollowingFeed(ctx context.Context, viewerID string, limit, offset int) ([]posts.Thought, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}

	ownerIDs, err := s.q.GetFollowedPersonalPublicationOwnerIDs(ctx, toUUID(viewerID))
	if err != nil {
		return nil, err
	}
	if len(ownerIDs) == 0 {
		return []posts.Thought{}, nil
	}

	rows, err := s.q.FindFollowingFeed(ctx, db.FindFollowingFeedParams{
		ViewerID:  toUUID(viewerID),
		AuthorIds: toUUIDSlice(ownerIDs),
		TakeCount: int32(limit),
		SkipCount: int32(offset),
	})
	if err != nil {
		return nil, err
	}

	return mapRows(rows), nil
}

// Trending retourne les pensées les plus engagées des 7 derniers jours.
func (s *Service) Trending(ctx context.Context, viewerID string, limit, offset int) ([]posts.Thought, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	rows, err := s.q.FindTrending(ctx, db.FindTrendingParams{
		ViewerID:  toUUID(viewerID),
		TakeCount: int32(limit),
		SkipCount: int32(offset),
	})
	if err != nil {
		return nil, err
	}
	return mapTrendingRows(rows), nil
}

// ErrNotFound est renvoyé quand un post n'existe pas.
var ErrNotFound = errors.New("not found")

func toUUID(id string) pgtype.UUID {
	u := pgtype.UUID{}
	_ = u.Scan(id)
	return u
}

func toUUIDSlice(ids []string) []pgtype.UUID {
	out := make([]pgtype.UUID, 0, len(ids))
	for _, id := range ids {
		out = append(out, toUUID(id))
	}
	return out
}
