// Package analytics — métriques financières, top content et audience créateur.
package analytics

import (
	"context"
	"errors"
	"fmt"
	"log"
	"math"
	"sort"
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

// SubscriberDTO est un abonné listé dans la page audience du studio.
type SubscriberDTO struct {
	ID        string `json:"id"`
	Email     string `json:"email"`
	IsActive  bool   `json:"isActive"`
	IsPremium bool   `json:"isPremium"`
	LtvCents  int32  `json:"ltvCents"`
	CreatedAt string `json:"createdAt"`
}

// ListSubscribers retourne les abonnés de la publication (page audience studio).
func (s *Service) ListSubscribers(ctx context.Context, userID, publicationID string) ([]SubscriberDTO, error) {
	if !s.canAccess(ctx, userID, publicationID) {
		return nil, errForbidden
	}
	rows, err := s.q.ListSubscribers(ctx, publicationID)
	if err != nil {
		return nil, err
	}
	out := make([]SubscriberDTO, 0, len(rows))
	for _, r := range rows {
		out = append(out, SubscriberDTO{
			ID: r.ID, Email: r.Email, IsActive: r.IsActive, IsPremium: r.IsPremium,
			LtvCents: r.LtvCents, CreatedAt: r.CreatedAt.Time.Format(time.RFC3339),
		})
	}
	return out, nil
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
	ArticleID  string             `json:"articleId"`
	TotalViews int                `json:"totalViews"`
	Timeseries []DailySeriesPoint `json:"timeseries"`
	ByHostname []ProvenanceBucket `json:"byHostname"`
	BySource   []ProvenanceBucket `json:"bySource"`
}

// CreatorReadingStats est la réponse pour le dashboard créateur (creator endpoint).
type CreatorReadingStats struct {
	ArticleIDs  []string             `json:"articleIds"`
	PerArticle  ReadingSessionCounts `json:"perArticle"`
	TotalViews  int                  `json:"totalViews"`
	DailySeries []DailySeriesPoint   `json:"dailySeries"`
	Provenance  ProvenanceBreakdown  `json:"provenance"`
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
	Declared  int                 `json:"declared"`
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

func textPtr(t pgtype.Text) *string {
	if !t.Valid {
		return nil
	}
	v := t.String
	return &v
}

func round2(v float64) float64 {
	return float64(int(v*100+0.5)) / 100
}

// ── Product metrics (port Go du bloc Prisma de getCreatorAnalyticsData) ──────

type AnalyticsArticleMetric struct {
	ID                string    `json:"id"`
	Slug              string    `json:"slug"`
	Title             string    `json:"title"`
	CompletionRate    float64   `json:"completionRate"`
	Bookmarks         int       `json:"bookmarks"`
	Comments          int       `json:"comments"`
	Highlights        int       `json:"highlights"`
	HighlightsPublic  int       `json:"highlightsPublic"`
	HighlightsPrivate int       `json:"highlightsPrivate"`
	Annotations       int       `json:"annotations"`
	Interactions      int       `json:"interactions"`
	PublishedAt       time.Time `json:"publishedAt"`
	CategoryName      *string   `json:"categoryName"`
}

type AnalyticsCategoryCount struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

type ReadingQuality struct {
	DeepReadsRate int `json:"deepReadsRate"`
	SkimsRate     int `json:"skimsRate"`
	BouncesRate   int `json:"bouncesRate"`
}

type ProductMetrics struct {
	SubscriberCount   int                      `json:"subscriberCount"`
	SubscriberDelta7d int                      `json:"subscriberDelta7d"`
	TotalBookmarks    int                      `json:"totalBookmarks"`
	TotalHighlights   int                      `json:"totalHighlights"`
	TotalInteractions int                      `json:"totalInteractions"`
	AvgCompletionRate float64                  `json:"avgCompletionRate"`
	ReadingQuality    ReadingQuality           `json:"readingQuality"`
	TopCategories     []AnalyticsCategoryCount `json:"topCategories"`
	TopArticles       []AnalyticsArticleMetric `json:"topArticles"`
}

// ── Dashboard accueil (migration Prisma → Go) ────────────────────────────────
// Remplace le bloc Promise.all de prisma.* dans apps/studio/src/app/(creator)/page.tsx.

// DashboardArticle est un article de la liste récente / brouillons du dashboard.
type DashboardArticle struct {
	ID        string  `json:"id"`
	Title     string  `json:"title"`
	Published bool    `json:"published"`
	UpdatedAt string  `json:"updatedAt"`
	Category  *string `json:"categoryName"`
}

// DashboardThought est une pensée programmée du dashboard.
type DashboardThought struct {
	ID          string `json:"id"`
	Content     string `json:"content"`
	ScheduledAt string `json:"scheduledAt"`
}

// DashboardCount est le compteur _count du dernier article publié.
type DashboardCount struct {
	Bookmarks  int `json:"bookmarks"`
	Highlights int `json:"highlights"`
	Letters    int `json:"letters"`
}

// DashboardLatestArticle est le dernier article publié (avec réactions lecteurs).
type DashboardLatestArticle struct {
	ID          string         `json:"id"`
	Title       string         `json:"title"`
	ReadingTime int32          `json:"readingTime"`
	Category    *string        `json:"categoryName"`
	Count       DashboardCount `json:"_count"`
}

// DashboardOverview est la réponse complète de la page d'accueil du studio.
type DashboardOverview struct {
	PublicationWebsiteID    string                  `json:"publicationWebsiteId"`
	PublishedCount          int                     `json:"publishedCount"`
	SubscribersCount        int                     `json:"subscribersCount"`
	PremiumSubscribersCount int                     `json:"premiumSubscribersCount"`
	MRRCents                int                     `json:"mrrCents"`
	RecentArticles          []DashboardArticle      `json:"recentArticles"`
	DraftArticles           []DashboardArticle      `json:"draftArticles"`
	ScheduledThoughts       []DashboardThought      `json:"scheduledThoughts"`
	LatestPublishedArticle  *DashboardLatestArticle `json:"latestPublishedArticle"`
	Pageviews30d            int                     `json:"pageviews30d"`
	Visitors30d             int                     `json:"visitors30d"`
}

// canViewDashboard vérifie que l'utilisateur peut consulter le dashboard de la
// publication : propriétaire de sa publication personnelle OU membre d'un média
// (tout rôle — le dashboard accueil est visible par tous les membres).
func (s *Service) canViewDashboard(ctx context.Context, userID, publicationID string) bool {
	if personal, err := s.q.GetUserPersonalPublication(ctx, userID); err == nil && personal.String == publicationID {
		return true
	}
	_, err := s.q.GetMediaRoleForUser(ctx, db.GetMediaRoleForUserParams{
		PublicationId: publicationID, UserId: toUUID(userID),
	})
	return err == nil
}

// articleScopeSQL retourne le WHERE articles du dashboard selon le workspace :
//   - MEDIA → tous les articles de la publication ;
//   - PERSONAL → les articles du créateur (publication personnelle OU co-signés
//     via ArticleAttribution ACCEPTED + visible) — vues PLEIN par attribution.
// $1 = publicationId, $2 = userId (uuid).
func articleScopeSQL(media bool) string {
	if media {
		return `a."publicationId" = $1`
	}
	return `(a."publicationId" = $1 OR EXISTS (
		SELECT 1 FROM "ArticleAttribution" aa
		WHERE aa."articleId" = a.id
		  AND aa."userId" = $2
		  AND aa."consentStatus" = 'ACCEPTED'
		  AND aa."isVisible" = true))`
}

// DashboardOverview retourne toutes les données de la page d'accueil du studio
// (métriques, articles récents, brouillons, pensées programmées, dernier écrit
// publié, lectures 30j). workspaceType = PERSONAL | MEDIA.
func (s *Service) DashboardOverview(ctx context.Context, userID, publicationID, workspaceType string) (DashboardOverview, error) {
	out := DashboardOverview{
		RecentArticles:    []DashboardArticle{},
		DraftArticles:     []DashboardArticle{},
		ScheduledThoughts: []DashboardThought{},
	}
	if !s.canViewDashboard(ctx, userID, publicationID) {
		return out, errForbidden
	}
	if s.pool == nil {
		return out, fmt.Errorf("pool non configuré")
	}
	media := workspaceType == "MEDIA"
	userUUID := toUUID(userID)

	// Website Umami de la publication (fallback env géré côté studio).
	_ = s.pool.QueryRow(ctx, `SELECT COALESCE("umamiWebsiteId", '') FROM "Publication" WHERE id = $1`, publicationID).Scan(&out.PublicationWebsiteID)

	// Articles publiés (scope workspace).
	if media {
		_ = s.pool.QueryRow(ctx, `SELECT COUNT(*)::int FROM "Article" WHERE "publicationId" = $1 AND published = true`, publicationID).Scan(&out.PublishedCount)
	} else {
		_ = s.pool.QueryRow(ctx, `SELECT COUNT(*)::int FROM "Article" WHERE "authorId" = $1 AND published = true`, userUUID).Scan(&out.PublishedCount)
	}

	// Abonnés réseau + payants + LTV (MRR estimé = somme des ltvCents actifs).
	_ = s.pool.QueryRow(ctx, `SELECT COUNT(*)::int FROM "Subscriber" WHERE "publicationId" = $1 AND "isActive" = true`, publicationID).Scan(&out.SubscribersCount)
	_ = s.pool.QueryRow(ctx, `SELECT COUNT(*)::int FROM "Subscriber" WHERE "publicationId" = $1 AND "isActive" = true AND "isPremium" = true`, publicationID).Scan(&out.PremiumSubscribersCount)
	_ = s.pool.QueryRow(ctx, `SELECT COALESCE(SUM("ltvCents")::int, 0) FROM "Subscriber" WHERE "publicationId" = $1 AND "isActive" = true`, publicationID).Scan(&out.MRRCents)

	// Articles récents (4, par updatedAt desc) + brouillons (4).
	recentWhere := `a."publicationId" = $1`
	recentArgs := []any{publicationID}
	if !media {
		recentWhere = `a."authorId" = $1`
		recentArgs = []any{userUUID}
	}
	rows, err := s.pool.Query(ctx, `SELECT a.id, a.title, a.published, a."updatedAt", c.name
		FROM "Article" a LEFT JOIN "Category" c ON c.id = a."categoryId"
		WHERE `+recentWhere+`
		ORDER BY a."updatedAt" DESC LIMIT 4`, recentArgs...)
	if err == nil {
		for rows.Next() {
			var a DashboardArticle
			var cat pgtype.Text
			var updated pgtype.Timestamp
			if err := rows.Scan(&a.ID, &a.Title, &a.Published, &updated, &cat); err != nil {
				continue
			}
			a.UpdatedAt = updated.Time.Format(time.RFC3339)
			a.Category = textPtr(cat)
			out.RecentArticles = append(out.RecentArticles, a)
		}
		rows.Close()
	}
	rows, err = s.pool.Query(ctx, `SELECT a.id, a.title, a.published, a."updatedAt"
		FROM "Article" a
		WHERE `+recentWhere+` AND a.published = false
		ORDER BY a."updatedAt" DESC LIMIT 4`, recentArgs...)
	if err == nil {
		for rows.Next() {
			var a DashboardArticle
			var updated pgtype.Timestamp
			if err := rows.Scan(&a.ID, &a.Title, &a.Published, &updated); err != nil {
				continue
			}
			a.UpdatedAt = updated.Time.Format(time.RFC3339)
			out.DraftArticles = append(out.DraftArticles, a)
		}
		rows.Close()
	}

	// Pensées programmées (Post.scheduledAt non nul, 4, par date asc).
	rows, err = s.pool.Query(ctx, `SELECT t.id, t.content, t."scheduledAt" FROM "Post" t
		WHERE t."authorId" = $1 AND t."scheduledAt" IS NOT NULL AND t."deletedAt" IS NULL
		ORDER BY t."scheduledAt" ASC LIMIT 4`, userUUID)
	if err == nil {
		for rows.Next() {
			var th DashboardThought
			var sched pgtype.Timestamp
			if err := rows.Scan(&th.ID, &th.Content, &sched); err != nil {
				continue
			}
			th.ScheduledAt = sched.Time.Format(time.RFC3339)
			out.ScheduledThoughts = append(out.ScheduledThoughts, th)
		}
		rows.Close()
	}

	// Dernier écrit publié (avec catégorie + compteurs réactions lecteurs).
	latest := DashboardLatestArticle{}
	var cat pgtype.Text
	var bookmarks, highlights, letters int
	err = s.pool.QueryRow(ctx, `SELECT a.id, a.title, a."readingTime", c.name,
			(SELECT COUNT(*)::int FROM "Bookmark" b WHERE b."articleId" = a.id),
			(SELECT COUNT(*)::int FROM "Highlight" h WHERE h."articleId" = a.id),
			(SELECT COUNT(*)::int FROM "Letter" l WHERE l."articleId" = a.id)
		FROM "Article" a LEFT JOIN "Category" c ON c.id = a."categoryId"
		WHERE `+recentWhere+` AND a.published = true
		ORDER BY a."createdAt" DESC LIMIT 1`, recentArgs...).Scan(
		&latest.ID, &latest.Title, &latest.ReadingTime, &cat, &bookmarks, &highlights, &letters)
	if err == nil {
		latest.Category = textPtr(cat)
		latest.Count = DashboardCount{Bookmarks: bookmarks, Highlights: highlights, Letters: letters}
		out.LatestPublishedArticle = &latest
	}

	// Lectures 30j (vues + lecteurs uniques) sur les articles attribués.
	articleScope := articleScopeSQL(media)
	scopeArgs := []any{publicationID, userUUID}
	_ = s.pool.QueryRow(ctx, `SELECT COUNT(*)::int FROM "ReadingSession" rs
		JOIN "Article" a ON a.id = rs."articleId"
		WHERE rs."createdAt" >= now() - interval '30 days' AND `+articleScope, scopeArgs...).Scan(&out.Pageviews30d)
	_ = s.pool.QueryRow(ctx, `SELECT COUNT(DISTINCT rs."userId")::int FROM "ReadingSession" rs
		JOIN "Article" a ON a.id = rs."articleId"
		WHERE rs."createdAt" >= now() - interval '30 days' AND rs."userId" IS NOT NULL AND `+articleScope, scopeArgs...).Scan(&out.Visitors30d)

	return out, nil
}

// ProductMetrics calcule les métriques produit de la page analytics (parité
// getCreatorAnalyticsData Prisma) : abonnés (total + 7j), articles de la
// publication + co-signés (attribution ACCEPTED visible), compteurs
// bookmarks/comments/highlights/annotations, catégories et qualité de lecture.
func (s *Service) ProductMetrics(ctx context.Context, userID, publicationID string) (ProductMetrics, error) {
	if !s.canAccess(ctx, userID, publicationID) {
		return ProductMetrics{}, errForbidden
	}

	// Abonnés total + delta 7j.
	var subTotal, subDelta int
	_ = s.pool.QueryRow(ctx,
		`SELECT COUNT(*)::int FROM "Subscriber" WHERE "publicationId" = $1`, publicationID).Scan(&subTotal)
	_ = s.pool.QueryRow(ctx,
		`SELECT COUNT(*)::int FROM "Subscriber"
		 WHERE "publicationId" = $1 AND "createdAt" >= now() - interval '7 days'`, publicationID).Scan(&subDelta)

	// Articles de la publication OU co-signés (attribution ACCEPTED visible).
	rows, err := s.pool.Query(ctx, `
		SELECT a.id, a.slug, a.title, a."completionRate", a."createdAt",
		       c.name AS category_name,
		       (SELECT COUNT(*)::int FROM "Bookmark" b WHERE b."articleId" = a.id) AS bookmarks,
		       (SELECT COUNT(*)::int FROM "ArticleComment" ac WHERE ac."articleId" = a.id) AS comments,
		       (SELECT COUNT(*)::int FROM "Highlight" h WHERE h."articleId" = a.id) AS highlights,
		       (SELECT COUNT(*)::int FROM "Highlight" hp WHERE hp."articleId" = a.id AND hp."isPublic" = true) AS highlights_public,
		       (SELECT COUNT(*)::int FROM "AnnotationComment" anc
		         JOIN "Highlight" h2 ON h2.id = anc."highlightId"
		        WHERE h2."articleId" = a.id) AS annotations
		FROM "Article" a
		LEFT JOIN "Category" c ON c.id = a."categoryId"
		WHERE a.published = true AND (
		      a."publicationId" = $1
		   OR EXISTS (SELECT 1 FROM "ArticleAttribution" aa
		              WHERE aa."articleId" = a.id AND aa."userId" = $2
		                AND aa."consentStatus" = 'ACCEPTED' AND aa."isVisible" = true)
		)
		ORDER BY a."createdAt" DESC`, publicationID, toUUID(userID))
	if err != nil {
		return ProductMetrics{}, err
	}
	defer rows.Close()

	articles := []AnalyticsArticleMetric{}
	categoryCounts := map[string]int{}
	for rows.Next() {
		var a AnalyticsArticleMetric
		var cat pgtype.Text
		if err := rows.Scan(&a.ID, &a.Slug, &a.Title, &a.CompletionRate, &a.PublishedAt,
			&cat, &a.Bookmarks, &a.Comments, &a.Highlights, &a.HighlightsPublic, &a.Annotations); err != nil {
			continue
		}
		a.HighlightsPrivate = a.Highlights - a.HighlightsPublic
		a.Interactions = a.Bookmarks + a.Comments + a.Highlights + a.Annotations
		if cat.Valid {
			a.CategoryName = &cat.String
			categoryCounts[cat.String]++
		}
		articles = append(articles, a)
	}

	// Top 5 par interactions (tri stable, parité TS : sort().slice(0,5)).
	sort.SliceStable(articles, func(i, j int) bool { return articles[i].Interactions > articles[j].Interactions })
	top5 := articles
	if len(top5) > 5 {
		top5 = top5[:5]
	}

	topCategories := make([]AnalyticsCategoryCount, 0, len(categoryCounts))
	for name, count := range categoryCounts {
		topCategories = append(topCategories, AnalyticsCategoryCount{Name: name, Count: count})
	}
	sort.SliceStable(topCategories, func(i, j int) bool { return topCategories[i].Count > topCategories[j].Count })
	if len(topCategories) > 6 {
		topCategories = topCategories[:6]
	}

	// Qualité de lecture (completionRate réels).
	totalRate := 0.0
	deep, skim := 0, 0
	rateCount := 0
	for _, a := range articles {
		if a.CompletionRate > 0 {
			totalRate += a.CompletionRate
			rateCount++
			if a.CompletionRate >= 0.75 {
				deep++
			} else if a.CompletionRate < 0.5 {
				skim++
			}
		}
	}
	avg := 0.0
	deepRate, skimRate, bounceRate := 0, 0, 0
	if rateCount > 0 {
		avg = math.Round(totalRate/float64(rateCount)*100) / 100
		deepRate = int(math.Round(float64(deep) / float64(rateCount) * 100))
		skimRate = int(math.Round(float64(skim) / float64(rateCount) * 100))
		bounceRate = max(0, 100-deepRate-skimRate)
	}

	totB, totH, totI := 0, 0, 0
	for _, a := range top5 {
		totB += a.Bookmarks
		totH += a.Highlights
		totI += a.Interactions
	}

	return ProductMetrics{
		SubscriberCount:   subTotal,
		SubscriberDelta7d: subDelta,
		TotalBookmarks:    totB,
		TotalHighlights:   totH,
		TotalInteractions: totI,
		AvgCompletionRate: avg,
		ReadingQuality:    ReadingQuality{DeepReadsRate: deepRate, SkimsRate: skimRate, BouncesRate: bounceRate},
		TopCategories:     topCategories,
		TopArticles:       top5,
	}, nil
}
