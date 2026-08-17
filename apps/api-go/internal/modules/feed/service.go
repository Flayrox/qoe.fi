package feed

import (
	"context"
	"errors"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
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

// finalizeIDs assemble les slices et gère la pagination (take+1 → hasMore),
// à partir d'une liste d'IDs. Partagé par toutes les variantes de feed.
func (s *Service) finalizeIDs(ctx context.Context, ids []string, viewerID string, limit, offset int) (FeedResult, error) {
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

// finalize assemble les slices et gère la pagination (take+1 → hasMore).
func (s *Service) finalize(ctx context.Context, rows []db.FindFollowingFeedRow, viewerID string, limit, offset int) (FeedResult, error) {
	var ids []string
	for _, r := range rows {
		ids = append(ids, r.ID)
	}
	return s.finalizeIDs(ctx, ids, viewerID, limit, offset)
}

func (s *Service) finalizeTrending(ctx context.Context, rows []db.FindTrendingRow, viewerID string, limit, offset int) (FeedResult, error) {
	var ids []string
	for _, r := range rows {
		ids = append(ids, r.ID)
	}
	return s.finalizeIDs(ctx, ids, viewerID, limit, offset)
}

// UserPosts retourne les pensées publiques d'un utilisateur (profil), résolu
// par slug OU subdomain de sa publication. Paginé (offset), auth optionnelle.
func (s *Service) UserPosts(ctx context.Context, username, viewerID string, limit, offset int) (FeedResult, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	fetch := limit + 1

	pub, err := s.q.GetPublicationBySlugOrSubdomain(ctx, username)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return FeedResult{}, ErrNotFound
		}
		return FeedResult{}, err
	}
	ownerID, err := s.q.GetPublicationOwner(ctx, pub.ID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return FeedResult{}, ErrNotFound
		}
		return FeedResult{}, err
	}

	rows, err := s.q.FindPostsByAuthor(ctx, db.FindPostsByAuthorParams{
		AuthorID:  toUUID(ownerID),
		ViewerID:  toUUID(viewerID),
		TakeCount: int32(fetch),
		SkipCount: int32(offset),
	})
	if err != nil {
		return FeedResult{}, err
	}

	var ids []string
	for _, r := range rows {
		ids = append(ids, r.ID)
	}
	return s.finalizeIDs(ctx, ids, viewerID, limit, offset)
}

// FeedArticle est un article du feed mobile (écran principal), avec auteur /
// publication / catégorie dénormalisés — miroir de ArticleCard web.
type FeedArticle struct {
	ID           string  `json:"id"`
	Title        string  `json:"title"`
	Slug         string  `json:"slug"`
	Content      string  `json:"content"`
	ImageURL     *string `json:"imageUrl"`
	IsPremium    bool    `json:"isPremium"`
	Visibility   string  `json:"visibility"`
	ReadingTime  int     `json:"readingTime"`
	CreatedAt    string  `json:"createdAt"`
	PublicationID string `json:"publicationId"`
	Author      FeedArticleAuthor `json:"author"`
	Publication FeedArticlePub   `json:"publication"`
	Category    *FeedArticleCat  `json:"category"`
}

// FeedArticleAuthor est l'auteur dénormalisé d'un article du feed.
type FeedArticleAuthor struct {
	ID          string  `json:"id"`
	Name        *string `json:"name"`
	Username    *string `json:"username"`
	LogoURL     *string `json:"logoUrl"`
	IsCertified bool    `json:"isCertified"`
}

// FeedArticlePub est la publication dénormalisée d'un article du feed.
type FeedArticlePub struct {
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	Slug       string  `json:"slug"`
	Subdomain  *string `json:"subdomain"`
	LogoURL    *string `json:"logoUrl"`
	Type       string  `json:"type"`
}

// FeedArticleCat est la catégorie d'un article du feed.
type FeedArticleCat struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Slug string `json:"slug"`
}

// ThreadPost est une pensée de fil avec ses réponses.
type ThreadPost struct {
	posts.FeedPost
	Replies []posts.FeedPost `json:"replies"`
}

// Thread retourne une pensée + sa chaîne parent/repost + ses réponses.
// ⚠️ La chaîne d'ancêtres (root → … → parent direct) est chargée et peuplée
//    dans `Parent` pour que le mobile affiche ce qu'il y a au-dessus d'une
//    réponse (parité ThoughtThreadParentContext web).
func (s *Service) Thread(ctx context.Context, postID, viewerID string) (*ThreadPost, error) {
	rows, err := s.q.GetPostsByIDs(ctx, db.GetPostsByIDsParams{Ids: []string{postID}, ViewerID: toUUID(viewerID)})
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, ErrNotFound
	}

	all := map[string]*db.GetPostsByIDsRow{}
	for i := range rows {
		all[rows[i].ID] = &rows[i]
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

	// 1) Chaîne d'ancêtres : on remonte les parents jusqu'à la racine
	//    (boucle bornée à 100 pour éviter les cycles). On collecte les ids,
	//    on les charge en bloc, puis on répète pour les parents des parents.
	more := true
	for more && len(extras) < 100 {
		more = false
		for _, id := range append([]string{postID}, extras...) {
			if r, ok := all[id]; ok {
				if pid := parentIDOf(r); pid != nil && !want[*pid] {
					want[*pid] = true
					extras = append(extras, *pid)
					more = true
				}
			}
		}
		if more {
			extraRows, err := s.q.GetPostsByIDs(ctx, db.GetPostsByIDsParams{Ids: extras, ViewerID: toUUID(viewerID)})
			if err != nil {
				return nil, err
			}
			for i := range extraRows {
				all[extraRows[i].ID] = &extraRows[i]
			}
		}
	}

	// 2) Réponses RÉCURSIVES (BFS borné) : on descend dans les fils des fils
	//    pour reconstituer l'arbre complet du fil (parité Bluesky), chaque
	//    FeedPost portant son `parentId`. Le mobile reconstruit l'arbre.
	queue := []string{postID}
	seen := map[string]bool{postID: true}
	var replyIDs []string
	for len(queue) > 0 && len(replyIDs) < 500 {
		var next []string
		for _, id := range queue {
			children, err := s.q.GetReplyIDsForThought(ctx, pgtype.Text{String: id, Valid: true})
			if err != nil {
				return nil, err
			}
			for _, c := range children {
				if !seen[c] {
					seen[c] = true
					replyIDs = append(replyIDs, c)
					next = append(next, c)
				}
			}
		}
		queue = next
	}
	for _, id := range replyIDs {
		add(&id)
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

	target := buildFeedPostWithAncestors(all[postID], all, attachments, polls, map[string]bool{})
	thread := &ThreadPost{FeedPost: target}

	// Réponses triées par date croissante.
	for _, id := range replyIDs {
		if r, ok := all[id]; ok {
			thread.Replies = append(thread.Replies, buildFeedPost(r, all, attachments, polls))
		}
	}
	return thread, nil
}

// buildFeedPostWithAncestors construit le FeedPost d'une pensée ET chaîne
// récursivement ses ancêtres dans `Parent` (root → … → parent direct).
func buildFeedPostWithAncestors(r *db.GetPostsByIDsRow, all map[string]*db.GetPostsByIDsRow, attachments map[string][]posts.Attachment, polls map[string]*posts.Poll, seen map[string]bool) posts.FeedPost {
	fp := buildFeedPost(r, all, attachments, polls)
	pid := parentIDOf(r)
	if pid == nil || seen[r.ID] {
		return fp
	}
	if parentRow, ok := all[*pid]; ok {
		seen[r.ID] = true
		pp := buildFeedPostWithAncestors(parentRow, all, attachments, polls, seen)
		fp.Parent = &pp
	}
	return fp
}

// ArticleFeedResult est la réponse paginée du feed d'articles (mobile).
type ArticleFeedResult struct {
	Items      []FeedArticle `json:"items"`
	NextCursor string        `json:"nextCursor"`
	HasMore    bool          `json:"hasMore"`
}

// RecentArticles retourne les articles publiés récents (feed mobile), paginés.
func (s *Service) RecentArticles(ctx context.Context, limit, offset int) (ArticleFeedResult, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	fetch := limit + 1

	rows, err := s.q.ListRecentPublishedArticles(ctx, db.ListRecentPublishedArticlesParams{
		Limit:  int32(fetch),
		Offset: int32(offset),
	})
	if err != nil {
		return ArticleFeedResult{}, err
	}

	hasMore := len(rows) > limit
	if hasMore {
		rows = rows[:limit]
	}

	items := make([]FeedArticle, 0, len(rows))
	for i := range rows {
		r := &rows[i]
		items = append(items, FeedArticle{
			ID:            r.ID,
			Title:         r.Title,
			Slug:          r.Slug,
			Content:       r.Content,
			IsPremium:     r.IsPremium,
			Visibility:    string(r.Visibility),
			ReadingTime:   int(r.ReadingTime),
			CreatedAt:     r.CreatedAt.Time.Format(time.RFC3339),
			PublicationID: r.PublicationId,
			Author: FeedArticleAuthor{
				ID:          r.AuthorID,
				Name:        pgtypeTextPtr(r.AuthorName),
				Username:    pgtypeTextPtr(r.AuthorUsername),
				LogoURL:     pgtypeTextPtr(r.AuthorLogo),
				IsCertified: r.AuthorCertified,
			},
			Publication: FeedArticlePub{
				ID:        r.PublicationId,
				Name:      r.PublicationName,
				Slug:      r.PublicationSlug,
				Subdomain: pgtypeTextPtr(r.PublicationSubdomain),
				LogoURL:   pgtypeTextPtr(r.PublicationLogo),
				Type:      string(r.PublicationType),
			},
			Category: feedArticleCat(r),
		})
	}

	result := ArticleFeedResult{
		Items:   items,
		HasMore: hasMore,
	}
	if hasMore {
		result.NextCursor = strconv.Itoa(offset + len(rows))
	}
	return result, nil
}

// feedArticleCat construit la catégorie d'un article du feed (nil si absente).
func feedArticleCat(r *db.ListRecentPublishedArticlesRow) *FeedArticleCat {
	if !r.CategoryID.Valid {
		return nil
	}
	return &FeedArticleCat{
		ID:   r.CategoryID.String,
		Name: r.CategoryName.String,
		Slug: r.CategorySlug.String,
	}
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
