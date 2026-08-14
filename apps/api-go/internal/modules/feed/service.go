package feed

import (
	"context"
	"errors"
	"strconv"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api-go/internal/cache"
	db "github.com/qoefi/api-go/internal/database"
	"github.com/qoefi/api-go/internal/modules/posts"
	"github.com/redis/go-redis/v9"
)

// FeedResult est la réponse paginée du feed (miroir de getFeedItemsAction TS).
type FeedResult struct {
	Items      []posts.FeedSlice `json:"items"`
	NextCursor string            `json:"nextCursor"`
	HasMore    bool              `json:"hasMore"`
}

type Service struct {
	pool *pgxpool.Pool
	q    *db.Queries
	rc   *redis.Client
}

func NewService(pool *pgxpool.Pool, rc *redis.Client) *Service {
	return &Service{pool: pool, q: db.New(pool), rc: rc}
}

// invalidate invalide les caches du feed (following + trending).
func (s *Service) invalidate(ctx context.Context, prefixes ...string) {
	cache.InvalidateNamespaces(ctx, s.rc, prefixes...)
}

// ParseCursor interprète le curseur opaque (offset numérique) ; défaut 0.
func ParseCursor(cursor string) int {
	if cursor == "" {
		return 0
	}
	n, err := strconv.Atoi(cursor)
	if err != nil || n < 0 {
		return 0
	}
	return n
}

// FollowingFeed retourne le feed des publications suivies, paginé (offset).
func (s *Service) FollowingFeed(ctx context.Context, viewerID string, limit, offset int) (FeedResult, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	// take+1 pour détecter hasMore.
	fetch := limit + 1

	ownerIDs, err := s.q.GetFollowedPersonalPublicationOwnerIDs(ctx, toUUID(viewerID))
	if err != nil {
		return FeedResult{}, err
	}
	if len(ownerIDs) == 0 {
		return FeedResult{Items: []posts.FeedSlice{}, NextCursor: "", HasMore: false}, nil
	}

	rows, err := s.q.FindFollowingFeed(ctx, db.FindFollowingFeedParams{
		ViewerID:  toUUID(viewerID),
		AuthorIds: toUUIDSlice(ownerIDs),
		TakeCount: int32(fetch),
		SkipCount: int32(offset),
	})
	if err != nil {
		return FeedResult{}, err
	}

	return s.finalize(ctx, rows, viewerID, limit, offset)
}

// Trending retourne les pensées les plus engagées des 7 derniers jours.
func (s *Service) Trending(ctx context.Context, viewerID string, limit, offset int) (FeedResult, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	fetch := limit + 1

	rows, err := s.q.FindTrending(ctx, db.FindTrendingParams{
		ViewerID:  toUUID(viewerID),
		TakeCount: int32(fetch),
		SkipCount: int32(offset),
	})
	if err != nil {
		return FeedResult{}, err
	}

	return s.finalizeTrending(ctx, rows, viewerID, limit, offset)
}

// finalize assemble les slices et gère la pagination (take+1 → hasMore).
func (s *Service) finalize(ctx context.Context, rows []db.FindFollowingFeedRow, viewerID string, limit, offset int) (FeedResult, error) {
	var ids []string
	for _, r := range rows {
		ids = append(ids, r.ID)
	}
	hasMore := len(ids) > limit
	if hasMore {
		ids = ids[:limit]
	}

	slices, err := s.buildSlices(ctx, ids, viewerID)
	if err != nil {
		return FeedResult{}, err
	}

	result := FeedResult{Items: slices, HasMore: hasMore}
	if hasMore {
		result.NextCursor = strconv.Itoa(offset + len(ids))
	}
	return result, nil
}

func (s *Service) finalizeTrending(ctx context.Context, rows []db.FindTrendingRow, viewerID string, limit, offset int) (FeedResult, error) {
	var ids []string
	for _, r := range rows {
		ids = append(ids, r.ID)
	}
	hasMore := len(ids) > limit
	if hasMore {
		ids = ids[:limit]
	}
	slices, err := s.buildSlices(ctx, ids, viewerID)
	if err != nil {
		return FeedResult{}, err
	}
	result := FeedResult{Items: slices, HasMore: hasMore}
	if hasMore {
		result.NextCursor = strconv.Itoa(offset + len(ids))
	}
	return result, nil
}

// ThreadPost est une pensée de fil avec ses réponses.
type ThreadPost struct {
	posts.FeedPost
	Replies []posts.FeedPost `json:"replies"`
}

// Thread retourne une pensée + sa chaîne parent/repost + ses réponses.
func (s *Service) Thread(ctx context.Context, postID, viewerID string) (*ThreadPost, error) {
	rows, err := s.q.GetPostsByIDs(ctx, db.GetPostsByIDsParams{Ids: []string{postID}, ViewerID: toUUID(viewerID)})
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, ErrNotFound
	}

	// ids parents/reposts/réponses à charger.
	want := map[string]bool{postID: true}
	var extras []string
	add := func(id *string) {
		if id != nil && *id != "" && !want[*id] {
			want[*id] = true
			extras = append(extras, *id)
		}
	}
	replyIDs, err := s.q.GetReplyIDsForThought(ctx, pgtype.Text{String: postID, Valid: true})
	if err != nil {
		return nil, err
	}
	for _, id := range replyIDs {
		add(&id)
	}

	all := map[string]*db.GetPostsByIDsRow{}
	for i := range rows {
		all[rows[i].ID] = &rows[i]
	}
	if len(extras) > 0 {
		extraRows, err := s.q.GetPostsByIDs(ctx, db.GetPostsByIDsParams{Ids: extras, ViewerID: toUUID(viewerID)})
		if err != nil {
			return nil, err
		}
		for i := range extraRows {
			all[extraRows[i].ID] = &extraRows[i]
		}
	}

	allIDs := append([]string{postID}, extras...)
	attachments, err := s.attachmentsFor(ctx, allIDs)
	if err != nil {
		return nil, err
	}
	polls, err := s.pollsFor(ctx, allIDs, viewerID)
	if err != nil {
		return nil, err
	}

	target := buildFeedPost(all[postID], all, attachments, polls)
	thread := &ThreadPost{FeedPost: target}

	// Réponses triées par date croissante.
	for _, id := range replyIDs {
		if r, ok := all[id]; ok {
			thread.Replies = append(thread.Replies, buildFeedPost(r, all, attachments, polls))
		}
	}
	return thread, nil
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
