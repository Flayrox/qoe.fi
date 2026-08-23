package feed

import (
	"context"
	"fmt"
	"log"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/pgvector/pgvector-go"
)

// ─────────────────────────────────────────────────────────────────────────────
// Two-Tower personalized feed — Go port of packages/db/src/feed.ts (1382 lines)
// ─────────────────────────────────────────────────────────────────────────────
// Mirrors TS logic:
//   Score = (0.40*Sim + 0.20*Fresh + 0.20*Engagement + 0.20*Circadian) * CompletionBonus
// + MMR diversity (max 2 / author)
// + Collaborative Filtering via co-reading (ReadingSession, ArticleAttribution)
// + Cold-start (nil embedding → fallback)
// + EMA vector updates
// Uses pgx + pgvector-go + sqlc where possible, raw pgx for vector ANN.

// CircadianProfile mirrors getCircadianProfile return in TS.
type CircadianProfile struct {
	Name                 string  `json:"name"`
	Label                string  `json:"label"`
	TargetReadingMinutes float64 `json:"targetReadingMinutes"`
	SigmaMinutes         float64 `json:"sigmaMinutes"`
	ArticleRatio         float64 `json:"articleRatio"`
	ThoughtRatio         float64 `json:"thoughtRatio"`
}

// InteractionType for EMA updates.
type InteractionType string

const (
	InteractionHighlight    InteractionType = "HIGHLIGHT"
	InteractionBookmark     InteractionType = "BOOKMARK"
	InteractionLike         InteractionType = "LIKE"
	InteractionReadComplete InteractionType = "READ_COMPLETE"
	InteractionReadPartial  InteractionType = "READ_PARTIAL"
	InteractionClick        InteractionType = "CLICK"
)

var emaWeights = map[InteractionType]float64{
	InteractionHighlight:    0.15,
	InteractionBookmark:     0.15,
	InteractionReadComplete: 0.10,
	InteractionReadPartial:  0.06,
	InteractionLike:         0.08,
	InteractionClick:        0.03,
}

// Engagement / CF constants — mirrors feed.ts.
const (
	engReadWeight       = 0.5
	engSocialWeight     = 0.3
	engConfidenceWeight = 0.2
	engMinSessions      = 5
	engNegativeThresh   = 0.25
	engNegativePenalty  = 0.85

	cfMinMyReads    = 3
	cfTopNeighbors  = 10
	cfStatusWeights = `CASE status WHEN 'READ_COMPLETE' THEN 1.0 WHEN 'READ_PARTIAL' THEN 0.6 WHEN 'SKIM' THEN 0.3 ELSE 0.1 END`
)

// getCircadianProfile mirrors TS getCircadianProfile.
func getCircadianProfile(userHour int, userDayOfWeek int) CircadianProfile {
	now := time.Now()
	h := now.Hour()
	if userHour >= 0 && userHour <= 23 {
		h = userHour
	}
	d := int(now.Weekday())
	if userDayOfWeek >= 0 && userDayOfWeek <= 6 {
		d = userDayOfWeek
	}
	isWeekend := d == 0 || d == 6
	if isWeekend {
		return CircadianProfile{Name: "WEEKEND_LONGFORM", Label: "Exploration & Temps Long du Week-end", TargetReadingMinutes: 12, SigmaMinutes: 4.5, ArticleRatio: 0.7, ThoughtRatio: 0.3}
	}
	switch {
	case h >= 6 && h < 11:
		return CircadianProfile{Name: "MORNING_BRIEF", Label: "Matinée & Trajets : Formats Courts & Pensées", TargetReadingMinutes: 5.5, SigmaMinutes: 2.2, ArticleRatio: 0.45, ThoughtRatio: 0.55}
	case h >= 11 && h < 15:
		return CircadianProfile{Name: "MIDDAY_BREAK", Label: "Pause Déjeuner : Débats & Terroirs", TargetReadingMinutes: 7.5, SigmaMinutes: 2.8, ArticleRatio: 0.6, ThoughtRatio: 0.4}
	case h >= 15 && h < 19:
		return CircadianProfile{Name: "AFTERNOON_FLOW", Label: "Après-midi : Essais & Perspectives", TargetReadingMinutes: 8.5, SigmaMinutes: 3.0, ArticleRatio: 0.65, ThoughtRatio: 0.35}
	case h >= 19 && h <= 23:
		return CircadianProfile{Name: "EVENING_SANCTUARY", Label: "Sanctuaire du Soir : Essais de Fond & Philosophie", TargetReadingMinutes: 12.0, SigmaMinutes: 4.0, ArticleRatio: 0.75, ThoughtRatio: 0.25}
	default:
		return CircadianProfile{Name: "LATE_NIGHT", Label: "Lecture Nocturne Calme", TargetReadingMinutes: 7.0, SigmaMinutes: 3.0, ArticleRatio: 0.5, ThoughtRatio: 0.5}
	}
}

func computeCircadianFit(readingTimeMinutes, targetMinutes, sigma float64) float64 {
	diff := readingTimeMinutes - targetMinutes
	return math.Exp(-(diff * diff) / (2 * sigma * sigma))
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

func normalizeVector(v []float32) []float32 {
	var norm float64
	for _, x := range v {
		norm += float64(x) * float64(x)
	}
	norm = math.Sqrt(norm)
	if norm == 0 {
		return v
	}
	out := make([]float32, len(v))
	for i, x := range v {
		out[i] = float32(float64(x) / norm)
	}
	return out
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

// getCoReadCandidates mirrors TS getCoReadCandidates via ReadingSession.
func (s *Service) getCoReadCandidates(ctx context.Context, userID string) map[string]float64 {
	empty := map[string]float64{}
	if userID == "" {
		return empty
	}
	// Guard: need >=3 reads else cold-start noise
	var myCount int
	err := s.pool.QueryRow(ctx, `SELECT COUNT(*)::int FROM "ReadingSession" WHERE "userId" = $1`, toUUID(userID)).Scan(&myCount)
	if err != nil || myCount < cfMinMyReads {
		return empty
	}
	rows, err := s.pool.Query(ctx, fmt.Sprintf(`
		WITH my_reads AS (
			SELECT "articleId", %s as w FROM "ReadingSession" WHERE "userId" = $1
		),
		neighbor_affinity AS (
			SELECT r2."userId" as neighbor_id, SUM(my.w * %s) as affinity
			FROM my_reads my JOIN "ReadingSession" r2 ON r2."articleId" = my."articleId" AND r2."userId" != $1
			GROUP BY r2."userId" ORDER BY affinity DESC LIMIT %d
		),
		cf_candidates AS (
			SELECT rs."articleId", SUM(na.affinity * %s) as cf_score
			FROM "ReadingSession" rs JOIN neighbor_affinity na ON na.neighbor_id = rs."userId"
			WHERE rs."articleId" NOT IN (SELECT "articleId" FROM my_reads) AND rs.status != 'BOUNCE'
			GROUP BY rs."articleId"
		)
		SELECT "articleId", cf_score FROM cf_candidates
	`, cfStatusWeights, cfStatusWeights, cfTopNeighbors, cfStatusWeights), toUUID(userID))
	if err != nil {
		log.Printf("[feed CF] query failed: %v", err)
		return empty
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
	// Normalize 0..1
	out := map[string]float64{}
	for _, r := range recs {
		out[r.id] = r.score / maxScore
	}
	return out
}

// articleEngagement mirrors getArticleEngagementScores.
func (s *Service) getArticleEngagementScores(ctx context.Context, articleIDs []string) (map[string]float64, map[string]bool) {
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
		eng := engReadWeight*rq + engSocialWeight*socialProof + engConfidenceWeight*conf
		bounceRate := float64(bounces) / float64(sessions)
		if sessions >= engMinSessions && (rq < engNegativeThresh || bounceRate > 0.5) {
			eng *= engNegativePenalty
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

// scoredPost is internal candidate for reranking.
type scoredPost struct {
	id             string
	authorID       string
	createdAt      time.Time
	content        string
	likeCount      int
	repostCount    int
	replyCount     int
	sim            float64
	freshness      float64
	engagement     float64
	circadianFit   float64
	completionBonus float64
	totalScore     float64
}

// PersonalizedFeed mirrors TS getPersonalizedFeed for thoughts.
// Two-Tower: Sim (pgvector cosine) + Freshness (exp decay) + Engagement + Circadian (Gaussian)
// Score = (0.40*Sim + 0.20*Fresh + 0.20*Engagement + 0.20*Circadian) * CompletionBonus
// MMR diversity by author (max 2)
// Cold-start when no embedding → Sim=0.5, popularity fallback
// CF boost is folded via getCoReadCandidates if candidates reference quoted articles (best-effort).
func (s *Service) PersonalizedFeed(ctx context.Context, userID string, limit, offset int, userHour int) (FeedResult, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	circadian := getCircadianProfile(userHour, -1)
	overFetch := limit * 3
	if overFetch > 100 {
		overFetch = 100
	}

	vec, err := s.fetchUserEmbedding(ctx, userID)
	if err != nil {
		log.Printf("[feed] fetchUserEmbedding: %v", err)
		vec = nil
	}
	mutedWords := s.fetchMutedWords(ctx, userID)
	// CF — only used to boost posts quoting CF articles; if empty, no boost
	cfMap := s.getCoReadCandidates(ctx, userID)

	// ── pgvector similarity search ───────────────────────────────────────
	var rows pgx.Rows
	if vec != nil {
		// Personalized ANN search
		q := `
		SELECT p.id, p.content, p."authorId", p."createdAt", p."likeCount", p."repostCount", p."replyCount",
		       (1 - (p."embedding" <=> $1::vector))::float8 AS sim_score,
		       EXP(-EXTRACT(EPOCH FROM (NOW() - p."createdAt"))/86400)::float8 AS freshness_score,
		       p."quotedArticleId"
		FROM "Post" p JOIN "User" u ON u.id = p."authorId"
		WHERE p."parentId" IS NULL AND p."repostId" IS NULL AND p."deletedAt" IS NULL
		  AND p."isDraft"=false AND p."isHiddenByAuthor"=false
		  AND p."embedding" IS NOT NULL
		  AND u."isShadowbanned"=false AND u."isSuspended"=false`
		var args []any = []any{*vec}
		argIdx := 2
		if userID != "" {
			q += fmt.Sprintf(` AND NOT EXISTS (SELECT 1 FROM "BlockedUser" bu WHERE bu."readerId"=$%d AND bu."creatorId"=p."authorId")`, argIdx)
			args = append(args, toUUID(userID))
			argIdx++
			q += fmt.Sprintf(` AND NOT EXISTS (SELECT 1 FROM "ContentFeedback" cf WHERE cf."userId"=$%d AND cf."thoughtId"=p.id AND cf.type='SHOW_LESS')`, argIdx)
			args = append(args, toUUID(userID))
			argIdx++
		}
		q += fmt.Sprintf(` ORDER BY (0.50*(1 - (p."embedding" <=> $1::vector)) + 0.25*EXP(-EXTRACT(EPOCH FROM (NOW() - p."createdAt"))/86400) + 0.25*LEAST(1.0,(p."likeCount"+p."replyCount"*2+p."repostCount"*2)/30.0)) DESC LIMIT $%d OFFSET $%d`, argIdx, argIdx+1)
		args = append(args, overFetch, offset)
		rows, err = s.pool.Query(ctx, q, args...)
	} else {
		// Cold-start: no embedding → popularity + freshness + circadian
		q := `
		SELECT p.id, p.content, p."authorId", p."createdAt", p."likeCount", p."repostCount", p."replyCount",
		       0.5::float8 AS sim_score,
		       EXP(-EXTRACT(EPOCH FROM (NOW() - p."createdAt"))/86400)::float8 AS freshness_score,
		       p."quotedArticleId"
		FROM "Post" p JOIN "User" u ON u.id = p."authorId"
		WHERE p."parentId" IS NULL AND p."repostId" IS NULL AND p."deletedAt" IS NULL
		  AND p."isDraft"=false AND p."isHiddenByAuthor"=false
		  AND u."isShadowbanned"=false AND u."isSuspended"=false`
		var args []any
		argIdx := 1
		if userID != "" {
			q += fmt.Sprintf(` AND NOT EXISTS (SELECT 1 FROM "BlockedUser" bu WHERE bu."readerId"=$%d AND bu."creatorId"=p."authorId")`, argIdx)
			args = append(args, toUUID(userID))
			argIdx++
		}
		q += fmt.Sprintf(` ORDER BY (0.50*EXP(-EXTRACT(EPOCH FROM (NOW() - p."createdAt"))/86400) + 0.50*LEAST(1.0,(p."likeCount"+p."replyCount"*2+p."repostCount"*2)/30.0)) DESC LIMIT $%d OFFSET $%d`, argIdx, argIdx+1)
		args = append(args, overFetch, offset)
		rows, err = s.pool.Query(ctx, q, args...)
	}
	if err != nil {
		return FeedResult{}, err
	}
	defer rows.Close()

	filterMuted := func(text string) bool {
		if len(mutedWords) == 0 {
			return true
		}
		low := strings.ToLower(text)
		for _, w := range mutedWords {
			if strings.Contains(low, w) {
				return false
			}
		}
		return true
	}

	var candidates []scoredPost
	for rows.Next() {
		var id, content, authorID string
		var createdAt time.Time
		var likeCount, repostCount, replyCount int32
		var sim, freshness float64
		var quotedArticleID *string
		if err := rows.Scan(&id, &content, &authorID, &createdAt, &likeCount, &repostCount, &replyCount, &sim, &freshness, &quotedArticleID); err != nil {
			continue
		}
		if !filterMuted(content) {
			continue
		}
		eng := math.Min(1.0, float64(likeCount+replyCount*2+repostCount*2)/30.0)
		// Circadian fit via Gaussian on estimated reading time (words/200)
		words := float64(len(strings.Fields(content)))
		if words == 0 {
			words = 10
		}
		readingMin := words / 200.0
		if readingMin < 0.2 {
			readingMin = 0.2
		}
		circadianFit := computeCircadianFit(readingMin, circadian.TargetReadingMinutes, circadian.SigmaMinutes)
		// Morning bonus for thoughts — mirrors TS: +0.1 if MORNING_BRIEF
		// Blend Gaussian (0.20 weight) already; add tiny bonus inside circadianFit
		if circadian.Name == "MORNING_BRIEF" {
			// TS adds morningBonus 0.1 in thought scoring; here we blend into circadianFit
			// keep within 0..1
			circadianFit = math.Min(1, circadianFit+0.05)
		}
		completionBonus := 1.0
		// CF boost if quoted article is a CF candidate
		cfScore := 0.0
		if quotedArticleID != nil && *quotedArticleID != "" {
			if v, ok := cfMap[*quotedArticleID]; ok {
				cfScore = v
			}
		}
		// Primary formula: (0.40*Sim + 0.20*Fresh + 0.20*Eng + 0.20*Circadian) * CompletionBonus
		// If CF present, blend 0.15 CF by reducing Sim weight to 0.35 and others 0.15 — mirrors article path
		total := (0.40*sim + 0.20*freshness + 0.20*eng + 0.20*circadianFit) * completionBonus
		if cfScore > 0 {
			total = (0.35*sim + 0.20*freshness + 0.15*eng + 0.15*circadianFit + 0.15*cfScore) * completionBonus
		}
		candidates = append(candidates, scoredPost{
			id: id, authorID: authorID, createdAt: createdAt, content: content,
			likeCount: int(likeCount), repostCount: int(repostCount), replyCount: int(replyCount),
			sim: sim, freshness: freshness, engagement: eng, circadianFit: circadianFit,
			completionBonus: completionBonus, totalScore: total,
		})
	}
	if err := rows.Err(); err != nil {
		return FeedResult{}, err
	}

	// ── Reranking: sort by totalScore desc ───────────────────────────────
	sort.Slice(candidates, func(i, j int) bool { return candidates[i].totalScore > candidates[j].totalScore })

	// ── MMR diversity (Maximal Marginal Relevance) by author — max 2/author ──
	// Mirrors TS applyDiversityFilter(maxPerAuthor=2)
	authorCounts := map[string]int{}
	var diverse []scoredPost
	for _, c := range candidates {
		if authorCounts[c.authorID] >= 2 {
			continue
		}
		diverse = append(diverse, c)
		authorCounts[c.authorID]++
		if len(diverse) >= limit {
			break
		}
	}
	// If diversity filtered below limit, fill from remaining (relax MMR) — keeps feed full
	if len(diverse) < limit {
		for _, c := range candidates {
			found := false
			for _, d := range diverse {
				if d.id == c.id {
					found = true
					break
				}
			}
			if !found {
				diverse = append(diverse, c)
			}
			if len(diverse) >= limit {
				break
			}
		}
	}

	ids := make([]string, 0, len(diverse))
	for _, d := range diverse {
		ids = append(ids, d.id)
	}

	hasMore := len(candidates) > len(diverse) || len(candidates) == overFetch
	result, err := s.finalizeIDs(ctx, ids, userID, limit, offset)
	if err != nil {
		return FeedResult{}, err
	}
	// Override hasMore based on over-fetch detection (TS slices to limit, rest drops)
	result.HasMore = hasMore
	if hasMore {
		result.NextCursor = strconv.Itoa(offset + len(ids))
	}
	return result, nil
}

// UpdateUserVectorOnInteraction mirrors TS updateUserVectorOnInteraction (EMA).
func (s *Service) UpdateUserVectorOnInteraction(ctx context.Context, userID string, targetEmbedding []float32, interactionType InteractionType) error {
	if userID == "" || len(targetEmbedding) == 0 {
		return nil
	}
	alpha, ok := emaWeights[interactionType]
	if !ok {
		alpha = 0.05
	}
	var txt string
	err := s.pool.QueryRow(ctx, `SELECT COALESCE("embedding"::text,'') FROM "User" WHERE id=$1`, toUUID(userID)).Scan(&txt)
	if err != nil {
		return nil
	}
	txt = strings.TrimSpace(txt)
	if txt == "" {
		norm := normalizeVector(targetEmbedding)
		vecStr := "[" + floatsToString(norm) + "]"
		_, err = s.pool.Exec(ctx, `UPDATE "User" SET "embedding"=$1::vector WHERE id=$2`, vecStr, toUUID(userID))
		return err
	}
	curVec, ok := parseEmbeddingTextToFloat32(txt)
	if !ok || len(curVec) != len(targetEmbedding) {
		return nil
	}
	updated := make([]float32, len(curVec))
	for i, c := range curVec {
		updated[i] = float32((1-alpha)*float64(c) + alpha*float64(targetEmbedding[i]))
	}
	updated = normalizeVector(updated)
	vecStr := "[" + floatsToString(updated) + "]"
	_, err = s.pool.Exec(ctx, `UPDATE "User" SET "embedding"=$1::vector WHERE id=$2`, vecStr, toUUID(userID))
	return err
}

// ApplyNegativeVectorFeedback mirrors TS applyNegativeVectorFeedback.
func (s *Service) ApplyNegativeVectorFeedback(ctx context.Context, userID string, targetEmbedding []float32, strength float64) error {
	if strength == 0 {
		strength = 0.12
	}
	if userID == "" || len(targetEmbedding) == 0 {
		return nil
	}
	var txt string
	err := s.pool.QueryRow(ctx, `SELECT COALESCE("embedding"::text,'') FROM "User" WHERE id=$1`, toUUID(userID)).Scan(&txt)
	if err != nil || strings.TrimSpace(txt) == "" {
		return nil
	}
	curVec, ok := parseEmbeddingTextToFloat32(txt)
	if !ok || len(curVec) != len(targetEmbedding) {
		return nil
	}
	pushed := make([]float32, len(curVec))
	for i, c := range curVec {
		pushed[i] = float32(float64(c) + strength*(float64(c)-float64(targetEmbedding[i])))
	}
	pushed = normalizeVector(pushed)
	vecStr := "[" + floatsToString(pushed) + "]"
	_, err = s.pool.Exec(ctx, `UPDATE "User" SET "embedding"=$1::vector WHERE id=$2`, vecStr, toUUID(userID))
	return err
}

func parseEmbeddingTextToFloat32(s string) ([]float32, bool) {
	s = strings.TrimSpace(s)
	s = strings.TrimPrefix(s, "[")
	s = strings.TrimSuffix(s, "]")
	if s == "" {
		return nil, false
	}
	parts := strings.Split(s, ",")
	out := make([]float32, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		f, err := strconv.ParseFloat(p, 32)
		if err != nil {
			return nil, false
		}
		out = append(out, float32(f))
	}
	if len(out) == 0 {
		return nil, false
	}
	return out, true
}

func floatsToString(v []float32) string {
	parts := make([]string, len(v))
	for i, x := range v {
		parts[i] = strconv.FormatFloat(float64(x), 'f', -1, 32)
	}
	return strings.Join(parts, ",")
}

// ─────────────────────────────────────────────────────────────────────────────
// Moteur mixte Articles + Pensées — port Go complet de getPersonalizedFeed
// (feed.ts). Renvoie les ENGINE ITEMS classés (id + type + flag découverte) ;
// la réhydratation finale reste côté client (prisma) pour l'instant.
// ─────────────────────────────────────────────────────────────────────────────

// EngineItem est un item classé par le moteur (léger, prêt à réhydrater).
type EngineItem struct {
	ItemType    string `json:"itemType"`               // ARTICLE | THOUGHT
	ID          string `json:"id"`
	IsDiscovery bool   `json:"isDiscovery,omitempty"`
}

// EngineResult est la réponse paginée du moteur (shape consommé par vector-feed.ts).
type EngineResult struct {
	Items      []EngineItem `json:"items"`
	HasMore    bool         `json:"hasMore"`
	NextCursor string       `json:"nextCursor,omitempty"`
}

// Constantes d'exploration ε-greedy — miroir feed.ts.
const (
	explorationRatioDefault = 0.12
	explorationMinQuality   = 0.8
	explorationCfgKey       = "feed.exploration_ratio"
)

// articleCandidate est un article brut extrait pour le reranking.
type articleCandidate struct {
	id, title, content, authorID, pubID string
	readingTime       int
	completionRate    float64
	sim, freshness    float64
	score             float64
	createdAt         time.Time
}

// thoughtCandidate est une pensée brute extraite pour le reranking.
type thoughtCandidate struct {
	id, content, authorID                string
	likeCount, replyCount, repostCount   int
	sim, freshness, score                float64
	createdAt                            time.Time
}

// mutedOK retourne false si text contient un mot masqué.
func mutedOK(text string, muted []string) bool {
	if len(muted) == 0 {
		return true
	}
	low := strings.ToLower(text)
	for _, w := range muted {
		if strings.Contains(low, w) {
			return false
		}
	}
	return true
}

// PersonalizedEngine porte getPersonalizedFeed (articles + pensées, Two-Tower
// pgvector + circadien + engagement + CF + MMR + interleaving + exploration).
func (s *Service) PersonalizedEngine(ctx context.Context, userID string, limit, offset, userHour int) (EngineResult, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	circadian := getCircadianProfile(userHour, -1)
	// Répartition circadienne articles / pensées.
	targetArticles := int(math.Ceil(float64(limit) * circadian.ArticleRatio))
	targetThoughts := limit - targetArticles
	if targetThoughts < 1 {
		targetThoughts = 1
		targetArticles = limit - 1
	}

	vec, err := s.fetchUserEmbedding(ctx, userID)
	if err != nil {
		log.Printf("[feed] engine fetchUserEmbedding: %v", err)
		vec = nil
	}
	muted := s.fetchMutedWords(ctx, userID)
	cfMap := s.getCoReadCandidates(ctx, userID)

	artOver := clampInt(targetArticles*3, 1, 100)
	thOver := clampInt(targetThoughts*3, 1, 100)

	articles, err := s.fetchEngineArticles(ctx, vec, userID, artOver, offset, muted)
	if err != nil {
		return EngineResult{}, err
	}
	thoughts, err := s.fetchEngineThoughts(ctx, vec, userID, thOver, offset, muted)
	if err != nil {
		return EngineResult{}, err
	}

	engScores, penalties := s.getArticleEngagementScores(ctx, articleIDs(articles))

	// Reranking circadien des articles.
	for i := range articles {
		a := &articles[i]
		readMin := a.readingTime
		if readMin <= 0 {
			readMin = 8
		}
		circFit := computeCircadianFit(float64(readMin), circadian.TargetReadingMinutes, circadian.SigmaMinutes)
		eng := 0.5
		if v, ok := engScores[a.id]; ok {
			eng = v
		}
		sim, fresh := a.sim, a.freshness
		if sim <= 0 {
			sim = 0.5
		}
		if fresh <= 0 {
			fresh = 0.5
		}
		completionBonus := 0.7 + 0.3*a.completionRate
		cf := cfMap[a.id]
		score := (0.35*sim + 0.2*fresh + 0.15*eng + 0.15*circFit + 0.15*cf) * completionBonus
		if penalties[a.id] {
			score *= engNegativePenalty
		}
		a.score = score
	}
	sort.Slice(articles, func(i, j int) bool { return articles[i].score > articles[j].score })

	// Reranking circadien des pensées.
	for i := range thoughts {
		t := &thoughts[i]
		eng := math.Min(1.0, float64(t.likeCount+t.replyCount*2+t.repostCount*2)/30.0)
		sim, fresh := t.sim, t.freshness
		if sim <= 0 {
			sim = 0.5
		}
		if fresh <= 0 {
			fresh = 0.5
		}
		morningBonus := 0.0
		if circadian.Name == "MORNING_BRIEF" {
			morningBonus = 0.1
		}
		t.score = 0.45*sim + 0.25*fresh + 0.2*eng + 0.1*morningBonus
	}
	sort.Slice(thoughts, func(i, j int) bool { return thoughts[i].score > thoughts[j].score })

	// MMR diversité : max 2 par auteur, puis découpe aux cibles circadiennes.
	divA := applyDiversity(articles, 2, func(a articleCandidate) string { return a.authorID })
	divT := applyDiversity(thoughts, 2, func(t thoughtCandidate) string { return t.authorID })
	if len(divA) > targetArticles {
		divA = divA[:targetArticles]
	}
	if len(divT) > targetThoughts {
		divT = divT[:targetThoughts]
	}

	// Interleaving harmonieux selon le profil circadien.
	aItems := make([]EngineItem, 0, len(divA))
	for _, a := range divA {
		aItems = append(aItems, EngineItem{ItemType: "ARTICLE", ID: a.id})
	}
	tItems := make([]EngineItem, 0, len(divT))
	for _, t := range divT {
		tItems = append(tItems, EngineItem{ItemType: "THOUGHT", ID: t.id})
	}
	interleaved := interleaveEngine(aItems, tItems, circadian.Name)
	hasMore := len(interleaved) > limit || len(interleaved) == artOver+thOver
	if len(interleaved) > limit {
		interleaved = interleaved[:limit]
	}

	// 🌍 Exploration ε-greedy (injection hors bulle) pour lecteur authentifié.
	if userID != "" {
		interleaved = s.injectDiscovery(ctx, userID, interleaved, limit)
	}

	return EngineResult{Items: interleaved, HasMore: hasMore, NextCursor: strconv.Itoa(offset + len(interleaved))}, nil
}

func clampInt(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

func articleIDs(as []articleCandidate) []string {
	ids := make([]string, 0, len(as))
	for _, a := range as {
		ids = append(ids, a.id)
	}
	return ids
}

// applyDiversity garde au plus maxPer items par clé (MMR simple, ordre préservé).
func applyDiversity[T any](items []T, maxPer int, key func(T) string) []T {
	counts := map[string]int{}
	out := make([]T, 0, len(items))
	for _, it := range items {
		k := key(it)
		if counts[k] >= maxPer {
			continue
		}
		out = append(out, it)
		counts[k]++
	}
	return out
}

// interleaveEngine mélange articles/pensées selon le mode circadien.
func interleaveEngine(a, t []EngineItem, circadianName string) []EngineItem {
	var out []EngineItem
	aI, tI := 0, 0
	if circadianName == "MORNING_BRIEF" {
		// Matin : 1 pensée, 1 article court, 1 pensée...
		for aI < len(a) || tI < len(t) {
			if tI < len(t) {
				out = append(out, t[tI])
				tI++
			}
			if aI < len(a) {
				out = append(out, a[aI])
				aI++
			}
		}
		return out
	}
	// Jour / soir : 2 articles de fond, 1 pensée.
	for aI < len(a) || tI < len(t) {
		if aI < len(a) {
			out = append(out, a[aI])
			aI++
		}
		if aI < len(a) {
			out = append(out, a[aI])
			aI++
		}
		if tI < len(t) {
			out = append(out, t[tI])
			tI++
		}
	}
	return out
}

// fetchEngineArticles extrait les articles candidats (ANN pgvector ou cold-start).
func (s *Service) fetchEngineArticles(ctx context.Context, vec *pgvector.Vector, userID string, limit, offset int, muted []string) ([]articleCandidate, error) {
	var rows pgx.Rows
	var err error
	if vec != nil {
		args := []any{*vec}
		q := `
		SELECT a.id, a.title, a.content, a."readingTime", a."completionRate", a."authorId", a."publicationId", a."createdAt",
		       (1 - (a."embedding" <=> $1::vector))::float8 AS sim,
		       EXP(-EXTRACT(EPOCH FROM (NOW() - a."createdAt"))/172800)::float8 AS fresh
		FROM "Article" a JOIN "User" u ON u.id::text = a."authorId"::text
		WHERE a.published = true AND a."embedding" IS NOT NULL
		  AND u."isShadowbanned" = false AND u."isSuspended" = false`
		ai := 2
		if userID != "" {
			q += fmt.Sprintf(` AND NOT EXISTS (SELECT 1 FROM "BlockedUser" bu WHERE bu."readerId"=$%d AND bu."creatorId"=a."authorId")`, ai)
			args = append(args, toUUID(userID))
			ai++
			q += fmt.Sprintf(` AND NOT EXISTS (SELECT 1 FROM "ContentFeedback" cf WHERE cf."userId"=$%d AND cf."articleId"=a.id AND cf.type='SHOW_LESS')`, ai)
			args = append(args, toUUID(userID))
			ai++
		}
		q += fmt.Sprintf(` ORDER BY (0.50*(1 - (a."embedding" <=> $1::vector)) + 0.25*EXP(-EXTRACT(EPOCH FROM (NOW() - a."createdAt"))/172800) + 0.25*(0.70 + 0.30*a."completionRate")) DESC LIMIT $%d OFFSET $%d`, ai, ai+1)
		args = append(args, limit, offset)
		rows, err = s.pool.Query(ctx, q, args...)
	} else {
		q := `
		SELECT a.id, a.title, a.content, a."readingTime", a."completionRate", a."authorId", a."publicationId", a."createdAt",
		       0.5::float8 AS sim,
		       EXP(-EXTRACT(EPOCH FROM (NOW() - a."createdAt"))/172800)::float8 AS fresh
		FROM "Article" a JOIN "User" u ON u.id::text = a."authorId"::text
		WHERE a.published = true AND u."isShadowbanned" = false AND u."isSuspended" = false
		ORDER BY (0.50*EXP(-EXTRACT(EPOCH FROM (NOW() - a."createdAt"))/172800) + 0.50*(0.70 + 0.30*a."completionRate")) DESC
		LIMIT $1 OFFSET $2`
		rows, err = s.pool.Query(ctx, q, limit, offset)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []articleCandidate{}
	for rows.Next() {
		var c articleCandidate
		var pubID *string
		if err := rows.Scan(&c.id, &c.title, &c.content, &c.readingTime, &c.completionRate, &c.authorID, &pubID, &c.createdAt, &c.sim, &c.freshness); err != nil {
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
func (s *Service) fetchEngineThoughts(ctx context.Context, vec *pgvector.Vector, userID string, limit, offset int, muted []string) ([]thoughtCandidate, error) {
	var rows pgx.Rows
	var err error
	if vec != nil {
		args := []any{*vec}
		q := `
		SELECT p.id, p.content, p."authorId", p."createdAt", p."likeCount", p."replyCount", p."repostCount",
		       (1 - (p."embedding" <=> $1::vector))::float8 AS sim,
		       EXP(-EXTRACT(EPOCH FROM (NOW() - p."createdAt"))/86400)::float8 AS fresh
		FROM "Post" p JOIN "User" u ON u.id = p."authorId"
		WHERE p."parentId" IS NULL AND p."repostId" IS NULL AND p."deletedAt" IS NULL
		  AND p."isDraft" = false AND p."isHiddenByAuthor" = false AND p."embedding" IS NOT NULL
		  AND u."isShadowbanned" = false AND u."isSuspended" = false`
		ai := 2
		if userID != "" {
			q += fmt.Sprintf(` AND NOT EXISTS (SELECT 1 FROM "BlockedUser" bu WHERE bu."readerId"=$%d AND bu."creatorId"=p."authorId")`, ai)
			args = append(args, toUUID(userID))
			ai++
			q += fmt.Sprintf(` AND NOT EXISTS (SELECT 1 FROM "ContentFeedback" cf WHERE cf."userId"=$%d AND cf."thoughtId"=p.id AND cf.type='SHOW_LESS')`, ai)
			args = append(args, toUUID(userID))
			ai++
		}
		q += fmt.Sprintf(` ORDER BY (0.50*(1 - (p."embedding" <=> $1::vector)) + 0.25*EXP(-EXTRACT(EPOCH FROM (NOW() - p."createdAt"))/86400) + 0.25*LEAST(1.0,(p."likeCount" + p."replyCount"*2 + p."repostCount"*2)/30.0)) DESC LIMIT $%d OFFSET $%d`, ai, ai+1)
		args = append(args, limit, offset)
		rows, err = s.pool.Query(ctx, q, args...)
	} else {
		q := `
		SELECT p.id, p.content, p."authorId", p."createdAt", p."likeCount", p."replyCount", p."repostCount",
		       0.5::float8 AS sim,
		       EXP(-EXTRACT(EPOCH FROM (NOW() - p."createdAt"))/86400)::float8 AS fresh
		FROM "Post" p JOIN "User" u ON u.id = p."authorId"
		WHERE p."parentId" IS NULL AND p."repostId" IS NULL AND p."deletedAt" IS NULL
		  AND p."isDraft" = false AND p."isHiddenByAuthor" = false
		  AND u."isShadowbanned" = false AND u."isSuspended" = false
		ORDER BY (0.50*EXP(-EXTRACT(EPOCH FROM (NOW() - p."createdAt"))/86400) + 0.50*LEAST(1.0,(p."likeCount" + p."replyCount"*2 + p."repostCount"*2)/30.0)) DESC
		LIMIT $1 OFFSET $2`
		rows, err = s.pool.Query(ctx, q, limit, offset)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []thoughtCandidate{}
	for rows.Next() {
		var c thoughtCandidate
		if err := rows.Scan(&c.id, &c.content, &c.authorID, &c.createdAt, &c.likeCount, &c.replyCount, &c.repostCount, &c.sim, &c.freshness); err != nil {
			continue
		}
		if !mutedOK(c.content, muted) {
			continue
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// readConfig lit une valeur SystemConfig (best-effort).
func (s *Service) readConfig(ctx context.Context, key string) string {
	var v string
	if err := s.pool.QueryRow(ctx, `SELECT value FROM "SystemConfig" WHERE key=$1`, key).Scan(&v); err != nil {
		return ""
	}
	return v
}

// injectDiscovery implémente l'exploration ε-greedy : injecte ~ratio d'articles
// de qualité hors des publications suivies (positions fixes [3,8]).
func (s *Service) injectDiscovery(ctx context.Context, userID string, items []EngineItem, limit int) []EngineItem {
	ratio := explorationRatioDefault
	if v, err := strconv.ParseFloat(s.readConfig(ctx, explorationCfgKey), 64); err == nil && v >= 0 && v <= 0.5 {
		ratio = v
	}
	slots := int(math.Round(float64(limit) * ratio))
	if slots <= 0 {
		return items
	}

	// Bulle = publications suivies. Si l'utilisateur n'en suit aucune, rien à casser.
	var followed []string
	rows, err := s.pool.Query(ctx, `SELECT "publicationId" FROM "Follows" WHERE "readerId"=$1 AND "publicationId" IS NOT NULL`, toUUID(userID))
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
		  AND "publicationId" <> ALL($2::text[])
		  AND "authorId"::text <> $3
		ORDER BY "createdAt" DESC LIMIT $4`, explorationMinQuality, followed, userID, slots)
	if err != nil {
		return items
	}
	defer drows.Close()
	positions := []int{3, 8}
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
