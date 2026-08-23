package home

// Widgets de la home lecteur — GET /v1/home/onboarding, /v1/home/suggested-creators
// et /v1/home/semantic-trends. Port Go des 3 appels Prisma restants de
// home/page.tsx (packages/db/feed.ts + packages/db/onboarding.ts).

import (
	"context"
	"log"
	"math"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
)

// ── Onboarding data ──────────────────────────────────────────────────────────

type OnboardingCreator struct {
	ID          string  `json:"id"`
	Name        *string `json:"name"`
	Slug        *string `json:"slug"`
	Subdomain   *string `json:"subdomain"`
	LogoURL     *string `json:"logoUrl"`
	HeroText    *string `json:"heroText"`
	IsCertified bool    `json:"isCertified"`
}

type OnboardingData struct {
	Categories        []OnboardingCategory `json:"categories"`
	SuggestedCreators []OnboardingCreator  `json:"suggestedCreators"`
}

// GetOnboardingData renvoie les catégories statiques + créateurs certifiés
// (fallback : n'importe quel créateur, comme le Prisma).
func (s *Service) GetOnboardingData(ctx context.Context) OnboardingData {
	out := OnboardingData{Categories: richDefaultTopics}
	var creators []OnboardingCreator
	rows, err := s.pool.Query(ctx, `
		SELECT p.id::text, u.name, p.slug, p.subdomain, p."logoUrl", p."heroText", p."isCertified"
		FROM "Publication" p
		JOIN "User" u ON u."publicationId" = p.id
		WHERE p.type = 'PERSONAL' AND p."isCertified" = true AND u.role = 'creator'
		LIMIT 8`)
	if err != nil {
		log.Printf("[home] onboarding certified: %v", err)
		out.SuggestedCreators = []OnboardingCreator{}
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var c OnboardingCreator
		var name, slug, subdomain, logoURL, heroText pgtype.Text
		var certified bool
		if err := rows.Scan(&c.ID, &name, &slug, &subdomain, &logoURL, &heroText, &certified); err == nil {
			c.Name = textPtr(name)
			c.Slug = textPtr(slug)
			c.Subdomain = textPtr(subdomain)
			c.LogoURL = textPtr(logoURL)
			c.HeroText = textPtr(heroText)
			c.IsCertified = certified
			creators = append(creators, c)
		}
	}
	if len(creators) == 0 {
		// Fallback dev : n'importe quel créateur.
		rows2, err := s.pool.Query(ctx, `
			SELECT p.id::text, u.name, p.slug, p.subdomain, p."logoUrl", p."heroText", p."isCertified"
			FROM "Publication" p
			JOIN "User" u ON u."publicationId" = p.id
			WHERE p.type = 'PERSONAL' AND u.role = 'creator'
			LIMIT 8`)
		if err == nil {
			defer rows2.Close()
			for rows2.Next() {
				var c OnboardingCreator
				var name, slug, subdomain, logoURL, heroText pgtype.Text
				var certified bool
				if err := rows2.Scan(&c.ID, &name, &slug, &subdomain, &logoURL, &heroText, &certified); err == nil {
					c.Name = textPtr(name)
					c.Slug = textPtr(slug)
					c.Subdomain = textPtr(subdomain)
					c.LogoURL = textPtr(logoURL)
					c.HeroText = textPtr(heroText)
					c.IsCertified = certified
					creators = append(creators, c)
				}
			}
		}
	}
	out.SuggestedCreators = creators
	return out
}

// ── Créateurs suggérés par similarité vectorielle ────────────────────────────

type SuggestedCreator struct {
	ID                 string  `json:"id"`
	Name               string  `json:"name"`
	Username           string  `json:"username"`
	Subdomain          *string `json:"subdomain"`
	CustomDomain       *string `json:"customDomain"`
	LogoURL            *string `json:"logoUrl"`
	HeroText           *string `json:"heroText"`
	IsCertified        bool    `json:"isCertified"`
	AffinityScore      int     `json:"affinityScore"`
	RecentArticleTitle *string `json:"recentArticleTitle"`
	SubscribersCount   int     `json:"subscribersCount"`
}

// GetSuggestedCreators renvoie les créateurs recommandés : similarité
// vectorielle si l'utilisateur a un embedding, sinon cold-start (recommandations
// plateforme + popularité). Port Go de getSuggestedCreatorsByVector.
func (s *Service) GetSuggestedCreators(ctx context.Context, userID string, limit int) ([]SuggestedCreator, error) {
	if limit <= 0 {
		limit = 4
	}
	excluded := []string{}
	var userVector *string

	if userID != "" {
		var emb pgtype.Text
		if err := s.pool.QueryRow(ctx,
			`SELECT COALESCE("embedding"::text, '') FROM "User" WHERE id = $1`, toUUID(userID)).Scan(&emb); err == nil && emb.Valid && emb.String != "" {
			userVector = &emb.String
		}
		rows, err := s.pool.Query(ctx, `SELECT "publicationId"::text FROM "Follows" WHERE "readerId" = $1`, toUUID(userID))
		if err == nil {
			for rows.Next() {
				var pid string
				if rows.Scan(&pid) == nil {
					excluded = append(excluded, pid)
				}
			}
			rows.Close()
		}
		excluded = append(excluded, userID)
	}

	var q string
	var args []any
	if userVector != nil {
		q = `
		WITH AuthorStats AS (
			SELECT
				u.id::text, u.name, u.username, u."logoUrl", p."heroText", u."isCertified",
				p.subdomain, p."customDomain",
				(1 - (COALESCE(u."embedding", a."embedding") <=> $1::vector))::float8 AS sim_score,
				a.title AS recent_title,
				COUNT(DISTINCT s.id)::int AS subs_count,
				ROW_NUMBER() OVER(PARTITION BY u.id ORDER BY a."createdAt" DESC) as rn
			FROM "User" u
			JOIN "Article" a ON a."authorId" = u.id AND a.published = true AND a."embedding" IS NOT NULL
			LEFT JOIN "Publication" p ON p.id = a."publicationId"
			LEFT JOIN "Subscriber" s ON s."publicationId" = p.id AND s."isActive" = true
			WHERE u."isShadowbanned" = false AND u."isSuspended" = false
		`
		if len(excluded) > 0 {
			q += ` AND u.id::text NOT IN (SELECT unnest($2::text[]))`
			args = append(args, userVector, excluded)
		} else {
			args = append(args, userVector)
		}
		if len(excluded) > 0 {
			q += `
			GROUP BY u.id, u.name, u.username, u."logoUrl", p."heroText", u."isCertified", p.subdomain, p."customDomain", u."embedding", a."embedding", a.title, a."createdAt"
		)
		SELECT id, name, username, "logoUrl", "heroText", "isCertified", subdomain, "customDomain", sim_score, recent_title, subs_count
		FROM AuthorStats
		WHERE rn = 1
		ORDER BY (0.70 * sim_score + 0.20 * LEAST(1.0, subs_count / 50.0) + 0.10 * (CASE WHEN "isCertified" THEN 1.0 ELSE 0.0 END)) DESC
		LIMIT $3`
			args = append(args, limit)
		} else {
			q += `
			GROUP BY u.id, u.name, u.username, u."logoUrl", p."heroText", u."isCertified", p.subdomain, p."customDomain", u."embedding", a."embedding", a.title, a."createdAt"
		)
		SELECT id, name, username, "logoUrl", "heroText", "isCertified", subdomain, "customDomain", sim_score, recent_title, subs_count
		FROM AuthorStats
		WHERE rn = 1
		ORDER BY (0.70 * sim_score + 0.20 * LEAST(1.0, subs_count / 50.0) + 0.10 * (CASE WHEN "isCertified" THEN 1.0 ELSE 0.0 END)) DESC
		LIMIT $2`
			args = append(args, limit)
		}
	} else {
		// Cold-start : sélections plateforme (Recommendation) en tête, puis
		// popularité (abonnés * 2 + certification * 5).
		pickIDs := s.platformPickUserIDs(ctx)
		q = `
		WITH AuthorStats AS (
			SELECT
				u.id::text, u.name, u.username, u."logoUrl", p."heroText", u."isCertified",
				p.subdomain, p."customDomain",
				0.0::float8 AS sim_score,
				a.title AS recent_title,
				COUNT(DISTINCT s.id)::int AS subs_count,
				ROW_NUMBER() OVER(PARTITION BY u.id ORDER BY a."createdAt" DESC) as rn
			FROM "User" u
			JOIN "Article" a ON a."authorId" = u.id AND a.published = true
			LEFT JOIN "Publication" p ON p.id = a."publicationId"
			LEFT JOIN "Subscriber" s ON s."publicationId" = p.id AND s."isActive" = true
			WHERE u."isShadowbanned" = false AND u."isSuspended" = false
			GROUP BY u.id, u.name, u.username, u."logoUrl", p."heroText", u."isCertified", p.subdomain, p."customDomain", a.title, a."createdAt"
		)
		SELECT id, name, username, "logoUrl", "heroText", "isCertified", subdomain, "customDomain", sim_score, recent_title, subs_count
		FROM AuthorStats
		WHERE rn = 1
		ORDER BY (CASE WHEN id::text = ANY($1::text[]) THEN 1 ELSE 0 END) DESC,
		         (subs_count * 2 + (CASE WHEN "isCertified" THEN 5 ELSE 0 END)) DESC
		LIMIT $2`
		args = append(args, pickIDs, limit)
	}

	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []SuggestedCreator
	for rows.Next() {
		var c SuggestedCreator
		var name, username, logoURL, heroText, subdomain, customDomain, recentTitle pgtype.Text
		var certified bool
		var sim float64
		var subs int32
		if err := rows.Scan(&c.ID, &name, &username, &logoURL, &heroText, &certified, &subdomain, &customDomain, &sim, &recentTitle, &subs); err == nil {
			c.Name = strOr(name, username, "Auteur souverain")
			c.Username = username.String
			c.Subdomain = textPtr(subdomain)
			c.CustomDomain = textPtr(customDomain)
			c.LogoURL = textPtr(logoURL)
			c.HeroText = textPtr(heroText)
			c.IsCertified = certified
			c.AffinityScore = int(math.Round(sim * 100))
			c.RecentArticleTitle = textPtr(recentTitle)
			c.SubscribersCount = int(subs)
			out = append(out, c)
		}
	}
	if out == nil {
		out = []SuggestedCreator{}
	}
	return out, rows.Err()
}

// platformPickUserIDs renvoie les ids des users des publications recommandées par
// la plateforme (table Recommendation) — équivalent Prisma getSuggestedCreatorsByVector cold-start.
func (s *Service) platformPickUserIDs(ctx context.Context) []string {
	ids, err := s.queryIDs(ctx, `SELECT DISTINCT "recommendedId"::text FROM "Recommendation"`)
	if err != nil || len(ids) == 0 {
		return []string{}
	}
	users, err := s.queryIDs(ctx,
		`SELECT u.id::text FROM "User" u WHERE u."publicationId"::text = ANY($1::text[])`, ids)
	if err != nil {
		return []string{}
	}
	return users
}

func (s *Service) queryIDs(ctx context.Context, q string, args ...any) ([]string, error) {
	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			out = append(out, id)
		}
	}
	return out, rows.Err()
}

// ── Trends sémantiques (croissance par catégorie) ────────────────────────────

type SemanticTrendingTopic struct {
	ID          string `json:"id"`
	TopicName   string `json:"topicName"`
	Description string `json:"description"`
	Count       int    `json:"count"`
	GrowthRate  string `json:"growthRate"`
}

// GetSemanticTrends calcule la croissance 7j vs 7j précédents par catégorie
// (port Go de getSemanticTrendingTopics de packages/db/feed.ts).
func (s *Service) GetSemanticTrends(ctx context.Context, limit int) ([]SemanticTrendingTopic, error) {
	if limit <= 0 {
		limit = 5
	}
	rows, err := s.pool.Query(ctx, `
		SELECT c.id::text, c.name, COALESCE(c.description, ''),
		       COUNT(a.id)::int AS total
		FROM "Category" c
		JOIN "Article" a ON a."categoryId" = c.id AND a.published = true
		GROUP BY c.id, c.name, c.description
		ORDER BY total DESC
		LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	type catRow struct {
		id, name, desc string
		total          int
	}
	var cats []catRow
	for rows.Next() {
		var c catRow
		if err := rows.Scan(&c.id, &c.name, &c.desc, &c.total); err == nil {
			cats = append(cats, c)
		}
	}
	if len(cats) == 0 {
		return []SemanticTrendingTopic{}, nil
	}

	now := time.Now()
	sevenDaysAgo := now.Add(-7 * 24 * time.Hour)
	fourteenDaysAgo := now.Add(-14 * 24 * time.Hour)

	out := make([]SemanticTrendingTopic, 0, len(cats))
	for _, c := range cats {
		var curr7, prev7 int
		_ = s.pool.QueryRow(ctx, `
			SELECT COUNT(*) FROM "Article"
			WHERE "categoryId" = $1 AND published = true AND "createdAt" >= $2`,
			toUUID(c.id), sevenDaysAgo).Scan(&curr7)
		_ = s.pool.QueryRow(ctx, `
			SELECT COUNT(*) FROM "Article"
			WHERE "categoryId" = $1 AND published = true
			  AND "createdAt" >= $2 AND "createdAt" < $3`,
			toUUID(c.id), fourteenDaysAgo, sevenDaysAgo).Scan(&prev7)

		var growthRate string
		if prev7 == 0 {
			if curr7 > 0 {
				g := curr7 * 18
				if g > 99 {
					g = 99
				}
				growthRate = "+" + itoa(g) + "% nouveaux"
			} else {
				growthRate = "+0% cette semaine"
			}
		} else {
			pct := int(math.Round(float64(curr7-prev7) / float64(prev7) * 100))
			sign := "+"
			if pct < 0 {
				sign = "-"
				pct = -pct
			}
			suffix := " d'échanges"
			if pct >= 20 {
				suffix = " cette semaine"
			} else if pct == 0 {
				suffix = " d'activité"
			}
			growthRate = sign + itoa(pct) + "%" + suffix
		}
		out = append(out, SemanticTrendingTopic{
			ID:          c.id,
			TopicName:   c.name,
			Description: c.desc,
			Count:       c.total,
			GrowthRate:  growthRate,
		})
	}
	return out, nil
}

// ── Helpers ──────────────────────────────────────────────────────────────────

func textPtr(t pgtype.Text) *string {
	if !t.Valid || t.String == "" {
		return nil
	}
	v := t.String
	return &v
}

func strOr(primary pgtype.Text, fallback pgtype.Text, def string) string {
	if primary.Valid && primary.String != "" {
		return primary.String
	}
	if fallback.Valid && fallback.String != "" {
		return fallback.String
	}
	return def
}

func itoa(n int) string {
	return strconv.Itoa(n)
}
