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

	// ⚡ Trending — vélocité d'engagement des dernières heures. C'est le signal
	// « ce qui monte vite » des plateformes (TikTok/Reddit) : un contenu qui
	// explose sur 48h ne doit pas attendre que son compteur cumulatif rattrape
	// les vieux contenus populaires.
	//
	// ⚠️ Leçon mesurée (recsys-eval) : en composante séparée du rerank, la
	// vélocité est un bruit global (identique pour tous les users) qui, ajouté
	// à fraîcheur+engagement, noyait la personalisation (foot 62 % → 31 %,
	// gaming 48 % → 30 %). On la fond donc DANS l'engagement :
	// eng_effectif = max(engagement cumulatif, vélocité) — un post « chaud »
	// monte sans jamais ajouter de poids global au rerank.
	velWindowHours   = 48
	velPostTarget    = 8  // ≥ 8 likes+réponses+reposts récents / 48h → vélocité max (pensées)
	velArticleTarget = 20 // ≥ 20 sessions de lecture pondérées / 48h → vélocité max (articles)

	// 🔀 MMR — λ et seuil de quasi-duplicat. Défauts calibrés par recsys-eval,
	// surchargeables via SystemConfig (voir engineConfig). Voir mmr.go.
	mmrLambdaDefault       = 0.7
	mmrDupThresholdDefault = 0.92

	// 🎛️ Poids du moteur exposés dans SystemConfig (pilotage sans recompiler).
	// Défauts = les valeurs calibrées par recsys-eval (pool sim-dominant 65/15/20,
	// rerank sim-dominante 0.40/0.15/0.15). Chaque clé est bornée à [0,1] ; une
	// valeur invalide retombe sur le défaut.
	cfgPoolSim        = "feed.pool_sim"
	cfgPoolFresh      = "feed.pool_fresh"
	cfgPoolCompletion = "feed.pool_completion"
	cfgRerankSim      = "feed.rerank_sim"
	cfgRerankFresh    = "feed.rerank_fresh"
	cfgRerankEng      = "feed.rerank_engagement"
	cfgMMRLambda      = "feed.mmr_lambda"
	cfgMMRDupThreshold = "feed.mmr_dup_threshold"

	poolSimDefault, poolFreshDefault, poolCompletionDefault = 0.65, 0.15, 0.20
	rerankSimDefault, rerankFreshDefault, rerankEngDefault  = 0.40, 0.15, 0.15

	// 🚫 Pénalité de milieu : dès milieuPenaltyThreshold signalements négatifs
	// cumulés sur un tag (SHOW_LESS sur pensées/articles + sessions en BOUNCE),
	// les contenus de ce tag sont DÉVALUÉS dans le pool et le rerank de cet
	// utilisateur (sim × milieuPenaltyFactor) — jamais exclus, pour que le
	// feed reste toujours non vide (même garde-fou que le « quelque chose
	// s'affiche toujours » du filtre de langue de Bluesky).
	milieuPenaltyThreshold = 3
	milieuPenaltyFactor    = 0.5
)

// engineConfig regroupe les poids du moteur (pool, rerank, MMR) pilotables
// via SystemConfig sans recompiler. Les défauts sont les valeurs calibrées
// par recsys-eval ; une clé absente ou invalide laisse le défaut.
type engineConfig struct {
	poolSim, poolFresh, poolCompletion float64
	rerankSim, rerankFresh, rerankEng  float64
	mmrLambda, mmrDupThreshold         float64
}

// loadEngineConfig lit toutes les clés du moteur en UNE requête (les défauts
// sont conservés pour les clés absentes). Une erreur de lecture → défauts :
// le moteur ne se bloque jamais à cause de la config.
func (s *Service) loadEngineConfig(ctx context.Context) engineConfig {
	cfg := engineConfig{
		poolSim:        poolSimDefault,
		poolFresh:      poolFreshDefault,
		poolCompletion: poolCompletionDefault,
		rerankSim:      rerankSimDefault,
		rerankFresh:    rerankFreshDefault,
		rerankEng:      rerankEngDefault,
		mmrLambda:      mmrLambdaDefault,
		mmrDupThreshold: mmrDupThresholdDefault,
	}
	rows, err := s.pool.Query(ctx, `SELECT key, value FROM "SystemConfig" WHERE key = ANY($1::text[])`,
		[]string{cfgPoolSim, cfgPoolFresh, cfgPoolCompletion, cfgRerankSim, cfgRerankFresh, cfgRerankEng, cfgMMRLambda, cfgMMRDupThreshold})
	if err != nil {
		return cfg
	}
	defer rows.Close()
	for rows.Next() {
		var k, v string
		if rows.Scan(&k, &v) != nil {
			continue
		}
		switch k {
		case cfgPoolSim:
			cfg.poolSim = parseCfgFloat(v, cfg.poolSim)
		case cfgPoolFresh:
			cfg.poolFresh = parseCfgFloat(v, cfg.poolFresh)
		case cfgPoolCompletion:
			cfg.poolCompletion = parseCfgFloat(v, cfg.poolCompletion)
		case cfgRerankSim:
			cfg.rerankSim = parseCfgFloat(v, cfg.rerankSim)
		case cfgRerankFresh:
			cfg.rerankFresh = parseCfgFloat(v, cfg.rerankFresh)
		case cfgRerankEng:
			cfg.rerankEng = parseCfgFloat(v, cfg.rerankEng)
		case cfgMMRLambda:
			cfg.mmrLambda = parseCfgFloat(v, cfg.mmrLambda)
		case cfgMMRDupThreshold:
			cfg.mmrDupThreshold = parseCfgFloat(v, cfg.mmrDupThreshold)
		}
	}
	return cfg
}

// parseCfgFloat parse une valeur SystemConfig en float borné [0,1]. Toute
// valeur invalide (non numérique, hors bornes, vide) retombe sur le défaut —
// fonction pure, testable.
func parseCfgFloat(v string, def float64) float64 {
	f, err := strconv.ParseFloat(v, 64)
	if err != nil || f < 0 || f > 1 {
		return def
	}
	return f
}

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
	explorationRatioDefault    = 0.12
	explorationMinQuality      = 0.8
	explorationCfgKey          = "feed.exploration_ratio"
	explorationCfgKeyCold      = "feed.exploration_ratio_cold" // taux pour les profils froids
	explorationCfgKeyMinSignals = "feed.exploration_min_signals" // nb de signaux (likes+lectures) pour être « mature »

	// 🎯 Exploration adaptative : un profil froid (peu de signaux) explore ~2×
	// plus qu'un profil mature — il n'a pas encore de vecteur fiable pour
	// personnaliser, donc on lui montre du contenu hors bulle (anti-cold-start,
	// comportement bandit type TikTok). Un profil mature explore moins pour ne
	// pas diluer sa bulle.
	explorationRatioColdDefault   = 0.22
	explorationMinSignalsDefault  = 10
)

// articleCandidate est un article brut extrait pour le reranking. tags sert à
// la pénalité de milieu (item portant un tag rejeté → dévalué).
type articleCandidate struct {
	id, title, content, authorID, pubID string
	tags              []string
	readingTime       int
	completionRate    float64
	sim, freshness    float64
	score             float64
	createdAt         time.Time
}

// thoughtCandidate est une pensée brute extraite pour le reranking. tags sert
// à la pénalité de milieu.
type thoughtCandidate struct {
	id, content, authorID                string
	tags                                 []string
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

	// 🎛️ Poids du moteur (SystemConfig) + 🚫 tags rejetés par l'utilisateur :
	// chargés une fois, partagés entre le pool et le rerank.
	cfg := s.loadEngineConfig(ctx)
	penalized := s.penalizedTags(ctx, userID)

	artOver := clampInt(targetArticles*3, 1, 100)
	thOver := clampInt(targetThoughts*3, 1, 100)

	articles, err := s.fetchEngineArticles(ctx, vec, userID, artOver, offset, muted, cfg, penalized)
	if err != nil {
		return EngineResult{}, err
	}
	thoughts, err := s.fetchEngineThoughts(ctx, vec, userID, thOver, offset, muted, cfg, penalized)
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
	// ⚡ Trending : vélocité d'engagement des 48 dernières heures. Complément de
	// l'engagement cumulatif : un post qui monte vite ne doit pas attendre que
	// son compteur (likeCount…) rattrape les vieux contenus populaires.
	artVel, thVel := s.getVelocityScores(ctx, artIDs, thIDs)

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
		// ⚡ Trending : l'engagement effectif = max(cumulatif, vélocité 48h). Un
		// article « chaud » (sessions récentes) est traité comme populaire sans
		// ajouter de composante globale au rerank (cf. constante velWindowHours).
		if v, ok := artVel[a.id]; ok && v > eng {
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
		// Sim dominante (0.40 par défaut, pilotable via feed.rerank_sim) : la
		// fraîcheur à 0.20 laissait les articles « du jour » passer devant le
		// contenu du profil (mesuré : article foot frais en tête du feed gaming).
		score := (cfg.rerankSim*sim + cfg.rerankFresh*fresh + cfg.rerankEng*eng + 0.15*circFit + 0.15*cf) * completionBonus
		if penalties[a.id] {
			score *= engNegativePenalty
		}
		// 🚫 Pénalité de milieu : l'item porte un tag rejeté (≥3 signalements
		// négatifs de l'utilisateur) → dévalué, jamais exclu (le feed reste
		// non vide). Miroir de la dévaluation du pool.
		if hasPenalizedTag(a.tags, penalized) {
			score *= milieuPenaltyFactor
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
		// ⚡ Trending : même fusion que pour les articles — l'engagement effectif
		// = max(cumulatif, vélocité 48h) : une pensée « chaude » monte sans
		// ajouter de composante globale au rerank.
		if v, ok := thVel[t.id]; ok && v > eng {
			eng = v
		}
		// Mêmes poids configurables que les articles (feed.rerank_sim/fresh/eng) :
		// la similarité reste dominante, fraîcheur/engagement à la marge.
		t.score = cfg.rerankSim*sim + cfg.rerankFresh*fresh + cfg.rerankEng*eng + 0.10*morningBonus + 0.10*cfT
		if impPenalty[t.id] {
			t.score *= 0.6
		}
		// 🚫 Pénalité de milieu (miroir du pool) : jamais d'exclusion.
		if hasPenalizedTag(t.tags, penalized) {
			t.score *= milieuPenaltyFactor
		}
		if b, ok := showMoreBoost[t.id]; ok && b > 0 {
			t.score *= 1 + showMoreBoostMul*b // proche d'un contenu « Voir plus » → boosté
		}
	}
	sort.Slice(thoughts, func(i, j int) bool { return thoughts[i].score > thoughts[j].score })

	// 🔀 MMR sémantique (voir mmr.go) : on remplace l'ancien plafond par-auteur
	// par une pénalité de redondance réelle — un candidat proche (cosinus
	// item-item) d'un item déjà retenu dans la page perd des points, même s'il
	// est écrit par un autre auteur. Les embeddings des candidats sont chargés
	// en une requête par type ; en cas d'échec (map vide), mmrSelect retombe
	// sur l'ordre de pertinence pur (repli sûr).
	artEmb := s.fetchCandidateEmbeddings(ctx, "Article", artIDs)
	thEmb := s.fetchCandidateEmbeddings(ctx, "Post", thIDs)
	// λ et seuil de quasi-duplicat pilotables (feed.mmr_lambda,
	// feed.mmr_dup_threshold) sans recompiler.
	divA := pickArticles(articles, mmrSelect(articleIDs(articles), articleScores(articles), artEmb, targetArticles, cfg.mmrLambda, cfg.mmrDupThreshold))
	divT := pickThoughts(thoughts, mmrSelect(thoughtIDs(thoughts), thoughtScores(thoughts), thEmb, targetThoughts, cfg.mmrLambda, cfg.mmrDupThreshold))

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
// articleScores extrait la map id → score de pertinence après rerank (pour MMR).
func articleScores(as []articleCandidate) map[string]float64 {
	m := make(map[string]float64, len(as))
	for _, a := range as {
		m[a.id] = a.score
	}
	return m
}

// thoughtScores extrait la map id → score de pertinence après rerank (pour MMR).
func thoughtScores(ts []thoughtCandidate) map[string]float64 {
	m := make(map[string]float64, len(ts))
	for _, t := range ts {
		m[t.id] = t.score
	}
	return m
}

// pickArticles réordonne les candidats dans l'ordre de sélection du MMR.
func pickArticles(as []articleCandidate, ids []string) []articleCandidate {
	byID := make(map[string]articleCandidate, len(as))
	for _, a := range as {
		byID[a.id] = a
	}
	out := make([]articleCandidate, 0, len(ids))
	for _, id := range ids {
		if a, ok := byID[id]; ok {
			out = append(out, a)
		}
	}
	return out
}

// pickThoughts réordonne les candidats dans l'ordre de sélection du MMR.
func pickThoughts(ts []thoughtCandidate, ids []string) []thoughtCandidate {
	byID := make(map[string]thoughtCandidate, len(ts))
	for _, t := range ts {
		byID[t.id] = t
	}
	out := make([]thoughtCandidate, 0, len(ids))
	for _, id := range ids {
		if t, ok := byID[id]; ok {
			out = append(out, t)
		}
	}
	return out
}

// getVelocityScores calcule la vélocité d'engagement des dernières
// velWindowHours (48h) pour les candidats — le signal « trending » type
// TikTok/Reddit : un contenu qui monte vite ne doit pas attendre que son
// compteur cumulatif (likeCount, sessions totales…) rattrape les vieux
// contenus populaires. Complète l'engagement cumulatif dans le rerank.
//
// Pensées : likes récents + réponses/reposts récents (posts enfants créés
// dans la fenêtre). Articles : sessions de lecture récentes pondérées par le
// statut (mêmes poids que l'engagement cumulatif).
//
// Retourne deux maps id → score ∈ [0, 1] (0 = aucun signal récent, 1 = post
// « chaud »). Une erreur de lecture → map vide : le feed continue, la
// vélocité est un bonus, jamais un blocage.
func (s *Service) getVelocityScores(ctx context.Context, artIDs, thIDs []string) (map[string]float64, map[string]float64) {
	artVel := map[string]float64{}
	thVel := map[string]float64{}

	// Pensées : likes + réponses/reposts dans la fenêtre.
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
			WHERE p.id = ANY($1::text[])`, thIDs, velWindowHours)
		if err == nil {
			for rows.Next() {
				var id string
				var recent float64
				if rows.Scan(&id, &recent) == nil {
					thVel[id] = math.Min(1.0, recent/velPostTarget)
				}
			}
			rows.Close()
		}
	}

	// Articles : sessions de lecture récentes, pondérées par le statut.
	if len(artIDs) > 0 {
		rows, err := s.pool.Query(ctx, `
			SELECT rs."articleId",
			       sum(CASE rs.status WHEN 'READ_COMPLETE' THEN 1.0
			                          WHEN 'READ_PARTIAL' THEN 0.6
			                          WHEN 'SKIM' THEN 0.3 ELSE 0.1 END)::float8 AS recent
			FROM "ReadingSession" rs
			WHERE rs."articleId" = ANY($1::text[])
			  AND rs."createdAt" > now() - make_interval(hours => $2)
			GROUP BY rs."articleId"`, artIDs, velWindowHours)
		if err == nil {
			for rows.Next() {
				var id string
				var recent float64
				if rows.Scan(&id, &recent) == nil {
					artVel[id] = math.Min(1.0, recent/velArticleTarget)
				}
			}
			rows.Close()
		}
	}
	return artVel, thVel
}

// fetchCandidateEmbeddings charge les embeddings des candidats (table
// "Article" ou "Post") pour la sélection MMR. Une erreur de lecture → map
// vide : mmrSelect retombe alors sur l'ordre de pertinence pur (repli sûr,
// le feed ne se bloque jamais à cause de la diversité).
func (s *Service) fetchCandidateEmbeddings(ctx context.Context, table string, ids []string) map[string][]float32 {
	out := map[string][]float32{}
	if len(ids) == 0 {
		return out
	}
	// table est une constante du package ("Article"/"Post") — jamais de saisie
	// utilisateur : l'interpolation %q est sûre ici.
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

// pickExplorationRatio choisit le taux d'exploration selon la maturité du
// profil : un utilisateur froid (signaux < minSignals) explore davantage car
// son vecteur ne permet pas encore de personnaliser finement ; un profil
// mature explore moins pour ne pas diluer sa bulle. Fonction pure (testable).
func pickExplorationRatio(signals int, coldRatio, warmRatio float64, minSignals int) float64 {
	if signals < minSignals {
		return coldRatio
	}
	return warmRatio
}

// penalizedTags retourne les tags « rejetés » par l'utilisateur : un tag est
// pénalisé dès milieuPenaltyThreshold (3) signalements négatifs cumulés —
// SHOW_LESS sur pensées ou articles + sessions de lecture en BOUNCE sur les
// articles portant ce tag. Inspiré du « non intéressé » de TikTok : 3
// signalements = tout le milieu est dévalué pour cet utilisateur (dans le
// pool ET le rerank), sans jamais être exclu — le feed reste non vide.
func (s *Service) penalizedTags(ctx context.Context, userID string) map[string]bool {
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
		HAVING count(*) >= $2`, toUUID(userID), milieuPenaltyThreshold)
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

// hasPenalizedTag indique si un candidat porte au moins un tag rejeté.
func hasPenalizedTag(tags []string, penalized map[string]bool) bool {
	if len(penalized) == 0 {
		return false
	}
	for _, t := range tags {
		if penalized[t] {
			return true
		}
	}
	return false
}

// penalizedArray construit le fragment SQL de dévaluation du pool et ses
// arguments : quand la map des tags rejetés est vide, le fragment est vide
// (aucun coût de requête). Sinon, le score de pool est multiplié par
// milieuPenaltyFactor si l'item porte un des tags (opérateur && de
// chevauchement d'arrays). tagCol est le nom de la colonne de tags de la
// table interrogée ("semanticTags" pour Article, tags pour Post).
func penalizedArray(penalized map[string]bool, ai int, tagCol string) ([]any, string) {
	if len(penalized) == 0 {
		return nil, ""
	}
	tags := make([]string, 0, len(penalized))
	for t := range penalized {
		tags = append(tags, t)
	}
	return []any{tags}, fmt.Sprintf(` * CASE WHEN %s && $%d::text[] THEN %.2f ELSE 1 END`, tagCol, ai, milieuPenaltyFactor)
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
func (s *Service) fetchEngineArticles(ctx context.Context, vec *pgvector.Vector, userID string, limit, offset int, muted []string, cfg engineConfig, penalized map[string]bool) ([]articleCandidate, error) {
	var rows pgx.Rows
	var err error
	if vec != nil {
		args := []any{*vec}
		q := `
		SELECT a.id, a.title, a.content, a."readingTime", a."completionRate", a."authorId", a."publicationId", a."createdAt", COALESCE(a."semanticTags", '{}'),
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
		// Pool sim-dominant (défauts 65% sim / 15% fresh / 20% complétion,
		// pilotables via feed.pool_*) : le rerank final ne peut pas récupérer
		// un pool déjà pollué par la fraîcheur — un tri à 50/25/25 laissait les
		// articles « du jour » et l'éditorial noyer les contenus du profil
		// (mesuré : pool gaming 18% au lieu de 92% en tri par sim pure).
		// 🚫 Les items portant un tag rejeté sont dévalués (× milieuPenaltyFactor)
		// sur TOUT le score de pool — jamais exclus : le feed reste non vide.
		penArgs, penSQL := penalizedArray(penalized, ai, "\"semanticTags\"")
		args = append(args, penArgs...)
		ai += len(penArgs)
		q += fmt.Sprintf(` ORDER BY ((%.2f*(1 - (a."embedding" <=> $1::vector)) + %.2f*EXP(-EXTRACT(EPOCH FROM (NOW() - a."createdAt"))/172800) + %.2f*(0.70 + 0.30*a."completionRate"))%s) DESC LIMIT $%d OFFSET $%d`,
			cfg.poolSim, cfg.poolFresh, cfg.poolCompletion, penSQL, ai, ai+1)
		args = append(args, limit, offset)
		rows, err = s.pool.Query(ctx, q, args...)
	} else {
		q := `
		SELECT a.id, a.title, a.content, a."readingTime", a."completionRate", a."authorId", a."publicationId", a."createdAt", COALESCE(a."semanticTags", '{}'),
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
			q += fmt.Sprintf(` AND NOT EXISTS (SELECT 1 FROM "BlockedUser" bu WHERE bu."readerId"=$%d AND bu."creatorId"=p."authorId")`, ai)
			args = append(args, toUUID(userID))
			ai++
			q += fmt.Sprintf(` AND NOT EXISTS (SELECT 1 FROM "ContentFeedback" cf WHERE cf."userId"=$%d AND cf."thoughtId"=p.id AND cf.type='SHOW_LESS')`, ai)
			args = append(args, toUUID(userID))
			ai++
		}
		// Pool sim-dominant (poids pilotables via feed.pool_*) + dévaluation des
		// items portant un tag rejeté (jamais d'exclusion).
		penArgs, penSQL := penalizedArray(penalized, ai, "tags")
		args = append(args, penArgs...)
		ai += len(penArgs)
		q += fmt.Sprintf(` ORDER BY ((%.2f*(1 - (p."embedding" <=> $1::vector)) + %.2f*EXP(-EXTRACT(EPOCH FROM (NOW() - p."createdAt"))/86400) + %.2f*LEAST(1.0,(p."likeCount" + p."replyCount"*2 + p."repostCount"*2)/30.0))%s) DESC LIMIT $%d OFFSET $%d`,
			cfg.poolSim, cfg.poolFresh, cfg.poolCompletion, penSQL, ai, ai+1)
		args = append(args, limit, offset)
		rows, err = s.pool.Query(ctx, q, args...)
	} else {
		q := `
		SELECT p.id, p.content, p."authorId", p."createdAt", p."likeCount", p."replyCount", p."repostCount", COALESCE(p.tags, '{}'),
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
// explorationRatio résout le taux d'exploration adaptatif. Priorité aux clés
// SystemConfig (feed.exploration_ratio_cold, feed.exploration_min_signals,
// feed.exploration_ratio), défauts du code sinon. La maturité = signaux
// explicites (likes + sessions de lecture) : les impressions ne comptent pas,
// voir sans agir n'est pas un signal. En cas d'erreur de lecture → taux
// « mature » (prudent, peu d'exploration).
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

func (s *Service) injectDiscovery(ctx context.Context, userID string, items []EngineItem, limit int) []EngineItem {
	ratio := s.explorationRatio(ctx, userID)
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
	// Positions d'injection réparties uniformément sur la page (l'ancien
	// tableau fixe {3, 8} plafonnait l'exploration à 2 slots, ce qui rendait
	// le taux adaptatif sans effet au-delà). Ex. : 2 slots sur 10 → positions
	// 3 et 6 ; 4 slots sur 20 → 4, 8, 12, 16.
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
