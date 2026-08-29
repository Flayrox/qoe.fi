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
// Score final (articles) = (0.40*Sim + 0.15*Fresh + 0.15*Engagement +
//   0.15*Circadian + 0.15*CF) * CompletionBonus — sim dominante.
// Score final (pensées) = 0.40*Sim + 0.22*Fresh + 0.18*Engagement +
//   0.10*MorningBonus + 0.10*CF.
// Le POOL de candidats est construit en sim-dominant (65% sim / 15% fresh /
// 20% complétion) : un pool à 50/25/25 laissait la fraîcheur et l'éditorial
// noyer le contenu du profil avant même le rerank (cf. pool_test.go).
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

// Engagement / CF constants — mirrors feed.ts.
const (
	engReadWeight       = 0.5
	engSocialWeight     = 0.3
	engConfidenceWeight = 0.2
	engMinSessions      = 5
	engNegativeThresh   = 0.25
	engNegativePenalty  = 0.85

	cfMinMyReads     = 3
	cfTopNeighbors   = 10
	cfStatusWeights  = `CASE status WHEN 'READ_COMPLETE' THEN 1.0 WHEN 'READ_PARTIAL' THEN 0.6 WHEN 'SKIM' THEN 0.3 ELSE 0.1 END`
	showMoreBoostMul = 0.12
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
func (s *Service) coReadNeighbors(ctx context.Context, userID string) (map[string]float64, bool) {
	empty := map[string]float64{}
	if userID == "" {
		return empty, false
	}
	// Guard: need >=3 reads else cold-start noise
	var myCount int
	err := s.pool.QueryRow(ctx, `SELECT COUNT(*)::int FROM "ReadingSession" WHERE "userId" = $1`, toUUID(userID)).Scan(&myCount)
	if err != nil || myCount < cfMinMyReads {
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
	`, cfStatusWeights, cfStatusWeights, cfTopNeighbors), toUUID(userID))
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

// getCoReadCandidates — CF collaboratif sur ARTICLES : des articles lus par
// mes voisins de lecture (que je n'ai pas encore lus) sont boostés. Miroir TS.
func (s *Service) getCoReadCandidates(ctx context.Context, userID string) map[string]float64 {
	empty := map[string]float64{}
	neighbors, ok := s.coReadNeighbors(ctx, userID)
	if !ok {
		return empty
	}
	// Reconstruit l'affinité normalisée en paramètre SQL pour la jointure.
	// Les ids sont des UUID (issus de la base) — cast ::uuid pour joindre sur
	// ReadingSession.userId sans erreur de type.
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

// getCoReadThoughtCandidates — CF collaboratif sur PENSÉES : les pensées
// likées par mes voisins de lecture (que je n'ai ni likées ni postées) sont
// boostées. Complète le CF articles pour le versant social du feed.
func (s *Service) getCoReadThoughtCandidates(ctx context.Context, userID string) map[string]float64 {
	empty := map[string]float64{}
	neighbors, ok := s.coReadNeighbors(ctx, userID)
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
	cfThoughtMap := s.getCoReadThoughtCandidates(ctx, userID)

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
	artIDs, thIDs := articleIDs(articles), thoughtIDs(thoughts)
	// Feedback implicite négatif : items vus ≥3× sans engagement (FeedImpression
	// collecté mais jamais exploité — signal « skip » type Netflix/TikTok).
	impPenalty := s.getImpressionPenalties(ctx, userID, artIDs, thIDs)
	// Feedback positif explicite : « Voir plus » → items proches du contenu
	// félicité boostés (miroir de impPenalty ; sûr même sans SHOW_MORE).
	showMoreBoost := s.getShowMoreBoost(ctx, userID, artIDs, thIDs)

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
		// Sim dominante (0.40, comme le rerank des pensées) : la fraîcheur à
		// 0.20 laissait les articles « du jour » passer devant le contenu du
		// profil (mesuré : article foot frais en tête du feed gaming).
		score := (0.40*sim + 0.15*fresh + 0.15*eng + 0.15*circFit + 0.15*cf) * completionBonus
		if penalties[a.id] {
			score *= engNegativePenalty
		}
		if impPenalty[a.id] {
			score *= 0.6 // déjà vu sans engagement → re-exposition dévalorisée
		}
		if b, ok := showMoreBoost[a.id]; ok && b > 0 {
			score *= 1 + showMoreBoostMul*b // proche d'un contenu « Voir plus » → ×(1+0.12·sim)
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
		cfT := cfThoughtMap[t.id]
		t.score = 0.40*sim + 0.22*fresh + 0.18*eng + 0.10*morningBonus + 0.10*cfT
		if impPenalty[t.id] {
			t.score *= 0.6
		}
		if b, ok := showMoreBoost[t.id]; ok && b > 0 {
			t.score *= 1 + showMoreBoostMul*b // proche d'un contenu « Voir plus » → boosté
		}
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

func thoughtIDs(ts []thoughtCandidate) []string {
	ids := make([]string, 0, len(ts))
	for _, t := range ts {
		ids = append(ids, t.id)
	}
	return ids
}

// getImpressionPenalties renvoie les ids d'items que l'utilisateur a déjà vus
// ≥3 fois dans le feed (30j) sans jamais s'y engager. C'est le signal « skip »
// implicite des grandes plateformes : re-exposer un contenu déjà ignoré
// plusieurs fois dégrade l'expérience, donc on le dévalorise au reranking.
// Les FeedImpression étaient collectées mais jamais exploitées.
func (s *Service) getImpressionPenalties(ctx context.Context, userID string, artIDs, thIDs []string) map[string]bool {
	out := map[string]bool{}
	if userID == "" || (len(artIDs) == 0 && len(thIDs) == 0) {
		return out
	}
	rows, err := s.pool.Query(ctx, `
		SELECT "itemType", "itemId", COUNT(*)::int
		FROM "FeedImpression"
		WHERE "userId" = $1 AND "createdAt" > now() - interval '30 days'
		  AND ("itemId" = ANY($2::text[]) OR "itemId" = ANY($3::text[]))
		GROUP BY "itemType", "itemId"`, toUUID(userID), artIDs, thIDs)
	if err != nil {
		log.Printf("[feed] impression query failed: %v", err)
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var typ, id string
		var n int
		if err := rows.Scan(&typ, &id, &n); err == nil && n >= 3 {
			out[id] = true
		}
	}
	return out
}

// getShowMoreBoost renvoie, pour chaque item candidat, la similarité cosinus
// maximale à l'un des contenus que l'utilisateur a explicitement félicités
// (ContentFeedback SHOW_MORE). Miroir positif de la pénalité d'impressions :
// si « Voir moins → items vus-ignorés dévalorisés (×0.6) », alors « Voir plus →
// items proches du contenu félicité boostés (×(1+α·sim)) ». Seuls les SHOW_MORE
// les plus récents (30j) comptent, et on ignore les items déjà vus-ignorés
// (cohérence : un contenu « voir moins » ne ressort pas via un « voir plus »).
func (s *Service) getShowMoreBoost(ctx context.Context, userID string, artIDs, thIDs []string) map[string]float64 {
	out := map[string]float64{}
	if userID == "" || (len(artIDs) == 0 && len(thIDs) == 0) {
		return out
	}
	// Ancre articles : embeddings des articles SHOW_MORE (30j).
	if len(artIDs) > 0 {
		rows, err := s.pool.Query(ctx, `
			WITH anchors AS (
				SELECT cf."articleId" AS id, a.embedding
				FROM "ContentFeedback" cf JOIN "Article" a ON a.id = cf."articleId"
				WHERE cf."userId" = $1 AND cf.type = 'SHOW_MORE' AND cf."createdAt" > now() - interval '30 days'
				  AND a.embedding IS NOT NULL
			)
			SELECT a.id, MAX(1 - (a.embedding <=> an.embedding))::float8 AS sim
			FROM "Article" a JOIN anchors an ON true
			WHERE a.id = ANY($2::text[]) AND a.embedding IS NOT NULL
			  AND NOT EXISTS (
			      SELECT 1 FROM "ContentFeedback" cf
			      WHERE cf."userId" = $1 AND cf."articleId" = a.id AND cf.type = 'SHOW_LESS')
			GROUP BY a.id`, toUUID(userID), artIDs)
		if err == nil {
			readSimMap(rows, out)
		}
	}
	// Ancre pensées : embeddings des pensées SHOW_MORE (30j).
	if len(thIDs) > 0 {
		rows, err := s.pool.Query(ctx, `
			WITH anchors AS (
				SELECT cf."thoughtId" AS id, p.embedding
				FROM "ContentFeedback" cf JOIN "Post" p ON p.id = cf."thoughtId"
				WHERE cf."userId" = $1 AND cf.type = 'SHOW_MORE' AND cf."createdAt" > now() - interval '30 days'
				  AND p.embedding IS NOT NULL
			)
			SELECT p.id, MAX(1 - (p.embedding <=> an.embedding))::float8 AS sim
			FROM "Post" p JOIN anchors an ON true
			WHERE p.id = ANY($2::text[]) AND p.embedding IS NOT NULL
			  AND NOT EXISTS (
			      SELECT 1 FROM "ContentFeedback" cf
			      WHERE cf."userId" = $1 AND cf."thoughtId" = p.id AND cf.type = 'SHOW_LESS')
			GROUP BY p.id`, toUUID(userID), thIDs)
		if err == nil {
			readSimMap(rows, out)
		}
	}
	return out
}

// readSimMap lit des lignes (id, sim::float8) dans une map, en plafonnant à 1.
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
		// Pool sim-dominant (65% sim / 15% fresh / 20% complétion) : le rerank
		// final (0.35 sim) ne peut pas récupérer un pool déjà pollué par la
		// fraîcheur — un tri à 50/25/25 laissait les articles « du jour » et
		// l'éditorial noyer les contenus du profil (mesuré : pool gaming 18%
		// au lieu de 92% en tri par sim pure).
		q += fmt.Sprintf(` ORDER BY (0.65*(1 - (a."embedding" <=> $1::vector)) + 0.15*EXP(-EXTRACT(EPOCH FROM (NOW() - a."createdAt"))/172800) + 0.20*(0.70 + 0.30*a."completionRate")) DESC LIMIT $%d OFFSET $%d`, ai, ai+1)
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
		q += fmt.Sprintf(` ORDER BY (0.65*(1 - (p."embedding" <=> $1::vector)) + 0.15*EXP(-EXTRACT(EPOCH FROM (NOW() - p."createdAt"))/86400) + 0.20*LEAST(1.0,(p."likeCount" + p."replyCount"*2 + p."repostCount"*2)/30.0)) DESC LIMIT $%d OFFSET $%d`, ai, ai+1)
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
