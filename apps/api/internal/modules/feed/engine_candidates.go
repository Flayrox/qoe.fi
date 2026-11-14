package feed

import (
	"context"
	"fmt"
	"log"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/pgvector/pgvector-go"
	"github.com/qoefi/api/internal/eligibility"
)

// articleCandidate est un article brut extrait pour le reranking. tags sert à
// la pénalité de milieu (item portant un tag rejeté → dévalué).
type articleCandidate struct {
	id, title, content, authorID, pubID string
	tags                                []string
	readingTime                         int
	completionRate                      float64
	sim, freshness                      float64
	score                               float64
	createdAt                           time.Time
}

// thoughtCandidate est une pensée brute extraite pour le reranking. tags sert
// à la pénalité de milieu.
type thoughtCandidate struct {
	id, content, authorID              string
	tags                               []string
	likeCount, replyCount, repostCount int
	sim, freshness, score              float64
	createdAt                          time.Time
}

// parseEmbeddingText parses "[0.1,0.2,...]" into pgvector.Vector.
func parseEmbeddingText(s string) (pgvector.Vector, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return pgvector.Vector{}, false
	}
	s = strings.TrimPrefix(s, "[")
	s = strings.TrimSuffix(s, "]")
	if s == "" {
		return pgvector.Vector{}, false
	}
	parts := strings.Split(s, ",")
	vec := make([]float32, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		f, err := strconv.ParseFloat(p, 32)
		if err != nil {
			return pgvector.Vector{}, false
		}
		vec = append(vec, float32(f))
	}
	if len(vec) == 0 {
		return pgvector.Vector{}, false
	}
	return pgvector.NewVector(vec), true
}

// fetchUserEmbedding returns vector or nil (cold-start). Mirrors TS userVectorStr fetch.
func (s *Service) fetchUserEmbedding(ctx context.Context, userID string) (*pgvector.Vector, error) {
	if userID == "" {
		return nil, nil
	}
	var txt string
	err := s.pool.QueryRow(ctx, `SELECT COALESCE("embedding"::text,'') FROM "User" WHERE id = $1`, toUUID(userID)).Scan(&txt)
	if err != nil {
		if strings.Contains(err.Error(), "no rows") {
			return nil, nil
		}
		return nil, err
	}
	txt = strings.TrimSpace(txt)
	if txt == "" {
		return nil, nil
	}
	vec, ok := parseEmbeddingText(txt)
	if !ok {
		return nil, nil
	}
	return &vec, nil
}

func (s *Service) fetchMutedWords(ctx context.Context, userID string) []string {
	if userID == "" {
		return nil
	}
	rows, err := s.pool.Query(ctx, `SELECT word FROM "MutedWord" WHERE "userId" = $1`, toUUID(userID))
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var w string
		if err := rows.Scan(&w); err == nil {
			out = append(out, strings.ToLower(w))
		}
	}
	return out
}

// coReadNeighbors identifie les voisins de lecture (mêmes articles lus que
// moi), triés par affinité décroissante, normalisée 0..1. Base commune du CF
// articles (getCoReadCandidates) et du CF pensées (getCoReadThoughtCandidates).
func (s *Service) coReadNeighbors(ctx context.Context, userID string, cfg engineConfig) (map[string]float64, bool) {
	empty := map[string]float64{}
	if userID == "" {
		return empty, false
	}
	var myCount int
	err := s.pool.QueryRow(ctx, `SELECT COUNT(*)::int FROM "ReadingSession" WHERE "userId" = $1`, toUUID(userID)).Scan(&myCount)
	if err != nil || myCount < cfg.cfMinMyReads {
		return empty, false
	}
	rows, err := s.pool.Query(ctx, fmt.Sprintf(`
		WITH my_reads AS (
			SELECT "articleId", %s as w FROM "ReadingSession" WHERE "userId" = $1
		),
		neighbor_affinity AS (
			SELECT r2."userId" as neighbor_id, SUM(my.w * %s) as affinity
			FROM my_reads my JOIN "ReadingSession" r2 ON r2."articleId" = my."articleId" AND r2."userId" != $1
			GROUP BY r2."userId" ORDER BY affinity DESC LIMIT %d
		)
		SELECT neighbor_id, affinity FROM neighbor_affinity
	`, cfStatusWeights, cfStatusWeights, cfg.cfTopNeighbors), toUUID(userID))
	if err != nil {
		log.Printf("[feed CF] neighbors query failed: %v", err)
		return empty, false
	}
	defer rows.Close()
	type rec struct {
		id    string
		score float64
	}
	var recs []rec
	var maxScore float64 = 1
	for rows.Next() {
		var id string
		var sc float64
		if err := rows.Scan(&id, &sc); err == nil {
			recs = append(recs, rec{id, sc})
			if sc > maxScore {
				maxScore = sc
			}
		}
	}
	out := map[string]float64{}
	for _, r := range recs {
		out[r.id] = r.score / maxScore
	}
	return out, len(out) > 0
}

// getCoReadCandidates — CF collaboratif sur ARTICLES.
func (s *Service) getCoReadCandidates(ctx context.Context, userID string, cfg engineConfig) map[string]float64 {
	empty := map[string]float64{}
	neighbors, ok := s.coReadNeighbors(ctx, userID, cfg)
	if !ok {
		return empty
	}
	neighborVals := neighborValues(neighbors)

	rows, err := s.pool.Query(ctx, fmt.Sprintf(`
		WITH my_reads AS (
			SELECT "articleId", %s as w FROM "ReadingSession" WHERE "userId" = $1
		),
		na AS (
			SELECT * FROM (%s) AS t(neighbor_id, affinity)
		),
		cf_candidates AS (
			SELECT rs."articleId", SUM(na.affinity * %s) as cf_score
			FROM "ReadingSession" rs JOIN na ON na.neighbor_id = rs."userId"
			WHERE rs."articleId" NOT IN (SELECT "articleId" FROM my_reads) AND rs.status != 'BOUNCE'
			GROUP BY rs."articleId"
		)
		SELECT "articleId", cf_score FROM cf_candidates
	`, cfStatusWeights, neighborVals, cfStatusWeights), toUUID(userID))
	if err != nil {
		log.Printf("[feed CF] articles query failed: %v", err)
		return empty
	}
	defer rows.Close()
	out := map[string]float64{}
	var maxScore float64 = 1
	for rows.Next() {
		var id string
		var sc float64
		if err := rows.Scan(&id, &sc); err == nil {
			if sc > maxScore {
				maxScore = sc
			}
			out[id] = sc
		}
	}
	for id, sc := range out {
		out[id] = sc / maxScore
	}
	return out
}

// neighborValues construit un VALUES SQL typé (uuid, float8) à partir de la
// map d'affinités des voisins de lecture.
func neighborValues(neighbors map[string]float64) string {
	var sb strings.Builder
	sb.WriteString("SELECT * FROM (VALUES ")
	first := true
	for nid := range neighbors {
		if !first {
			sb.WriteString(",")
		}
		first = false
		sb.WriteString("('" + nid + "'::uuid, " + strconv.FormatFloat(neighbors[nid], 'f', -1, 64) + "::float8)")
	}
	sb.WriteString(") AS t(neighbor_id, affinity)")
	return sb.String()
}

// getCoReadThoughtCandidates — CF collaboratif sur PENSÉES.
func (s *Service) getCoReadThoughtCandidates(ctx context.Context, userID string, cfg engineConfig) map[string]float64 {
	empty := map[string]float64{}
	neighbors, ok := s.coReadNeighbors(ctx, userID, cfg)
	if !ok {
		return empty
	}
	neighborVals := neighborValues(neighbors)

	rows, err := s.pool.Query(ctx, `
		WITH na AS (
			SELECT * FROM (`+neighborVals+`) AS t(neighbor_id, affinity)
		),
		cf_thoughts AS (
			SELECT l."postId" AS id, SUM(na.affinity) AS cf_score
			FROM "Like" l JOIN na ON na.neighbor_id = l."userId"
			WHERE l."postId" NOT IN (
				SELECT id FROM "Post" WHERE "authorId" = $1 OR id IN (SELECT "postId" FROM "Like" WHERE "userId" = $1)
			)
			GROUP BY l."postId"
		)
		SELECT id, cf_score FROM cf_thoughts
	`, toUUID(userID))
	if err != nil {
		log.Printf("[feed CF] thoughts query failed: %v", err)
		return empty
	}
	defer rows.Close()
	out := map[string]float64{}
	var maxScore float64 = 1
	for rows.Next() {
		var id string
		var sc float64
		if err := rows.Scan(&id, &sc); err == nil {
			if sc > maxScore {
				maxScore = sc
			}
			out[id] = sc
		}
	}
	for id, sc := range out {
		out[id] = sc / maxScore
	}
	return out
}

// getArticleEngagementScores calcule les scores d'engagement article et pénalités de rebond.
func (s *Service) getArticleEngagementScores(ctx context.Context, articleIDs []string, cfg engineConfig) (map[string]float64, map[string]bool) {
	scores := map[string]float64{}
	penalties := map[string]bool{}
	if len(articleIDs) == 0 {
		return scores, penalties
	}
	rows, err := s.pool.Query(ctx, `
		SELECT a.id as "articleId",
		       COUNT(rs.id)::int as sessions,
		       COUNT(rs.id) FILTER (WHERE rs.status='BOUNCE')::int as bounces,
		       AVG(CASE rs.status WHEN 'READ_COMPLETE' THEN 1.0 WHEN 'READ_PARTIAL' THEN 0.6 WHEN 'SKIM' THEN 0.3 WHEN 'BOUNCE' THEN 0.05 ELSE NULL END) as read_quality,
		       (SELECT COUNT(*) FROM "Bookmark" b WHERE b."articleId"=a.id)::int as bookmarks,
		       (SELECT COUNT(*) FROM "Highlight" h WHERE h."articleId"=a.id)::int as highlights
		FROM "Article" a LEFT JOIN "ReadingSession" rs ON rs."articleId"=a.id
		WHERE a.id = ANY($1::text[]) GROUP BY a.id`, articleIDs)
	if err != nil {
		log.Printf("[feed ENG] query failed: %v", err)
		return scores, penalties
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var sessions, bounces, bookmarks, highlights int
		var readQuality *float64
		if err := rows.Scan(&id, &sessions, &bounces, &readQuality, &bookmarks, &highlights); err != nil {
			continue
		}
		if sessions == 0 {
			continue
		}
		rq := 0.0
		if readQuality != nil {
			rq = *readQuality
		}
		socialRaw := float64(bookmarks) + float64(highlights)*1.5
		socialProof := math.Min(1, socialRaw/12)
		conf := math.Min(1, float64(sessions)/10)
		eng := cfg.engReadWeight*rq + cfg.engSocialWeight*socialProof + cfg.engConfWeight*conf
		bounceRate := float64(bounces) / float64(sessions)
		if sessions >= cfg.engMinSessions && (rq < cfg.engNegativeThresh || bounceRate > 0.5) {
			eng *= cfg.engNegativePenalty
			penalties[id] = true
		}
		if eng < 0 {
			eng = 0
		}
		if eng > 1 {
			eng = 1
		}
		scores[id] = eng
	}
	return scores, penalties
}

// getThoughtPreference dérive le penchant pensées/articles d'un utilisateur à
// partir de sa lecture réelle (ReadingSession des 90 derniers jours).
func (s *Service) getThoughtPreference(ctx context.Context, userID string, cfg engineConfig) float64 {
	if userID == "" {
		return 0.5
	}
	rows, err := s.pool.Query(ctx,
		`SELECT status, COALESCE("readingTimeMinutes"::float8, 0)
		 FROM "ReadingSession"
		 WHERE "userId" = $1 AND "createdAt" >= now() - interval '90 days'`,
		toUUID(userID))
	if err != nil {
		log.Printf("[feed] getThoughtPreference query failed: %v", err)
		return 0.5
	}
	defer rows.Close()

	statusWeight := func(st string) float64 {
		switch st {
		case "READ_COMPLETE":
			return 1.0
		case "READ_PARTIAL":
			return 0.6
		case "SKIM":
			return 0.3
		default:
			return 0.15
		}
	}
	sessionLean := func(mins float64) float64 {
		switch {
		case mins <= 3:
			return 0.85
		case mins >= 8:
			return 0.15
		default:
			return 0.85 - 0.70*(mins-3)/5
		}
	}

	var n int
	var weightSum, leanSum float64
	for rows.Next() {
		var st string
		var mins float64
		if err := rows.Scan(&st, &mins); err != nil {
			continue
		}
		w := statusWeight(st)
		if w <= 0 {
			continue
		}
		leanSum += w * sessionLean(mins)
		weightSum += w
		n++
	}
	aff := 0.5
	if n >= cfg.adaptMinSessions && weightSum > 0 {
		aff = leanSum / weightSum
	}
	aff += cfg.feedbackPreferWeight * s.getThoughtFeedbackDrift(ctx, userID, cfg)
	if aff < 0 {
		aff = 0
	}
	if aff > 1 {
		aff = 1
	}
	return aff
}

// getThoughtFeedbackDrift résout l'impact des retours explicites (ContentFeedback)
// sur le penchant pensées/articles des 90 derniers jours.
func (s *Service) getThoughtFeedbackDrift(ctx context.Context, userID string, cfg engineConfig) float64 {
	if userID == "" {
		return 0
	}
	var thoughtMore, thoughtLess, articleMore, articleLess int
	err := s.pool.QueryRow(ctx, `SELECT
			COUNT(*) FILTER (WHERE "thoughtId" IS NOT NULL AND type = 'SHOW_MORE'),
			COUNT(*) FILTER (WHERE "thoughtId" IS NOT NULL AND type = 'SHOW_LESS'),
			COUNT(*) FILTER (WHERE "articleId" IS NOT NULL AND type = 'SHOW_MORE'),
			COUNT(*) FILTER (WHERE "articleId" IS NOT NULL AND type = 'SHOW_LESS')
		FROM "ContentFeedback"
		WHERE "userId" = $1 AND "createdAt" >= now() - interval '90 days'`, toUUID(userID)).Scan(
		&thoughtMore, &thoughtLess, &articleMore, &articleLess)
	if err != nil {
		return 0
	}
	total := thoughtMore + thoughtLess + articleMore + articleLess
	if total < cfg.feedbackMinSignals {
		return 0
	}
	signals := float64(thoughtMore + articleLess - thoughtLess - articleMore)
	return signals / float64(total)
}

// getImpressionPenalties renvoie les ids d'items que l'utilisateur a déjà vus
// ≥3 fois dans le feed (30j) sans jamais s'y engager.
func (s *Service) getImpressionPenalties(ctx context.Context, userID string, artIDs, thIDs []string, cfg engineConfig) map[string]bool {
	out := map[string]bool{}
	if userID == "" || (len(artIDs) == 0 && len(thIDs) == 0) {
		return out
	}
	rows, err := s.pool.Query(ctx, `
		SELECT "itemType", "itemId", COUNT(*)::int
		FROM "FeedImpression"
		WHERE "userId" = $1 AND "createdAt" > now() - make_interval(days => $4)
		  AND ("itemId" = ANY($2::text[]) OR "itemId" = ANY($3::text[]))
		GROUP BY "itemType", "itemId"`, toUUID(userID), artIDs, thIDs, cfg.feedbackWindowDays)
	if err != nil {
		log.Printf("[feed] impression query failed: %v", err)
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var typ, id string
		var n int
		if err := rows.Scan(&typ, &id, &n); err == nil && n >= cfg.impressionThreshold {
			out[id] = true
		}
	}
	return out
}

// getShowMoreBoost renvoie la similarité cosinus maximale à un des contenus SHOW_MORE.
func (s *Service) getShowMoreBoost(ctx context.Context, userID string, artIDs, thIDs []string, cfg engineConfig) map[string]float64 {
	out := map[string]float64{}
	if userID == "" || (len(artIDs) == 0 && len(thIDs) == 0) {
		return out
	}
	if len(artIDs) > 0 {
		rows, err := s.pool.Query(ctx, `
			WITH anchors AS (
				SELECT cf."articleId" AS id, a.embedding
				FROM "ContentFeedback" cf JOIN "Article" a ON a.id = cf."articleId"
				WHERE cf."userId" = $1 AND cf.type = 'SHOW_MORE' AND cf."createdAt" > now() - make_interval(days => $3)
				  AND a.embedding IS NOT NULL
			)
			SELECT a.id, MAX(1 - (a.embedding <=> an.embedding))::float8 AS sim
			FROM "Article" a JOIN anchors an ON true
			WHERE a.id = ANY($2::text[]) AND a.embedding IS NOT NULL
			  AND NOT EXISTS (
			      SELECT 1 FROM "ContentFeedback" cf
			      WHERE cf."userId" = $1 AND cf."articleId" = a.id AND cf.type = 'SHOW_LESS')
			GROUP BY a.id`, toUUID(userID), artIDs, cfg.feedbackWindowDays)
		if err == nil {
			readSimMap(rows, out)
		}
	}
	if len(thIDs) > 0 {
		rows, err := s.pool.Query(ctx, `
			WITH anchors AS (
				SELECT cf."thoughtId" AS id, p.embedding
				FROM "ContentFeedback" cf JOIN "Post" p ON p.id = cf."thoughtId"
				WHERE cf."userId" = $1 AND cf.type = 'SHOW_MORE' AND cf."createdAt" > now() - make_interval(days => $3)
				  AND p.embedding IS NOT NULL
			)
			SELECT p.id, MAX(1 - (p.embedding <=> an.embedding))::float8 AS sim
			FROM "Post" p JOIN anchors an ON true
			WHERE p.id = ANY($2::text[]) AND p.embedding IS NOT NULL
			  AND NOT EXISTS (
			      SELECT 1 FROM "ContentFeedback" cf
			      WHERE cf."userId" = $1 AND cf."thoughtId" = p.id AND cf.type = 'SHOW_LESS')
			GROUP BY p.id`, toUUID(userID), thIDs, cfg.feedbackWindowDays)
		if err == nil {
			readSimMap(rows, out)
		}
	}
	return out
}

func readSimMap(rows pgx.Rows, out map[string]float64) {
	defer rows.Close()
	for rows.Next() {
		var id string
		var sim float64
		if rows.Scan(&id, &sim) == nil {
			if sim < 0 {
				sim = 0
			}
			if sim > 1 {
				sim = 1
			}
			out[id] = sim
		}
	}
}

// getVelocityScores calcule la vélocité d'engagement des dernières velWindowHours (48h).
func (s *Service) getVelocityScores(ctx context.Context, artIDs, thIDs []string, cfg engineConfig) (map[string]float64, map[string]float64) {
	artVel := map[string]float64{}
	thVel := map[string]float64{}

	if len(thIDs) > 0 {
		rows, err := s.pool.Query(ctx, `
			SELECT p.id,
			       (SELECT count(*)::float8 FROM "Like" l
			         WHERE l."postId" = p.id
			           AND l."createdAt" > now() - make_interval(hours => $2))
			     + (SELECT count(*)::float8 FROM "Post" r
			         WHERE (r."parentId" = p.id OR r."repostId" = p.id)
			           AND r."createdAt" > now() - make_interval(hours => $2)
			           AND r."deletedAt" IS NULL) AS recent
			FROM "Post" p
			WHERE p.id = ANY($1::text[])`, thIDs, cfg.velWindowHours)
		if err == nil {
			for rows.Next() {
				var id string
				var recent float64
				if rows.Scan(&id, &recent) == nil {
					thVel[id] = math.Min(1.0, recent/float64(cfg.velPostTarget))
				}
			}
			rows.Close()
		}
	}

	if len(artIDs) > 0 {
		rows, err := s.pool.Query(ctx, `
			SELECT rs."articleId",
			       sum(CASE rs.status WHEN 'READ_COMPLETE' THEN 1.0
			                          WHEN 'READ_PARTIAL' THEN 0.6
			                          WHEN 'SKIM' THEN 0.3 ELSE 0.1 END)::float8 AS recent
			FROM "ReadingSession" rs
			WHERE rs."articleId" = ANY($1::text[])
			  AND rs."createdAt" > now() - make_interval(hours => $2)
			GROUP BY rs."articleId"`, artIDs, cfg.velWindowHours)
		if err == nil {
			for rows.Next() {
				var id string
				var recent float64
				if rows.Scan(&id, &recent) == nil {
					artVel[id] = math.Min(1.0, recent/float64(cfg.velArticleTarget))
				}
			}
			rows.Close()
		}
	}
	return artVel, thVel
}

// fetchCandidateEmbeddings charge les embeddings des candidats pour la sélection MMR.
func (s *Service) fetchCandidateEmbeddings(ctx context.Context, table string, ids []string) map[string][]float32 {
	out := map[string][]float32{}
	if len(ids) == 0 {
		return out
	}
	rows, err := s.pool.Query(ctx, fmt.Sprintf(`SELECT id, embedding::text FROM %q WHERE id = ANY($1::text[])`, table), ids)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var id, txt string
		if rows.Scan(&id, &txt) != nil {
			continue
		}
		if v, ok := parseEmbeddingText(txt); ok {
			out[id] = v.Slice()
		}
	}
	return out
}

// penalizedTags retourne les tags rejetés par l'utilisateur (≥ milieuPenaltyThreshold signalements).
func (s *Service) penalizedTags(ctx context.Context, userID string, cfg engineConfig) map[string]bool {
	out := map[string]bool{}
	if userID == "" {
		return out
	}
	rows, err := s.pool.Query(ctx, `
		SELECT t.tag
		FROM (
			SELECT unnest(p.tags) AS tag FROM "ContentFeedback" cf
			JOIN "Post" p ON p.id = cf."thoughtId"
			WHERE cf."userId" = $1 AND cf.type = 'SHOW_LESS'
			UNION ALL
			SELECT unnest(a."semanticTags") FROM "ContentFeedback" cf
			JOIN "Article" a ON a.id = cf."articleId"
			WHERE cf."userId" = $1 AND cf.type = 'SHOW_LESS'
			UNION ALL
			SELECT unnest(a."semanticTags") FROM "ReadingSession" rs
			JOIN "Article" a ON a.id = rs."articleId"
			WHERE rs."userId" = $1 AND rs.status = 'BOUNCE'
		) t
		GROUP BY t.tag
		HAVING count(*) >= $2`, toUUID(userID), cfg.milieuThreshold)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var tag string
		if rows.Scan(&tag) == nil {
			out[tag] = true
		}
	}
	return out
}

// penalizedArray construit le fragment SQL de dévaluation du pool et ses arguments.
func penalizedArray(penalized map[string]bool, ai int, tagCol string, factor float64) ([]any, string) {
	if len(penalized) == 0 {
		return nil, ""
	}
	tags := make([]string, 0, len(penalized))
	for t := range penalized {
		tags = append(tags, t)
	}
	return []any{tags}, fmt.Sprintf(` * CASE WHEN %s && $%d::text[] THEN %.2f ELSE 1 END`, tagCol, ai, factor)
}

// fetchEngineArticles extrait les articles candidats (ANN pgvector ou cold-start).
func (s *Service) fetchEngineArticles(ctx context.Context, vec *pgvector.Vector, userID string, limit, offset int, muted []string, cfg engineConfig, penalized map[string]bool) ([]articleCandidate, error) {
	var rows pgx.Rows
	var err error
	if vec != nil {
		args := []any{*vec}
		q := `
		SELECT a.id, a.title, a.content, a."readingTime", a."completionRate", a."authorId", a."publisherId", a."createdAt", COALESCE(a."semanticTags", '{}'),
		       (1 - (a."embedding" <=> $1::vector))::float8 AS sim,
		       EXP(-EXTRACT(EPOCH FROM (NOW() - a."createdAt"))/172800)::float8 AS fresh
		FROM "Article" a JOIN "User" u ON u.id::text = a."authorId"::text
		WHERE a.published = true AND a."embedding" IS NOT NULL
		  AND u."isShadowbanned" = false AND u."isSuspended" = false`
		ai := 2
		if userID != "" {
			viewerParam := ai
			q += eligibility.ArticlePredicates(eligibility.Aliases{
				Entity: "a", Authors: []string{`a."authorId"`}, Viewer: fmt.Sprintf("$%d", viewerParam),
			})
			q += fmt.Sprintf(` AND (
				COALESCE((SELECT us."profileVisibility"
				          FROM "Publisher" p
				          JOIN "User" ow ON ow."publisherId" = p.id
				          LEFT JOIN "UserSettings" us ON us."userId" = ow.id
				          WHERE p.id = a."publisherId" LIMIT 1), 'PUBLIC') = 'PUBLIC'
				OR EXISTS (SELECT 1 FROM "Follows" f WHERE f."readerId"=$%d AND f."publisherId"=a."publisherId")
			)`, viewerParam)
			args = append(args, toUUID(userID))
			ai++
			q += fmt.Sprintf(` AND NOT EXISTS (SELECT 1 FROM "ContentFeedback" cf WHERE cf."userId"=$%d AND cf."articleId"=a.id AND cf.type='SHOW_LESS')`, ai)
			args = append(args, toUUID(userID))
			ai++
		}
		penArgs, penSQL := penalizedArray(penalized, ai, "\"semanticTags\"", cfg.milieuFactor)
		args = append(args, penArgs...)
		ai += len(penArgs)
		q += fmt.Sprintf(` ORDER BY ((%.2f*(1 - (a."embedding" <=> $1::vector)) + %.2f*EXP(-EXTRACT(EPOCH FROM (NOW() - a."createdAt"))/172800) + %.2f*(0.70 + 0.30*a."completionRate"))%s) DESC LIMIT $%d OFFSET $%d`,
			cfg.poolSim, cfg.poolFresh, cfg.poolCompletion, penSQL, ai, ai+1)
		args = append(args, limit, offset)
		rows, err = s.pool.Query(ctx, q, args...)
	} else {
		q := fmt.Sprintf(`
		SELECT a.id, a.title, a.content, a."readingTime", a."completionRate", a."authorId", a."publisherId", a."createdAt", COALESCE(a."semanticTags", '{}'),
		       %.2f::float8 AS sim,
		       EXP(-EXTRACT(EPOCH FROM (NOW() - a."createdAt"))/172800)::float8 AS fresh
		FROM "Article" a JOIN "User" u ON u.id::text = a."authorId"::text
		WHERE a.published = true AND u."isShadowbanned" = false AND u."isSuspended" = false
		  AND NOT is_blocked_bidirectional($3, a."authorId")
		  AND NOT is_muted_by($3, a."authorId")
		  AND NOT contains_muted_word($3, COALESCE(a.title, '') || ' ' || COALESCE(a.content, ''))
		  AND (
		    COALESCE((SELECT us."profileVisibility"
		              FROM "Publisher" p
		              JOIN "User" ow ON ow."publisherId" = p.id
		              LEFT JOIN "UserSettings" us ON us."userId" = ow.id
		              WHERE p.id = a."publisherId" LIMIT 1), 'PUBLIC') = 'PUBLIC'
		    OR EXISTS (SELECT 1 FROM "Follows" f WHERE f."readerId"=$3 AND f."publisherId"=a."publisherId")
		  )
		ORDER BY (0.50*EXP(-EXTRACT(EPOCH FROM (NOW() - a."createdAt"))/172800) + 0.50*(0.70 + 0.30*a."completionRate")) DESC
		LIMIT $1 OFFSET $2`, cfg.coldStartSim)
		rows, err = s.pool.Query(ctx, q, limit, offset, toUUID(userID))
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []articleCandidate{}
	for rows.Next() {
		var c articleCandidate
		var pubID *string
		if err := rows.Scan(&c.id, &c.title, &c.content, &c.readingTime, &c.completionRate, &c.authorID, &pubID, &c.createdAt, &c.tags, &c.sim, &c.freshness); err != nil {
			continue
		}
		if pubID != nil {
			c.pubID = *pubID
		}
		if !mutedOK(c.title, muted) || !mutedOK(c.content, muted) {
			continue
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// fetchEngineThoughts extrait les pensées candidates (ANN pgvector ou cold-start).
func (s *Service) fetchEngineThoughts(ctx context.Context, vec *pgvector.Vector, userID string, limit, offset int, muted []string, cfg engineConfig, penalized map[string]bool) ([]thoughtCandidate, error) {
	var rows pgx.Rows
	var err error
	if vec != nil {
		args := []any{*vec}
		q := `
		SELECT p.id, p.content, p."authorId", p."createdAt", p."likeCount", p."replyCount", p."repostCount", COALESCE(p.tags, '{}'),
		       (1 - (p."embedding" <=> $1::vector))::float8 AS sim,
		       EXP(-EXTRACT(EPOCH FROM (NOW() - p."createdAt"))/86400)::float8 AS fresh
		FROM "Post" p JOIN "User" u ON u.id = p."authorId"
		WHERE p."parentId" IS NULL AND p."repostId" IS NULL AND p."deletedAt" IS NULL
		  AND p."isDraft" = false AND p."isHiddenByAuthor" = false AND p."embedding" IS NOT NULL
		  AND u."isShadowbanned" = false AND u."isSuspended" = false`
		ai := 2
		if userID != "" {
			viewerParam := ai
			q += eligibility.ThoughtPredicates(eligibility.Aliases{
				Entity: "p", Authors: []string{`p."authorId"`}, Viewer: fmt.Sprintf("$%d", viewerParam),
			})
			q += fmt.Sprintf(` AND (
				COALESCE((SELECT us."profileVisibility" FROM "UserSettings" us WHERE us."userId" = u.id), 'PUBLIC') = 'PUBLIC'
				OR EXISTS (SELECT 1 FROM "Follows" f WHERE f."readerId"=$%d AND f."publisherId"=u."publisherId")
			)`, viewerParam)
			args = append(args, toUUID(userID))
			ai++
			q += fmt.Sprintf(` AND NOT EXISTS (SELECT 1 FROM "ContentFeedback" cf WHERE cf."userId"=$%d AND cf."thoughtId"=p.id AND cf.type='SHOW_LESS')`, ai)
			args = append(args, toUUID(userID))
			ai++
		}
		penArgs, penSQL := penalizedArray(penalized, ai, "tags", cfg.milieuFactor)
		args = append(args, penArgs...)
		ai += len(penArgs)
		q += fmt.Sprintf(` ORDER BY ((%.2f*(1 - (p."embedding" <=> $1::vector)) + %.2f*EXP(-EXTRACT(EPOCH FROM (NOW() - p."createdAt"))/86400) + %.2f*LEAST(1.0,(p."likeCount" + p."replyCount"*2 + p."repostCount"*2)/30.0))%s) DESC LIMIT $%d OFFSET $%d`,
			cfg.poolSim, cfg.poolFresh, cfg.poolCompletion, penSQL, ai, ai+1)
		args = append(args, limit, offset)
		rows, err = s.pool.Query(ctx, q, args...)
	} else {
		q := fmt.Sprintf(`
		SELECT p.id, p.content, p."authorId", p."createdAt", p."likeCount", p."replyCount", p."repostCount", COALESCE(p.tags, '{}'),
		       %.2f::float8 AS sim,
		       EXP(-EXTRACT(EPOCH FROM (NOW() - p."createdAt"))/86400)::float8 AS fresh
		FROM "Post" p JOIN "User" u ON u.id = p."authorId"
		WHERE p."parentId" IS NULL AND p."repostId" IS NULL AND p."deletedAt" IS NULL
		  AND p."isDraft" = false AND p."isHiddenByAuthor" = false
		  AND u."isShadowbanned" = false AND u."isSuspended" = false
		  AND NOT is_blocked_bidirectional($3, p."authorId")
		  AND NOT is_muted_by($3, p."authorId")
		  AND NOT contains_muted_word($3, p.content)
		  AND (
		    COALESCE((SELECT us."profileVisibility" FROM "UserSettings" us WHERE us."userId" = u.id), 'PUBLIC') = 'PUBLIC'
		    OR EXISTS (SELECT 1 FROM "Follows" f WHERE f."readerId"=$3 AND f."publisherId"=u."publisherId")
		  )
		ORDER BY (0.50*EXP(-EXTRACT(EPOCH FROM (NOW() - p."createdAt"))/86400) + 0.50*LEAST(1.0,(p."likeCount" + p."replyCount"*2 + p."repostCount"*2)/30.0)) DESC
		LIMIT $1 OFFSET $2`, cfg.coldStartSim)
		rows, err = s.pool.Query(ctx, q, limit, offset, toUUID(userID))
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []thoughtCandidate{}
	for rows.Next() {
		var c thoughtCandidate
		if err := rows.Scan(&c.id, &c.content, &c.authorID, &c.createdAt, &c.likeCount, &c.replyCount, &c.repostCount, &c.tags, &c.sim, &c.freshness); err != nil {
			continue
		}
		if !mutedOK(c.content, muted) {
			continue
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// explorationRatio résout le taux d'exploration adaptatif.
func (s *Service) explorationRatio(ctx context.Context, userID string) float64 {
	if userID == "" {
		return explorationRatioDefault
	}
	cold := explorationRatioColdDefault
	if v, err := strconv.ParseFloat(s.readConfig(ctx, explorationCfgKeyCold), 64); err == nil && v >= 0 && v <= 0.5 {
		cold = v
	}
	warm := explorationRatioDefault
	if v, err := strconv.ParseFloat(s.readConfig(ctx, explorationCfgKey), 64); err == nil && v >= 0 && v <= 0.5 {
		warm = v
	}
	minSignals := explorationMinSignalsDefault
	if v, err := strconv.Atoi(s.readConfig(ctx, explorationCfgKeyMinSignals)); err == nil && v >= 0 && v <= 1000 {
		minSignals = v
	}
	var signals int
	if err := s.pool.QueryRow(ctx, `
		SELECT (SELECT count(*) FROM "Like" WHERE "userId" = $1)
		     + (SELECT count(*) FROM "ReadingSession" WHERE "userId" = $1)`,
		toUUID(userID)).Scan(&signals); err != nil {
		return warm
	}
	return pickExplorationRatio(signals, cold, warm, minSignals)
}

func (s *Service) injectDiscovery(ctx context.Context, userID string, items []EngineItem, limit int, cfg engineConfig) []EngineItem {
	ratio := s.explorationRatio(ctx, userID)
	slots := int(math.Round(float64(limit) * ratio))
	if slots <= 0 {
		return items
	}

	var followed []string
	rows, err := s.pool.Query(ctx, `SELECT "publisherId" FROM "Follows" WHERE "readerId"=$1 AND "publisherId" IS NOT NULL`, toUUID(userID))
	if err != nil {
		return items
	}
	for rows.Next() {
		var pid string
		if rows.Scan(&pid) == nil {
			followed = append(followed, pid)
		}
	}
	rows.Close()
	if len(followed) == 0 {
		return items
	}

	existing := map[string]bool{}
	for _, it := range items {
		existing[it.ID] = true
	}

	drows, err := s.pool.Query(ctx, `
		SELECT id FROM "Article"
		WHERE published = true AND "completionRate" >= $1
		  AND "publisherId" <> ALL($2::text[])
		  AND "authorId"::text <> $3
		ORDER BY "createdAt" DESC LIMIT $4`, cfg.explorationMinQuality, followed, userID, slots)
	if err != nil {
		return items
	}
	defer drows.Close()

	positions := make([]int, 0, slots)
	for i := 0; i < slots; i++ {
		positions = append(positions, int(math.Round(float64(limit)*float64(i+1)/float64(slots+1))))
	}
	k := 0
	for drows.Next() {
		var id string
		if drows.Scan(&id) != nil {
			continue
		}
		if existing[id] {
			continue
		}
		pos := len(items)
		if k < len(positions) && positions[k] < len(items) {
			pos = positions[k]
		}
		items = append(items, EngineItem{})
		copy(items[pos+1:], items[pos:])
		items[pos] = EngineItem{ItemType: "ARTICLE", ID: id, IsDiscovery: true}
		existing[id] = true
		k++
	}
	if len(items) > limit {
		items = items[:limit]
	}
	return items
}
