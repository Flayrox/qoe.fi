// Package analytics — métriques financières, top content et audience créateur.
package analytics

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api/internal/database"
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

	// umami est un pool en lecture seule vers la DB Postgres d'Umami
	// (vide si UMAMI_DATABASE_URL n'est pas configurée).
	umami *pgxpool.Pool
}

func NewService(pool *pgxpool.Pool, umamiDSN string) *Service {
	var umamiPool *pgxpool.Pool
	if p, err := connectUmamiPool(umamiDSN); err != nil {
		log.Printf("[analytics] umami pool ignoré: %v", err)
	} else {
		umamiPool = p
	}
	return &Service{pool: pool, q: db.New(pool), umami: umamiPool}
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

// publicationWebsiteID vérifie l'accès et résout l'umamiWebsiteId de la publication.
func (s *Service) publicationWebsiteID(ctx context.Context, userID, publicationID string) (string, error) {
	if !s.canAccess(ctx, userID, publicationID) {
		return "", errForbidden
	}
	id, err := s.q.GetPublicationUmamiWebsiteId(ctx, publicationID)
	if err != nil {
		return "", err
	}
	if !id.Valid || id.String == "" {
		return "", errors.New("aucun website Umami provisionné pour cette publication")
	}
	return id.String, nil
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

// ── ReadingSession — migration Prisma → Go ──────────────────────────────────
// Remplace prisma.readingSession.groupBy / $queryRawUnsafe dans
// apps/studio/src/app/(creator)/analytics/actions.ts

// ProvenanceBucket est un bucket de provenance (source/hostname/referrer).
type ProvenanceBucket struct {
	Key   string `json:"key"`
	Count int    `json:"count"`
}

// ProvenanceBreakdown est le breakdown complet par source/hostname/referrer.
type ProvenanceBreakdown struct {
	BySource   []ProvenanceBucket `json:"bySource"`
	ByHostname []ProvenanceBucket `json:"byHostname"`
	ByReferrer []ProvenanceBucket `json:"byReferrer"`
}

// DailySeriesPoint est un point de timeseries quotidien (YYYY-MM-DD → vues).
type DailySeriesPoint struct {
	Day   string `json:"day"`
	Count int    `json:"count"`
}

// ReadingSessionCounts retourne vues par articleId (canonique, plein).
type ReadingSessionCounts map[string]int

// ArticleDetailStats est la réponse pour un article individuel (reading-sessions endpoint).
type ArticleDetailStats struct {
	ArticleID  string              `json:"articleId"`
	TotalViews int                 `json:"totalViews"`
	Timeseries []DailySeriesPoint  `json:"timeseries"`
	ByHostname []ProvenanceBucket  `json:"byHostname"`
	BySource   []ProvenanceBucket  `json:"bySource"`
}

// CreatorReadingStats est la réponse pour le dashboard créateur (creator endpoint).
type CreatorReadingStats struct {
	ArticleIDs     []string            `json:"articleIds"`
	PerArticle     ReadingSessionCounts `json:"perArticle"`
	TotalViews     int                 `json:"totalViews"`
	DailySeries    []DailySeriesPoint  `json:"dailySeries"`
	Provenance     ProvenanceBreakdown `json:"provenance"`
}

// attributedArticleIDs retourne les IDs d'articles attribués au créateur :
// publication directe OU co-signés via ArticleAttribution (ACCEPTED + visible).
// Miroir de prisma.article.findMany { OR: [{publicationId}, {attributions: ...}] }
func (s *Service) attributedArticleIDs(ctx context.Context, userID, publicationID string) ([]string, error) {
	if s.pool == nil {
		return nil, fmt.Errorf("pool non configuré")
	}
	rows, err := s.pool.Query(ctx, `
		SELECT a.id FROM "Article" a
		WHERE a.published = true
		  AND (
		    a."publicationId" = $1
		    OR EXISTS (
		      SELECT 1 FROM "ArticleAttribution" aa
		      WHERE aa."articleId" = a.id
		        AND aa."userId" = $2
		        AND aa."consentStatus" = 'ACCEPTED'
		        AND aa."isVisible" = true
		    )
		  )
	`, publicationID, toUUID(userID))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			continue
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// GroupReadingSessionsBySource groupe les ReadingSession par source (feed|subdomain|public_profile|direct).
// Sqlc: GroupReadingSessionsBySource — raw fallback si pool seul.
func (s *Service) GroupReadingSessionsBySource(ctx context.Context, articleIDs []string, since *time.Time) ([]ProvenanceBucket, error) {
	if s.pool == nil || len(articleIDs) == 0 {
		return []ProvenanceBucket{}, nil
	}
	var rows pgx.Rows
	var err error
	if since != nil {
		rows, err = s.pool.Query(ctx, `
			SELECT source, COUNT(*)::int FROM "ReadingSession"
			WHERE "articleId" = ANY($1::text[]) AND "createdAt" >= $2
			GROUP BY source ORDER BY COUNT(*) DESC`, articleIDs, *since)
	} else {
		rows, err = s.pool.Query(ctx, `
			SELECT source, COUNT(*)::int FROM "ReadingSession"
			WHERE "articleId" = ANY($1::text[])
			GROUP BY source ORDER BY COUNT(*) DESC`, articleIDs)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ProvenanceBucket
	for rows.Next() {
		var key string
		var cnt int
		if err := rows.Scan(&key, &cnt); err != nil {
			continue
		}
		out = append(out, ProvenanceBucket{Key: key, Count: cnt})
	}
	if out == nil {
		out = []ProvenanceBucket{}
	}
	return out, rows.Err()
}

// GroupByHostname groupe par hostname (tenant d'où vient la vue).
// Sqlc: GroupByHostname
func (s *Service) GroupByHostname(ctx context.Context, articleIDs []string, since *time.Time) ([]ProvenanceBucket, error) {
	if s.pool == nil || len(articleIDs) == 0 {
		return []ProvenanceBucket{}, nil
	}
	var rows pgx.Rows
	var err error
	if since != nil {
		rows, err = s.pool.Query(ctx, `
			SELECT hostname, COUNT(*)::int FROM "ReadingSession"
			WHERE "articleId" = ANY($1::text[]) AND hostname IS NOT NULL AND "createdAt" >= $2
			GROUP BY hostname ORDER BY COUNT(*) DESC`, articleIDs, *since)
	} else {
		rows, err = s.pool.Query(ctx, `
			SELECT hostname, COUNT(*)::int FROM "ReadingSession"
			WHERE "articleId" = ANY($1::text[]) AND hostname IS NOT NULL
			GROUP BY hostname ORDER BY COUNT(*) DESC`, articleIDs)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ProvenanceBucket
	for rows.Next() {
		var key string
		var cnt int
		if err := rows.Scan(&key, &cnt); err != nil {
			continue
		}
		out = append(out, ProvenanceBucket{Key: key, Count: cnt})
	}
	if out == nil {
		out = []ProvenanceBucket{}
	}
	return out, rows.Err()
}

// GroupByReferrerUsername groupe par referrerUsername (@simone).
// Sqlc: GroupByReferrerUsername
func (s *Service) GroupByReferrerUsername(ctx context.Context, articleIDs []string, since *time.Time) ([]ProvenanceBucket, error) {
	if s.pool == nil || len(articleIDs) == 0 {
		return []ProvenanceBucket{}, nil
	}
	var rows pgx.Rows
	var err error
	if since != nil {
		rows, err = s.pool.Query(ctx, `
			SELECT "referrerUsername", COUNT(*)::int FROM "ReadingSession"
			WHERE "articleId" = ANY($1::text[]) AND "referrerUsername" IS NOT NULL AND "createdAt" >= $2
			GROUP BY "referrerUsername" ORDER BY COUNT(*) DESC`, articleIDs, *since)
	} else {
		rows, err = s.pool.Query(ctx, `
			SELECT "referrerUsername", COUNT(*)::int FROM "ReadingSession"
			WHERE "articleId" = ANY($1::text[]) AND "referrerUsername" IS NOT NULL
			GROUP BY "referrerUsername" ORDER BY COUNT(*) DESC`, articleIDs)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ProvenanceBucket
	for rows.Next() {
		var key string
		var cnt int
		if err := rows.Scan(&key, &cnt); err != nil {
			continue
		}
		out = append(out, ProvenanceBucket{Key: "@" + key, Count: cnt})
	}
	if out == nil {
		out = []ProvenanceBucket{}
	}
	return out, rows.Err()
}

// GetReadingSessionDailySeries retourne la série quotidienne des lectures.
// Sqlc: GetReadingSessionDailySeries — miroir de $queryRawUnsafe `to_char(date_trunc('day', "createdAt")...)`
func (s *Service) GetReadingSessionDailySeries(ctx context.Context, articleIDs []string, since *time.Time) ([]DailySeriesPoint, error) {
	if s.pool == nil || len(articleIDs) == 0 {
		return []DailySeriesPoint{}, nil
	}
	var rows pgx.Rows
	var err error
	if since != nil {
		rows, err = s.pool.Query(ctx, `
			SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') as day, COUNT(*)::int as cnt
			FROM "ReadingSession"
			WHERE "articleId" = ANY($1::text[]) AND "createdAt" >= $2
			GROUP BY date_trunc('day', "createdAt")
			ORDER BY day`, articleIDs, *since)
	} else {
		rows, err = s.pool.Query(ctx, `
			SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') as day, COUNT(*)::int as cnt
			FROM "ReadingSession"
			WHERE "articleId" = ANY($1::text[])
			GROUP BY date_trunc('day', "createdAt")
			ORDER BY day`, articleIDs)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []DailySeriesPoint
	for rows.Next() {
		var day string
		var cnt int
		if err := rows.Scan(&day, &cnt); err != nil {
			continue
		}
		out = append(out, DailySeriesPoint{Day: day, Count: cnt})
	}
	if out == nil {
		out = []DailySeriesPoint{}
	}
	return out, rows.Err()
}

// CountReadingSessionsByArticleId compte les lectures d'un article (plein, peu importe le tenant).
// Sqlc: CountReadingSessionsByArticleId — miroir de prisma.readingSession.count({where:{articleId}})
func (s *Service) CountReadingSessionsByArticleId(ctx context.Context, articleID string, since *time.Time) (int, error) {
	if s.pool == nil {
		return 0, nil
	}
	var cnt int
	var err error
	if since != nil {
		err = s.pool.QueryRow(ctx, `SELECT COUNT(*)::int FROM "ReadingSession" WHERE "articleId"=$1 AND "createdAt" >= $2`, articleID, *since).Scan(&cnt)
	} else {
		err = s.pool.QueryRow(ctx, `SELECT COUNT(*)::int FROM "ReadingSession" WHERE "articleId"=$1`, articleID).Scan(&cnt)
	}
	return cnt, err
}

// GroupReadingSessionsByArticleId agrège vues par articleId (pour topPages plein).
func (s *Service) GroupReadingSessionsByArticleId(ctx context.Context, articleIDs []string, since *time.Time) (ReadingSessionCounts, error) {
	m := make(ReadingSessionCounts)
	if s.pool == nil || len(articleIDs) == 0 {
		return m, nil
	}
	var rows pgx.Rows
	var err error
	if since != nil {
		rows, err = s.pool.Query(ctx, `
			SELECT "articleId", COUNT(*)::int FROM "ReadingSession"
			WHERE "articleId" = ANY($1::text[]) AND "createdAt" >= $2
			GROUP BY "articleId"`, articleIDs, *since)
	} else {
		rows, err = s.pool.Query(ctx, `
			SELECT "articleId", COUNT(*)::int FROM "ReadingSession"
			WHERE "articleId" = ANY($1::text[])
			GROUP BY "articleId"`, articleIDs)
	}
	if err != nil {
		return m, err
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var cnt int
		if err := rows.Scan(&id, &cnt); err == nil {
			m[id] = cnt
		}
	}
	return m, rows.Err()
}

// GetProvenance agrège la provenance fine (source/hostname/referrer) pour un créateur sur une période.
func (s *Service) GetProvenance(ctx context.Context, userID, publicationID string, since *time.Time) (ProvenanceBreakdown, error) {
	ids, err := s.attributedArticleIDs(ctx, userID, publicationID)
	if err != nil {
		return ProvenanceBreakdown{}, err
	}
	if len(ids) == 0 {
		return ProvenanceBreakdown{BySource: []ProvenanceBucket{}, ByHostname: []ProvenanceBucket{}, ByReferrer: []ProvenanceBucket{}}, nil
	}
	bySource, err := s.GroupReadingSessionsBySource(ctx, ids, since)
	if err != nil {
		return ProvenanceBreakdown{}, err
	}
	byHostname, err := s.GroupByHostname(ctx, ids, since)
	if err != nil {
		return ProvenanceBreakdown{}, err
	}
	byReferrer, err := s.GroupByReferrerUsername(ctx, ids, since)
	if err != nil {
		return ProvenanceBreakdown{}, err
	}
	return ProvenanceBreakdown{BySource: bySource, ByHostname: byHostname, ByReferrer: byReferrer}, nil
}

// GetCreatorReadingStats agrège les stats lecture du créateur (vues plein + provenance + série quotidienne).
// Remplace le bloc provenance + perArticleDb + rawSeries dans getCreatorAnalyticsData.
func (s *Service) GetCreatorReadingStats(ctx context.Context, userID, publicationID string, since *time.Time) (CreatorReadingStats, error) {
	ids, err := s.attributedArticleIDs(ctx, userID, publicationID)
	if err != nil {
		return CreatorReadingStats{}, err
	}
	if len(ids) == 0 {
		return CreatorReadingStats{
			ArticleIDs:  []string{},
			PerArticle:  ReadingSessionCounts{},
			DailySeries: []DailySeriesPoint{},
			Provenance:  ProvenanceBreakdown{BySource: []ProvenanceBucket{}, ByHostname: []ProvenanceBucket{}, ByReferrer: []ProvenanceBucket{}},
		}, nil
	}
	perArticle, err := s.GroupReadingSessionsByArticleId(ctx, ids, since)
	if err != nil {
		return CreatorReadingStats{}, err
	}
	total := 0
	for _, v := range perArticle {
		total += v
	}
	series, err := s.GetReadingSessionDailySeries(ctx, ids, since)
	if err != nil {
		return CreatorReadingStats{}, err
	}
	prov, err := s.GetProvenance(ctx, userID, publicationID, since)
	if err != nil {
		return CreatorReadingStats{}, err
	}
	return CreatorReadingStats{
		ArticleIDs:  ids,
		PerArticle:  perArticle,
		TotalViews:  total,
		DailySeries: series,
		Provenance:  prov,
	}, nil
}

// GetArticleReadingStats retourne les stats d'un article individuel (reading-sessions endpoint).
// Vérifie que l'article appartient au créateur (publicationId OU attribution).
func (s *Service) GetArticleReadingStats(ctx context.Context, userID, articleID string, since *time.Time) (ArticleDetailStats, error) {
	if s.pool == nil {
		return ArticleDetailStats{}, fmt.Errorf("pool non configuré")
	}
	// Vérifie la propriété : publication du user OU attribution acceptée
	var owned int
	err := s.pool.QueryRow(ctx, `
		SELECT COUNT(*)::int FROM "Article" a
		WHERE a.id = $1 AND (
		  a."publicationId" = (SELECT "publicationId" FROM "User" WHERE id = $2)
		  OR EXISTS (SELECT 1 FROM "ArticleAttribution" aa WHERE aa."articleId"=a.id AND aa."userId"=$2 AND aa."consentStatus"='ACCEPTED' AND aa."isVisible"=true)
		  OR a."authorId" = $2
		)
	`, articleID, toUUID(userID)).Scan(&owned)
	if err != nil {
		return ArticleDetailStats{}, err
	}
	if owned == 0 {
		// Vérifie aussi accès média (editor/owner) via canAccess sur la publication de l'article
		var pubID string
		if err := s.pool.QueryRow(ctx, `SELECT "publicationId" FROM "Article" WHERE id=$1`, articleID).Scan(&pubID); err == nil {
			if !s.canAccess(ctx, userID, pubID) {
				return ArticleDetailStats{}, errForbidden
			}
		} else {
			return ArticleDetailStats{}, errForbidden
		}
	}

	total, err := s.CountReadingSessionsByArticleId(ctx, articleID, since)
	if err != nil {
		return ArticleDetailStats{}, err
	}
	series, err := s.GetReadingSessionDailySeries(ctx, []string{articleID}, since)
	if err != nil {
		return ArticleDetailStats{}, err
	}
	byHost, err := s.GroupByHostname(ctx, []string{articleID}, since)
	if err != nil {
		return ArticleDetailStats{}, err
	}
	bySource, err := s.GroupReadingSessionsBySource(ctx, []string{articleID}, since)
	if err != nil {
		return ArticleDetailStats{}, err
	}
	return ArticleDetailStats{
		ArticleID:  articleID,
		TotalViews: total,
		Timeseries: series,
		ByHostname: byHost,
		BySource:   bySource,
	}, nil
}

// ── Démographie — migration prisma.user.groupBy ────────────────────────────

type DemographicBucket struct {
	Value string `json:"value"`
	Count int    `json:"count"`
}

type AudienceDemographics struct {
	Declared  int                `json:"declared"`
	Gender    []DemographicBucket `json:"gender"`
	AgeRange  []DemographicBucket `json:"ageRange"`
	Countries []DemographicBucket `json:"countries"`
	Languages []DemographicBucket `json:"languages"`
}

type AudienceInsights struct {
	Creator  AudienceDemographics `json:"creator"`
	Platform AudienceDemographics `json:"platform"`
}

func (s *Service) groupUsersByColumn(ctx context.Context, column string, userIDs []string) ([]DemographicBucket, error) {
	if s.pool == nil {
		return []DemographicBucket{}, nil
	}
	// column est interne (pas d'entrée utilisateur) — whitelist stricte
	allowed := map[string]string{
		"gender":       `"gender"`,
		"ageRange":     `"ageRange"`,
		"countryCode":  `"countryCode"`,
		"languageCode": `"languageCode"`,
	}
	col, ok := allowed[column]
	if !ok {
		return nil, fmt.Errorf("colonne invalide: %s", column)
	}
	var rows pgx.Rows
	var err error
	if len(userIDs) > 0 {
		uids := make([]pgtype.UUID, 0, len(userIDs))
		for _, id := range userIDs {
			uids = append(uids, toUUID(id))
		}
		q := fmt.Sprintf(`SELECT %s::text, COUNT(*)::int FROM "User" WHERE %s IS NOT NULL AND id = ANY($1::uuid[]) GROUP BY %s ORDER BY COUNT(*) DESC`, col, col, col)
		rows, err = s.pool.Query(ctx, q, uids)
	} else {
		q := fmt.Sprintf(`SELECT %s::text, COUNT(*)::int FROM "User" WHERE %s IS NOT NULL GROUP BY %s ORDER BY COUNT(*) DESC`, col, col, col)
		rows, err = s.pool.Query(ctx, q)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []DemographicBucket
	for rows.Next() {
		var v string
		var c int
		if err := rows.Scan(&v, &c); err != nil {
			continue
		}
		if v == "" {
			continue
		}
		out = append(out, DemographicBucket{Value: v, Count: c})
	}
	if out == nil {
		out = []DemographicBucket{}
	}
	return out, rows.Err()
}

func (s *Service) aggregateDemographics(ctx context.Context, userIDs []string) (AudienceDemographics, error) {
	gender, err := s.groupUsersByColumn(ctx, "gender", userIDs)
	if err != nil {
		return AudienceDemographics{}, err
	}
	age, err := s.groupUsersByColumn(ctx, "ageRange", userIDs)
	if err != nil {
		return AudienceDemographics{}, err
	}
	countries, err := s.groupUsersByColumn(ctx, "countryCode", userIDs)
	if err != nil {
		return AudienceDemographics{}, err
	}
	languages, err := s.groupUsersByColumn(ctx, "languageCode", userIDs)
	if err != nil {
		return AudienceDemographics{}, err
	}
	declared := len(gender)
	if len(age) > declared {
		declared = len(age)
	}
	if len(countries) > declared {
		declared = len(countries)
	}
	if len(languages) > declared {
		declared = len(languages)
	}
	return AudienceDemographics{
		Declared:  declared,
		Gender:    gender,
		AgeRange:  age,
		Countries: countries,
		Languages: languages,
	}, nil
}

// GetAudienceInsights retourne l'insight démographique créateur + plateforme (agrégé, jamais individuel).
// Remplace getAudienceInsights + aggregateDemographics dans actions.ts
func (s *Service) GetAudienceInsights(ctx context.Context, userID, publicationID string) (AudienceInsights, error) {
	if !s.canAccess(ctx, userID, publicationID) {
		return AudienceInsights{}, errForbidden
	}
	// Platform-wide (tous les users)
	platform, err := s.aggregateDemographics(ctx, nil)
	if err != nil {
		return AudienceInsights{}, err
	}
	// Followers du créateur
	rows, err := s.pool.Query(ctx, `SELECT "readerId"::text FROM "Follows" WHERE "publicationId"=$1`, publicationID)
	if err != nil {
		return AudienceInsights{Creator: AudienceDemographics{}, Platform: platform}, nil
	}
	defer rows.Close()
	seen := map[string]bool{}
	var readerIDs []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err == nil && !seen[id] {
			seen[id] = true
			readerIDs = append(readerIDs, id)
		}
	}
	var creator AudienceDemographics
	if len(readerIDs) > 0 {
		creator, err = s.aggregateDemographics(ctx, readerIDs)
		if err != nil {
			return AudienceInsights{}, err
		}
	} else {
		creator = AudienceDemographics{Gender: []DemographicBucket{}, AgeRange: []DemographicBucket{}, Countries: []DemographicBucket{}, Languages: []DemographicBucket{}}
	}
	return AudienceInsights{Creator: creator, Platform: platform}, nil
}

func toUUID(id string) pgtype.UUID {
	u := pgtype.UUID{}
	_ = u.Scan(id)
	return u
}

func round2(v float64) float64 {
	return float64(int(v*100+0.5)) / 100
}
