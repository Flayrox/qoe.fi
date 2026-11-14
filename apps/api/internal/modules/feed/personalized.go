package feed

import (
	"context"
	"log"
	"math"
	"sort"
	"strconv"
)

// ─────────────────────────────────────────────────────────────────────────────
// Two-Tower personalized feed — Go port of packages/db/src/feed.ts
// ─────────────────────────────────────────────────────────────────────────────
// Score final (articles) = (0.40*Sim + 0.15*Fresh + 0.15*Engagement +
//   0.15*Circadian + 0.15*CF) * CompletionBonus — sim dominante.
// Score final (pensées) = 0.40*Sim + 0.22*Fresh + 0.18*Engagement +
//   0.10*MorningBonus + 0.10*CF.
// La répartition articles / pensées part du profil circadien puis est
// recalibrée par utilisateur selon sa façon de lire (getThoughtPreference) :
// un lecteur de formats courts reçoit plus de pensées, un lecteur de
// long-format plus d'articles.
// Le POOL de candidats est construit en sim-dominant (65% sim / 15% fresh /
// 20% complétion) : un pool à 50/25/25 laissait la fraîcheur et l'éditorial
// noyer le contenu du profil avant même le rerank (cf. pool_test.go).
// + MMR diversity (max 2 / author)
// + Collaborative Filtering via co-reading (ReadingSession, ArticleAttribution)
// + Cold-start (nil embedding → fallback)
// + EMA vector updates
// ─────────────────────────────────────────────────────────────────────────────

// EngineItem est un item classé par le moteur (léger, prêt à réhydrater).
type EngineItem struct {
	ItemType    string `json:"itemType"` // ARTICLE | THOUGHT
	ID          string `json:"id"`
	IsDiscovery bool   `json:"isDiscovery,omitempty"`
}

// EngineResult est la réponse paginée du moteur (shape consommé par vector-feed.ts).
type EngineResult struct {
	Items      []EngineItem `json:"items"`
	HasMore    bool         `json:"hasMore"`
	NextCursor string       `json:"nextCursor,omitempty"`
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
	cfg := s.loadEngineConfig(ctx)
	// 🌅 Profil circadien (défauts du code) puis surcharges SystemConfig.
	circadian := applyCircadianConfig(getCircadianProfile(userHour, -1), cfg)

	// 🎯 Mix adaptatif : le ratio circadien articles/pensées est recalibré selon
	// ce que l'utilisateur aime RÉELLEMENT lire.
	thoughtPref := s.getThoughtPreference(ctx, userID, cfg)
	effThoughtRatio := blendThoughtRatio(circadian.ThoughtRatio, thoughtPref, cfg.adaptK, cfg.adaptFloor, cfg.adaptCeil)
	effArticleRatio := 1 - effThoughtRatio

	// Répartition articles / pensées.
	targetArticles := int(math.Ceil(float64(limit) * effArticleRatio))
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
	cfMap := s.getCoReadCandidates(ctx, userID, cfg)
	cfThoughtMap := s.getCoReadThoughtCandidates(ctx, userID, cfg)

	// 🚫 Tags rejetés par l'utilisateur (plus loin que le pool et le rerank).
	penalized := s.penalizedTags(ctx, userID, cfg)

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

	engScores, penalties := s.getArticleEngagementScores(ctx, articleIDs(articles), cfg)
	artIDs, thIDs := articleIDs(articles), thoughtIDs(thoughts)

	// Feedback implicite négatif : items vus ≥3× sans engagement.
	impPenalty := s.getImpressionPenalties(ctx, userID, artIDs, thIDs, cfg)

	// Feedback positif explicite : « Voir plus » → items proches félicités.
	showMoreBoost := s.getShowMoreBoost(ctx, userID, artIDs, thIDs, cfg)

	// ⚡ Trending : vélocité d'engagement des 48 dernières heures.
	artVel, thVel := s.getVelocityScores(ctx, artIDs, thIDs, cfg)

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
		if v, ok := artVel[a.id]; ok && v > eng {
			eng = v
		}
		sim, fresh := a.sim, a.freshness
		if sim <= 0 {
			sim = cfg.coldStartSim
		}
		if fresh <= 0 {
			fresh = 0.5
		}
		completionBonus := cfg.completionBase + cfg.completionScale*a.completionRate
		cf := cfMap[a.id]

		score := (cfg.rerankSim*sim + cfg.rerankFresh*fresh + cfg.rerankEng*eng + cfg.rerankCircadian*circFit + cfg.rerankCf*cf) * completionBonus
		if penalties[a.id] {
			score *= cfg.engNegativePenalty
		}
		if hasPenalizedTag(a.tags, penalized) {
			score *= cfg.milieuFactor
		}
		if impPenalty[a.id] {
			score *= cfg.impressionFactor
		}
		if b, ok := showMoreBoost[a.id]; ok && b > 0 {
			score *= 1 + cfg.showMoreBoostMul*b
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
			morningBonus = cfg.thoughtMorningBonus
		}
		cfT := cfThoughtMap[t.id]
		if v, ok := thVel[t.id]; ok && v > eng {
			eng = v
		}
		t.score = cfg.rerankSim*sim + cfg.rerankFresh*fresh + cfg.rerankEng*eng + cfg.thoughtMorningBonus*morningBonus + cfg.thoughtCf*cfT
		if impPenalty[t.id] {
			t.score *= cfg.impressionFactor
		}
		if hasPenalizedTag(t.tags, penalized) {
			t.score *= cfg.milieuFactor
		}
		if b, ok := showMoreBoost[t.id]; ok && b > 0 {
			t.score *= 1 + cfg.showMoreBoostMul*b
		}
	}
	sort.Slice(thoughts, func(i, j int) bool { return thoughts[i].score > thoughts[j].score })

	// 🔀 MMR sémantique.
	artEmb := s.fetchCandidateEmbeddings(ctx, "Article", artIDs)
	thEmb := s.fetchCandidateEmbeddings(ctx, "Post", thIDs)

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

	hasMore := len(articles) == artOver || len(thoughts) == thOver
	if len(interleaved) > limit {
		interleaved = interleaved[:limit]
	}

	// 🌍 Exploration ε-greedy pour lecteur authentifié.
	if userID != "" {
		interleaved = s.injectDiscovery(ctx, userID, interleaved, limit, cfg)
	}

	// 🛡️ Jamais de items: null dans le JSON.
	if interleaved == nil {
		interleaved = []EngineItem{}
	}

	return EngineResult{Items: interleaved, HasMore: hasMore, NextCursor: strconv.Itoa(offset + len(interleaved))}, nil
}
