package feed

// ─────────────────────────────────────────────────────────────────────────────
// Bundle de la home lecteur — GET /v1/home/feed (auth optionnelle).
// Remplace les 13 appels Prisma de apps/core home/page.tsx : publications
// suivies, onglets Suivis / Explorer / Recommandé, bookmarks, compteurs
// bibliothèque, activité 7 jours, mots masqués et article à la une.
// ─────────────────────────────────────────────────────────────────────────────

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/qoefi/api/internal/modules/posts"
)

// HomeFeedGroup est un flux de la home (articles complets + pensées FeedSlice).
type HomeFeedGroup struct {
	Articles []HydrateArticle  `json:"articles"`
	Thoughts []posts.FeedSlice `json:"thoughts"`
}

// HomeFeedResult est la réponse complète de la page d'accueil lecteur.
type HomeFeedResult struct {
	FollowedCreators []HydratePublication `json:"followedCreators"`
	FollowedUserIDs  []string             `json:"followedUserIds"`
	Following        HomeFeedGroup        `json:"following"`
	Discover         HomeFeedGroup        `json:"discover"`
	Recommended      HomeFeedGroup        `json:"recommended"`
	Bookmarks        []HydrateArticle     `json:"bookmarks"`
	HighlightsCount  int                  `json:"highlightsCount"`
	ActivityData     []int                `json:"activityData"`
	MutedWords       []string             `json:"mutedWords"`
	FeaturedArticle  *HydrateArticle      `json:"featuredArticle"`
}

// queryIDs exécute une requête SELECT id et renvoie les ids ordonnés.
func (s *Service) queryIDs(ctx context.Context, q string, args ...any) ([]string, error) {
	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err == nil {
			out = append(out, id)
		}
	}
	return out, rows.Err()
}

// HomeFeed construit le bundle de la home lecteur (parité home/page.tsx).
func (s *Service) HomeFeed(ctx context.Context, userID string) (HomeFeedResult, error) {
	res := HomeFeedResult{
		FollowedCreators: []HydratePublication{},
		FollowedUserIDs:  []string{},
		Following:        HomeFeedGroup{Articles: []HydrateArticle{}, Thoughts: []posts.FeedSlice{}},
		Discover:         HomeFeedGroup{Articles: []HydrateArticle{}, Thoughts: []posts.FeedSlice{}},
		Recommended:      HomeFeedGroup{Articles: []HydrateArticle{}, Thoughts: []posts.FeedSlice{}},
		Bookmarks:        []HydrateArticle{},
		ActivityData:     make([]int, 7),
		MutedWords:       []string{},
	}
	if userID == "" {
		// Anonyme : pas de Suivis ni de bibliothèque ; Explorer + Recommandé restent.
		s.feedHomeGroups(ctx, res.FollowedUserIDs, &res.Discover, &res.Recommended)
		return res, nil
	}

	// 1. Publications suivies (créateurs) + ids des propriétaires PERSONAL.
	followed, pubIDs, err := s.fetchFollowedPublications(ctx, userID)
	if err != nil {
		return res, err
	}
	res.FollowedCreators = followed
	followedUserIDs, err := s.fetchPersonalOwners(ctx, pubIDs)
	if err != nil {
		return res, err
	}
	res.FollowedUserIDs = followedUserIDs
	// Contrat JSON : followedCreators/followedUserIds sont TOUJOURS des
	// tableaux (jamais null) — l'appelant fait .map(...), .length et
	// .includes(...) sur ces champs.
	if res.FollowedCreators == nil {
		res.FollowedCreators = []HydratePublication{}
	}
	if res.FollowedUserIDs == nil {
		res.FollowedUserIDs = []string{}
	}

	// 2. Flux + widgets en parallèle.
	var wg sync.WaitGroup
	var following, discover, recommended HomeFeedGroup
	var bookmarks []HydrateArticle
	var featured *HydrateArticle
	var highlightsCount int
	var muted []string

	wg.Add(7)
	go func() { defer wg.Done(); s.loadGroup(ctx, &following, pubIDs, followedUserIDs, userID, "following") }()
	go func() { defer wg.Done(); s.loadGroup(ctx, &discover, pubIDs, followedUserIDs, userID, "discover") }()
	go func() { defer wg.Done(); s.loadGroup(ctx, &recommended, pubIDs, followedUserIDs, userID, "recommended") }()
	go func() { defer wg.Done(); bookmarks, _ = s.fetchBookmarks(ctx, userID) }()
	go func() { defer wg.Done(); highlightsCount, _ = s.countHighlights(ctx, userID) }()
	go func() { defer wg.Done(); res.ActivityData = s.activityLast7Days(ctx, userID) }()
	go func() { defer wg.Done(); muted, _ = s.fetchMutedWordsAll(ctx, userID) }()
	wg.Wait()

	res.Following = following
	res.Discover = discover
	res.Recommended = recommended
	res.Bookmarks = bookmarks
	res.HighlightsCount = highlightsCount
	// Contrat JSON : mutedWords est TOUJOURS un tableau (jamais null) —
	// l'appelant fait mutedWords.map(...).
	if muted == nil {
		muted = []string{}
	}
	res.MutedWords = muted
	featured, _ = s.fetchFeaturedArticle(ctx)
	res.FeaturedArticle = featured
	return res, nil
}

// feedHomeGroups charge Explorer + Recommandé sans lecture de Suivis (anonyme).
func (s *Service) feedHomeGroups(ctx context.Context, followedUserIDs []string, discover, recommended *HomeFeedGroup) {
	var wg sync.WaitGroup
	wg.Add(2)
	go func() { defer wg.Done(); s.loadGroup(ctx, discover, nil, followedUserIDs, "", "discover") }()
	go func() { defer wg.Done(); s.loadGroup(ctx, recommended, nil, followedUserIDs, "", "recommended") }()
	wg.Wait()
}

// fetchFollowedPublications renvoie les publications suivies + leurs ids.
func (s *Service) fetchFollowedPublications(ctx context.Context, userID string) ([]HydratePublication, []string, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT p.id, p.type, p.name, p.slug, p.subdomain, p."customDomain", p."logoUrl", p."heroText", p."isCertified"
		FROM "Follows" f
		JOIN "Publication" p ON p.id = f."publicationId"
		WHERE f."readerId" = $1
		ORDER BY f."createdAt" DESC`, toUUID(userID))
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	var pubs []HydratePublication
	var ids []string
	for rows.Next() {
		var p HydratePublication
		if err := rows.Scan(&p.ID, &p.Type, &p.Name, &p.Slug, &p.Subdomain, &p.CustomDomain, &p.LogoURL, &p.HeroText, &p.IsCertified); err == nil {
			pubs = append(pubs, p)
			ids = append(ids, p.ID)
		}
	}
	return pubs, ids, rows.Err()
}

// fetchPersonalOwners renvoie les ids des créateurs propriétaires des
// publications PERSONAL suivies (pour les pensées des abonnements).
func (s *Service) fetchPersonalOwners(ctx context.Context, pubIDs []string) ([]string, error) {
	if len(pubIDs) == 0 {
		return nil, nil
	}
	return s.queryIDs(ctx, `
		SELECT u.id::text FROM "User" u
		JOIN "Publication" p ON p.id = u."publicationId"
		WHERE p.id = ANY($1::text[]) AND p.type = 'PERSONAL' AND u.role = 'creator'`, pubIDs)
}

// loadGroup charge un flux de la home (articles hydratés + pensées FeedSlice).
func (s *Service) loadGroup(ctx context.Context, group *HomeFeedGroup, pubIDs, followedUserIDs []string, userID, tab string) {
	group.Articles = []HydrateArticle{}
	group.Thoughts = []posts.FeedSlice{}
	// ANY($n::text[]) avec un slice nil → NULL → filtre tout ; on force vide non-nil.
	if pubIDs == nil {
		pubIDs = []string{}
	}
	if followedUserIDs == nil {
		followedUserIDs = []string{}
	}

	// ── IDs des articles ─────────────────────────────────────────────────
	var artQuery string
	var artArgs []any
	switch tab {
	case "following":
		artQuery = `
			SELECT a.id FROM "Article" a JOIN "User" u ON u.id = a."authorId"
			WHERE a."publicationId" = ANY($1::text[]) AND a.published = true
			  AND u."isShadowbanned" = false AND u."isSuspended" = false
			  AND (a."scheduledAt" IS NULL OR a."scheduledAt" <= now())
			ORDER BY a."createdAt" DESC, a.id DESC LIMIT 20`
		artArgs = []any{pubIDs}
	case "discover":
		artQuery = `
			SELECT a.id FROM "Article" a
			JOIN "User" u ON u.id = a."authorId"
			JOIN "Publication" p ON p.id = a."publicationId"
			WHERE a.published = true AND p."isCertified" = true
			  AND u."isShadowbanned" = false AND u."isSuspended" = false
			  AND (a."scheduledAt" IS NULL OR a."scheduledAt" <= now())
			  AND NOT (a."publicationId" = ANY($1::text[]))
			ORDER BY a."createdAt" DESC, a.id DESC LIMIT 20`
		artArgs = []any{pubIDs}
	default: // recommended
		artQuery = `
			SELECT a.id FROM "Article" a JOIN "User" u ON u.id = a."authorId"
			WHERE a.published = true AND u."isShadowbanned" = false AND u."isSuspended" = false
			  AND (a."scheduledAt" IS NULL OR a."scheduledAt" <= now())
			ORDER BY a."isEditorPick" DESC, a."createdAt" DESC, a.id DESC LIMIT 20`
	}
	artIDs, err := s.queryIDs(ctx, artQuery, artArgs...)
	if err != nil {
		log.Printf("[home] %s articles: %v", tab, err)
		return
	}
	if len(artIDs) > 0 {
		arts, err := s.HydrateArticles(ctx, artIDs)
		if err == nil {
			group.Articles = arts
		} else {
			log.Printf("[home] %s hydrate: %v", tab, err)
		}
	}

	// ── IDs des pensées ──────────────────────────────────────────────────
	var thQuery string
	var thArgs []any
	switch tab {
	case "following":
		thQuery = `
			SELECT p.id FROM "Post" p JOIN "User" u ON u.id = p."authorId"
			WHERE p."isDraft" = false AND p."deletedAt" IS NULL
			  AND u."isShadowbanned" = false AND u."isSuspended" = false
			  AND (p."scheduledAt" IS NULL OR p."scheduledAt" <= now())
			  AND (p."authorId" = $1 OR (p."authorId" = ANY($2::uuid[]) AND p.visibility IN ('public','followers')))
			ORDER BY p."createdAt" DESC, p.id DESC LIMIT 20`
		thArgs = []any{toUUID(userID), toUUIDSlice(followedUserIDs)}
	case "discover":
		thQuery = `
			SELECT p.id FROM "Post" p JOIN "User" u ON u.id = p."authorId"
			WHERE p."isDraft" = false AND p."deletedAt" IS NULL AND p.visibility = 'public'
			  AND (p."scheduledAt" IS NULL OR p."scheduledAt" <= now())
			  AND u.role = 'creator' AND u."isCertified" = true
			  AND u."isShadowbanned" = false AND u."isSuspended" = false
			  AND NOT (p."authorId" = ANY($1::uuid[]))
			ORDER BY p."createdAt" DESC, p.id DESC LIMIT 20`
		excluded := append(append([]string{}, followedUserIDs...), userID)
		thArgs = []any{toUUIDSlice(excluded)}
	default: // recommended
		thQuery = `
			SELECT p.id FROM "Post" p JOIN "User" u ON u.id = p."authorId"
			WHERE p."isDraft" = false AND p."deletedAt" IS NULL
			  AND u."isShadowbanned" = false AND u."isSuspended" = false
			  AND (p."scheduledAt" IS NULL OR p."scheduledAt" <= now())
			  AND p.visibility = 'public'
			ORDER BY p."createdAt" DESC, p.id DESC LIMIT 20`
	}
	thIDs, err := s.queryIDs(ctx, thQuery, thArgs...)
	if err != nil {
		log.Printf("[home] %s thoughts: %v", tab, err)
		return
	}
	if len(thIDs) > 0 {
		slices, err := s.buildSlices(ctx, thIDs, userID)
		if err == nil {
			group.Thoughts = slices
		} else {
			log.Printf("[home] %s thoughts slices: %v", tab, err)
		}
	}
}

// fetchBookmarks renvoie les articles bookmarkés (ordre de bookmark, 20).
func (s *Service) fetchBookmarks(ctx context.Context, userID string) ([]HydrateArticle, error) {
	ids, err := s.queryIDs(ctx, `
		SELECT b."articleId" FROM "Bookmark" b
		WHERE b."readerId" = $1 ORDER BY b."createdAt" DESC LIMIT 20`, toUUID(userID))
	if err != nil || len(ids) == 0 {
		return []HydrateArticle{}, err
	}
	return s.HydrateArticles(ctx, ids)
}

func (s *Service) countHighlights(ctx context.Context, userID string) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx, `SELECT COUNT(*)::int FROM "Highlight" WHERE "readerId"=$1`, toUUID(userID)).Scan(&n)
	return n, err
}

// activityLast7Days renvoie le nombre bookmarks+highlights par jour (7 cases,
// la dernière = aujourd'hui). Miroir de home/page.tsx activityData.
func (s *Service) activityLast7Days(ctx context.Context, userID string) []int {
	data := make([]int, 7)
	rows, err := s.pool.Query(ctx, `
		SELECT d, count(*) FROM (
			SELECT date_trunc('day', "createdAt") AS d FROM "Bookmark" WHERE "readerId" = $1 AND "createdAt" >= now() - interval '6 days'
			UNION ALL
			SELECT date_trunc('day', "createdAt") AS d FROM "Highlight" WHERE "readerId" = $1 AND "createdAt" >= now() - interval '6 days'
		) t GROUP BY d`, toUUID(userID))
	if err != nil {
		return data
	}
	defer rows.Close()
	now := time.Now()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.Local)
	for rows.Next() {
		var day time.Time
		var n int
		if rows.Scan(&day, &n) != nil {
			continue
		}
		day = day.In(time.Local)
		diff := int(todayStart.Sub(time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, time.Local)).Hours() / 24)
		if diff >= 0 && diff < 7 {
			data[6-diff] += n
		}
	}
	return data
}

// fetchMutedWordsAll renvoie tous les mots masqués de l'utilisateur.
func (s *Service) fetchMutedWordsAll(ctx context.Context, userID string) ([]string, error) {
	return s.queryIDs(ctx, `SELECT word FROM "MutedWord" WHERE "userId" = $1 ORDER BY "createdAt" DESC`, toUUID(userID))
}

// fetchFeaturedArticle renvoie l'article à la une (editor pick sinon plus récent).
func (s *Service) fetchFeaturedArticle(ctx context.Context) (*HydrateArticle, error) {
	ids, err := s.queryIDs(ctx, `
		SELECT a.id FROM "Article" a JOIN "User" u ON u.id = a."authorId"
		WHERE a.published = true AND u."isShadowbanned" = false AND u."isSuspended" = false
		  AND (a."scheduledAt" IS NULL OR a."scheduledAt" <= now())
		ORDER BY a."isEditorPick" DESC, a."createdAt" DESC LIMIT 1`)
	if err != nil || len(ids) == 0 {
		return nil, err
	}
	arts, err := s.HydrateArticles(ctx, ids)
	if err != nil || len(arts) == 0 {
		return nil, err
	}
	return &arts[0], nil
}

// toUUIDSlice est défini dans service.go (ids → []pgtype.UUID).
