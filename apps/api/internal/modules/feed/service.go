package feed

import (
	"context"
	"errors"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/cache"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/modules/posts"
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
	q    ServiceQuerier
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
			return FeedResult{Items: []posts.FeedSlice{}, HasMore: false}, nil
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

	// 1) Chaîne d'ancêtres & citations (quotes) : on remonte les parents et posts cités
	//    (boucle bornée à 100 pour éviter les cycles). On collecte les ids,
	//    on les charge en bloc, puis on répète pour les parents des parents.
	more := true
	for more && len(extras) < 100 {
		more = false
		for _, id := range append([]string{postID}, extras...) {
			if r, ok := all[id]; ok {
				if pid := posts.ParentIDOf(r); pid != nil && !want[*pid] {
					want[*pid] = true
					extras = append(extras, *pid)
					more = true
				}
				if rid := posts.RepostIDOf(r); rid != nil && !want[*rid] {
					want[*rid] = true
					extras = append(extras, *rid)
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

	// 3) Charger les posts cités (reposts / quotes) par les réponses
	var missingQuotes []string
	for _, id := range replyIDs {
		if r, ok := all[id]; ok {
			if rid := posts.RepostIDOf(r); rid != nil && !want[*rid] {
				want[*rid] = true
				missingQuotes = append(missingQuotes, *rid)
			}
		}
	}
	if len(missingQuotes) > 0 {
		extraRows, err := s.q.GetPostsByIDs(ctx, db.GetPostsByIDsParams{Ids: missingQuotes, ViewerID: toUUID(viewerID)})
		if err != nil {
			return nil, err
		}
		for i := range extraRows {
			all[extraRows[i].ID] = &extraRows[i]
		}
		extras = append(extras, missingQuotes...)
	}

	allIDs := append([]string{postID}, extras...)
	attachments, err := posts.AttachmentsFor(ctx, s.q, allIDs)
	if err != nil {
		return nil, err
	}
	polls, err := posts.PollsFor(ctx, s.q, allIDs, viewerID)
	if err != nil {
		return nil, err
	}

	// État follow des auteurs (isFollowing).
	authorIDs := make([]string, 0, len(all))
	for _, r := range all {
		authorIDs = append(authorIDs, r.AuthorID)
	}
	following, err := posts.FollowingFor(ctx, s.q, viewerID, authorIDs)
	if err != nil {
		return nil, err
	}

	target := posts.BuildFeedPostWithAncestors(all[postID], all, attachments, polls, following, map[string]bool{})
	thread := &ThreadPost{FeedPost: target}

	// Réponses triées par date croissante.
	for _, id := range replyIDs {
		if r, ok := all[id]; ok {
			thread.Replies = append(thread.Replies, posts.BuildFeedPost(r, all, attachments, polls, following))
		}
	}
	return thread, nil
}

// ArticleFeedResult est la réponse paginée du feed d'articles (mobile).
type ArticleFeedResult struct {
	Items      []FeedArticle `json:"items"`
	NextCursor string        `json:"nextCursor"`
	HasMore    bool          `json:"hasMore"`
}

// publishedArticleRow est la vue commune des lignes sqlc d'articles publiés
// (RecentArticles et PublicationArticles ont le même shape de colonnes).
type publishedArticleRow struct {
	ID                   string
	Title                string
	Slug                 string
	Content              string
	IsPremium            bool
	Visibility           db.ContentVisibility
	ReadingTime          int32
	CreatedAt            pgtype.Timestamp
	PublicationID        string
	AuthorID             string
	AuthorName           pgtype.Text
	AuthorUsername       pgtype.Text
	AuthorLogo           pgtype.Text
	AuthorCertified      bool
	PublicationName      string
	PublicationSlug      string
	PublicationSubdomain pgtype.Text
	PublicationLogo      pgtype.Text
	PublicationType      db.PublicationType
	CategoryID           pgtype.Text
	CategoryName         pgtype.Text
	CategorySlug         pgtype.Text
}

// buildFeedArticle construit la carte d'article du feed depuis la vue commune.
func buildFeedArticle(r *publishedArticleRow) FeedArticle {
	return FeedArticle{
		ID:            r.ID,
		Title:         r.Title,
		Slug:          r.Slug,
		Content:       r.Content,
		IsPremium:     r.IsPremium,
		Visibility:    string(r.Visibility),
		ReadingTime:   int(r.ReadingTime),
		CreatedAt:     r.CreatedAt.Time.Format(time.RFC3339),
		PublicationID: r.PublicationID,
		Author: FeedArticleAuthor{
			ID:          r.AuthorID,
			Name:        pgtypeTextPtr(r.AuthorName),
			Username:    pgtypeTextPtr(r.AuthorUsername),
			LogoURL:     pgtypeTextPtr(r.AuthorLogo),
			IsCertified: r.AuthorCertified,
		},
		Publication: FeedArticlePub{
			ID:        r.PublicationID,
			Name:      r.PublicationName,
			Slug:      r.PublicationSlug,
			Subdomain: pgtypeTextPtr(r.PublicationSubdomain),
			LogoURL:   pgtypeTextPtr(r.PublicationLogo),
			Type:      string(r.PublicationType),
		},
		Category: feedArticleCat(&r.CategoryID, &r.CategoryName, &r.CategorySlug),
	}
}

// feedArticleCat construit la catégorie d'un article du feed (nil si absente).
func feedArticleCat(id, name, slug *pgtype.Text) *FeedArticleCat {
	if id == nil || !id.Valid {
		return nil
	}
	return &FeedArticleCat{
		ID:   id.String,
		Name: name.String,
		Slug: slug.String,
	}
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
		items = append(items, buildFeedArticle(&publishedArticleRow{
			ID:                   r.ID,
			Title:                r.Title,
			Slug:                 r.Slug,
			Content:              r.Content,
			IsPremium:            r.IsPremium,
			Visibility:           r.Visibility,
			ReadingTime:          r.ReadingTime,
			CreatedAt:            r.CreatedAt,
			PublicationID:        r.PublicationId,
			AuthorID:             r.AuthorID,
			AuthorName:           r.AuthorName,
			AuthorUsername:       r.AuthorUsername,
			AuthorLogo:           r.AuthorLogo,
			AuthorCertified:      r.AuthorCertified,
			PublicationName:      r.PublicationName,
			PublicationSlug:      r.PublicationSlug,
			PublicationSubdomain: r.PublicationSubdomain,
			PublicationLogo:      r.PublicationLogo,
			PublicationType:      r.PublicationType,
			CategoryID:           r.CategoryID,
			CategoryName:         r.CategoryName,
			CategorySlug:         r.CategorySlug,
		}))
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

// PublicationArticles retourne les articles publiés d'une publication (profil),
// résolue par slug OU subdomain (insensible à la casse), paginés.
func (s *Service) PublicationArticles(ctx context.Context, username string, limit, offset int) (ArticleFeedResult, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	fetch := limit + 1

	rows, err := s.q.ListPublishedArticlesByPublication(ctx, db.ListPublishedArticlesByPublicationParams{
		Lower:  username,
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
		items = append(items, buildFeedArticle(&publishedArticleRow{
			ID:                   r.ID,
			Title:                r.Title,
			Slug:                 r.Slug,
			Content:              r.Content,
			IsPremium:            r.IsPremium,
			Visibility:           r.Visibility,
			ReadingTime:          r.ReadingTime,
			CreatedAt:            r.CreatedAt,
			PublicationID:        r.PublicationId,
			AuthorID:             r.AuthorID,
			AuthorName:           r.AuthorName,
			AuthorUsername:       r.AuthorUsername,
			AuthorLogo:           r.AuthorLogo,
			AuthorCertified:      r.AuthorCertified,
			PublicationName:      r.PublicationName,
			PublicationSlug:      r.PublicationSlug,
			PublicationSubdomain: r.PublicationSubdomain,
			PublicationLogo:      r.PublicationLogo,
			PublicationType:      r.PublicationType,
			CategoryID:           r.CategoryID,
			CategoryName:         r.CategoryName,
			CategorySlug:         r.CategorySlug,
		}))
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

// ErrNotFound est renvoyé quand un post n'existe pas.
var ErrNotFound = errors.New("not found")

func pgtypeTextPtr(t pgtype.Text) *string {
	if !t.Valid {
		return nil
	}
	v := t.String
	return &v
}

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
