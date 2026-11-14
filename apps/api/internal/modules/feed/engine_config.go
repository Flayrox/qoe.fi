package feed

import (
	"context"
	"strconv"
	"strings"
	"time"
)

// CircadianProfile mirrors getCircadianProfile return in TS.
type CircadianProfile struct {
	Name                 string  `json:"name"`
	Label                string  `json:"label"`
	TargetReadingMinutes float64 `json:"targetReadingMinutes"`
	SigmaMinutes         float64 `json:"sigmaMinutes"`
	ArticleRatio         float64 `json:"articleRatio"`
	ThoughtRatio         float64 `json:"thoughtRatio"`
}

// Engagement / CF constants — mirrors feed.ts. Chaque valeur ci-dessous est
// un DÉFAUT pilotable sans recompiler via SystemConfig (clés feed.*, voir
// engineConfig + loadEngineConfig) : une clé absente ou invalide retombe sur
// le défaut, et toutes les valeurs sont bornées lors du parsing.
const (
	engReadWeightDefault       = 0.5  // poids de la QUALITÉ de lecture dans l'engagement article
	engSocialWeightDefault     = 0.3  // poids des marque-pages + highlights (preuve sociale)
	engConfidenceWeightDefault = 0.2  // poids de la confiance (nb de sessions)
	engMinSessionsDefault      = 5    // sessions minimales avant pénalité de rebond
	engNegativeThreshDefault   = 0.25 // qualité de lecture sous laquelle l'engagement est pénalisé
	engNegativePenaltyDefault  = 0.85 // facteur appliqué à un article « rejeté » (×0.85)

	cfMinMyReadsDefault   = 3  // lectures minimales avant d'activer le CF co-lecture
	cfTopNeighborsDefault = 10 // nb de voisins de lecture conservés pour le CF
	cfStatusWeights       = `CASE status WHEN 'READ_COMPLETE' THEN 1.0 WHEN 'READ_PARTIAL' THEN 0.6 WHEN 'SKIM' THEN 0.3 ELSE 0.1 END`

	showMoreBoostMulDefault    = 0.12 // boost « Voir plus » : score × (1 + α·sim)
	feedbackWindowDaysDefault  = 30   // fenêtre des retours explicites (impressions + Voir plus/moins)
	impressionThresholdDefault = 3    // impressions vues sans engagement avant dévaluation
	impressionFactorDefault    = 0.6  // ×0.6 sur un item déjà vu-ignoré

	// ⚡ Trending — vélocité d'engagement des dernières heures.
	velWindowHoursDefault   = 48 // fenêtre de vélocité (heures)
	velPostTargetDefault    = 8  // ≥ 8 likes+réponses+reposts récents / fenêtre → vélocité max (pensées)
	velArticleTargetDefault = 20 // ≥ 20 sessions de lecture pondérées / fenêtre → vélocité max (articles)

	// 🔀 MMR — λ et seuil de quasi-duplicat. Défauts calibrés par recsys-eval.
	mmrLambdaDefault       = 0.7
	mmrDupThresholdDefault = 0.92

	// 🎛️ Poids du moteur exposés dans SystemConfig (pilotage sans recompiler).
	cfgPoolSim         = "feed.pool_sim"
	cfgPoolFresh       = "feed.pool_fresh"
	cfgPoolCompletion  = "feed.pool_completion"
	cfgRerankSim       = "feed.rerank_sim"
	cfgRerankFresh     = "feed.rerank_fresh"
	cfgRerankEng       = "feed.rerank_engagement"
	cfgMMRLambda       = "feed.mmr_lambda"
	cfgMMRDupThreshold = "feed.mmr_dup_threshold"

	poolSimDefault, poolFreshDefault, poolCompletionDefault = 0.65, 0.15, 0.20
	rerankSimDefault, rerankFreshDefault, rerankEngDefault  = 0.40, 0.15, 0.15

	adaptKDefault     = 0.40
	adaptFloorDefault = 0.15
	adaptCeilDefault  = 0.85

	adaptMinSessionsDefault     = 3
	feedbackPreferWeightDefault = 0.25
	feedbackMinSignalsDefault   = 2

	milieuPenaltyThresholdDefault = 3
	milieuPenaltyFactorDefault    = 0.5

	circWeekendMinDefault, circWeekendSigmaDefault, circWeekendThoughtDefault       = 12.0, 4.5, 0.60
	circMorningMinDefault, circMorningSigmaDefault, circMorningThoughtDefault       = 5.5, 2.2, 0.70
	circMiddayMinDefault, circMiddaySigmaDefault, circMiddayThoughtDefault          = 7.5, 2.8, 0.60
	circAfternoonMinDefault, circAfternoonSigmaDefault, circAfternoonThoughtDefault = 8.5, 3.0, 0.60
	circEveningMinDefault, circEveningSigmaDefault, circEveningThoughtDefault       = 12.0, 4.0, 0.55
	circNightMinDefault, circNightSigmaDefault, circNightThoughtDefault             = 7.0, 3.0, 0.65

	rerankCircadianWeightDefault = 0.15
	rerankCfWeightDefault        = 0.15
	thoughtCfWeightDefault       = 0.10
	thoughtMorningBonusDefault   = 0.10
	completionBonusBaseDefault   = 0.7
	completionBonusScaleDefault  = 0.3
	coldStartSimDefault          = 0.5

	explorationMinQualityDefault = 0.8
	explorationRatioDefault      = 0.12
	explorationRatioColdDefault  = 0.22
	explorationMinSignalsDefault = 10
	explorationCfgKey            = "feed.exploration_ratio"
	explorationCfgKeyCold        = "feed.exploration_ratio_cold"
	explorationCfgKeyMinSignals  = "feed.exploration_min_signals"

	cfgEngReadWeight         = "feed.eng_read_weight"
	cfgEngSocialWeight       = "feed.eng_social_weight"
	cfgEngConfWeight         = "feed.eng_conf_weight"
	cfgEngMinSessions        = "feed.eng_min_sessions"
	cfgEngNegativeThresh     = "feed.eng_negative_thresh"
	cfgEngNegativePenalty    = "feed.eng_negative_penalty"
	cfgCfMinMyReads          = "feed.cf_min_my_reads"
	cfgCfTopNeighbors        = "feed.cf_top_neighbors"
	cfgVelWindowHours        = "feed.vel_window_hours"
	cfgVelPostTarget         = "feed.vel_post_target"
	cfgVelArticleTarget      = "feed.vel_article_target"
	cfgMilieuThreshold       = "feed.milieu_penalty_threshold"
	cfgMilieuFactor          = "feed.milieu_penalty_factor"
	cfgShowMoreBoostMul      = "feed.show_more_boost_mult"
	cfgFeedbackWindowDays    = "feed.feedback_window_days"
	cfgImpressionThreshold   = "feed.impression_penalty_threshold"
	cfgImpressionFactor      = "feed.impression_penalty_factor"
	cfgAdaptMinSessions      = "feed.adapt_min_sessions"
	cfgFeedbackPreferWeight  = "feed.feedback_prefer_weight"
	cfgFeedbackMinSignals    = "feed.feedback_min_signals"
	cfgExplorationMinQuality = "feed.exploration_min_quality"
	cfgRerankCircadian       = "feed.rerank_circadian_weight"
	cfgRerankCf              = "feed.rerank_cf_weight"
	cfgThoughtCf             = "feed.thought_cf_weight"
	cfgThoughtMorningBonus   = "feed.thought_morning_bonus"
	cfgCompletionBase        = "feed.completion_bonus_base"
	cfgCompletionScale       = "feed.completion_bonus_scale"
	cfgColdStartSim          = "feed.cold_start_sim"

	cfgCircWeekendMin       = "feed.circadian_weekend_target_min"
	cfgCircWeekendSigma     = "feed.circadian_weekend_sigma"
	cfgCircWeekendThought   = "feed.circadian_weekend_thought_ratio"
	cfgCircMorningMin       = "feed.circadian_morning_target_min"
	cfgCircMorningSigma     = "feed.circadian_morning_sigma"
	cfgCircMorningThought   = "feed.circadian_morning_thought_ratio"
	cfgCircMiddayMin        = "feed.circadian_midday_target_min"
	cfgCircMiddaySigma      = "feed.circadian_midday_sigma"
	cfgCircMiddayThought    = "feed.circadian_midday_thought_ratio"
	cfgCircAfternoonMin     = "feed.circadian_afternoon_target_min"
	cfgCircAfternoonSigma   = "feed.circadian_afternoon_sigma"
	cfgCircAfternoonThought = "feed.circadian_afternoon_thought_ratio"
	cfgCircEveningMin       = "feed.circadian_evening_target_min"
	cfgCircEveningSigma     = "feed.circadian_evening_sigma"
	cfgCircEveningThought   = "feed.circadian_evening_thought_ratio"
	cfgCircNightMin         = "feed.circadian_night_target_min"
	cfgCircNightSigma       = "feed.circadian_night_sigma"
	cfgCircNightThought     = "feed.circadian_night_thought_ratio"

	cfgAdaptK     = "feed.adapt_k"
	cfgAdaptFloor = "feed.adapt_ratio_floor"
	cfgAdaptCeil  = "feed.adapt_ratio_ceil"
)

// circadianTuning regroupe les 3 valeurs pilotables d'un créneau circadien.
type circadianTuning struct {
	TargetMinutes float64
	SigmaMinutes  float64
	ThoughtRatio  float64
}

// engineConfig regroupe TOUS les poids du moteur (pool, rerank, MMR, circadien,
// engagement, CF, vélocité, pénalités, exploration) pilotables via SystemConfig.
type engineConfig struct {
	poolSim, poolFresh, poolCompletion float64
	rerankSim, rerankFresh, rerankEng  float64
	mmrLambda, mmrDupThreshold         float64
	adaptK, adaptFloor, adaptCeil      float64

	circWeekend, circMorning, circMidday, circAfternoon, circEvening, circNight circadianTuning

	engReadWeight, engSocialWeight, engConfWeight float64
	engMinSessions                                int
	engNegativeThresh, engNegativePenalty         float64

	cfMinMyReads, cfTopNeighbors int

	velWindowHours, velPostTarget, velArticleTarget int

	milieuThreshold int
	milieuFactor    float64

	showMoreBoostMul    float64
	feedbackWindowDays  int
	impressionThreshold int
	impressionFactor    float64

	adaptMinSessions     int
	feedbackPreferWeight float64
	feedbackMinSignals   int

	explorationMinQuality float64

	rerankCircadian, rerankCf, thoughtCf, thoughtMorningBonus float64
	completionBase, completionScale, coldStartSim             float64
}

// loadEngineConfig lit toutes les clés du moteur en UNE requête.
func (s *Service) loadEngineConfig(ctx context.Context) engineConfig {
	cfg := engineConfig{
		poolSim:         poolSimDefault,
		poolFresh:       poolFreshDefault,
		poolCompletion:  poolCompletionDefault,
		rerankSim:       rerankSimDefault,
		rerankFresh:     rerankFreshDefault,
		rerankEng:       rerankEngDefault,
		mmrLambda:       mmrLambdaDefault,
		mmrDupThreshold: mmrDupThresholdDefault,
		adaptK:          adaptKDefault,
		adaptFloor:      adaptFloorDefault,
		adaptCeil:       adaptCeilDefault,

		circWeekend:   circadianTuning{circWeekendMinDefault, circWeekendSigmaDefault, circWeekendThoughtDefault},
		circMorning:   circadianTuning{circMorningMinDefault, circMorningSigmaDefault, circMorningThoughtDefault},
		circMidday:    circadianTuning{circMiddayMinDefault, circMiddaySigmaDefault, circMiddayThoughtDefault},
		circAfternoon: circadianTuning{circAfternoonMinDefault, circAfternoonSigmaDefault, circAfternoonThoughtDefault},
		circEvening:   circadianTuning{circEveningMinDefault, circEveningSigmaDefault, circEveningThoughtDefault},
		circNight:     circadianTuning{circNightMinDefault, circNightSigmaDefault, circNightThoughtDefault},

		engReadWeight:         engReadWeightDefault,
		engSocialWeight:       engSocialWeightDefault,
		engConfWeight:         engConfidenceWeightDefault,
		engMinSessions:        engMinSessionsDefault,
		engNegativeThresh:     engNegativeThreshDefault,
		engNegativePenalty:    engNegativePenaltyDefault,
		cfMinMyReads:          cfMinMyReadsDefault,
		cfTopNeighbors:        cfTopNeighborsDefault,
		velWindowHours:        velWindowHoursDefault,
		velPostTarget:         velPostTargetDefault,
		velArticleTarget:      velArticleTargetDefault,
		milieuThreshold:       milieuPenaltyThresholdDefault,
		milieuFactor:          milieuPenaltyFactorDefault,
		showMoreBoostMul:      showMoreBoostMulDefault,
		feedbackWindowDays:    feedbackWindowDaysDefault,
		impressionThreshold:   impressionThresholdDefault,
		impressionFactor:      impressionFactorDefault,
		adaptMinSessions:      adaptMinSessionsDefault,
		feedbackPreferWeight:  feedbackPreferWeightDefault,
		feedbackMinSignals:    feedbackMinSignalsDefault,
		explorationMinQuality: explorationMinQualityDefault,

		rerankCircadian:     rerankCircadianWeightDefault,
		rerankCf:            rerankCfWeightDefault,
		thoughtCf:           thoughtCfWeightDefault,
		thoughtMorningBonus: thoughtMorningBonusDefault,
		completionBase:      completionBonusBaseDefault,
		completionScale:     completionBonusScaleDefault,
		coldStartSim:        coldStartSimDefault,
	}
	rows, err := s.pool.Query(ctx, `SELECT key, value FROM "SystemConfig" WHERE key = ANY($1::text[])`,
		[]string{
			cfgPoolSim, cfgPoolFresh, cfgPoolCompletion, cfgRerankSim, cfgRerankFresh, cfgRerankEng,
			cfgMMRLambda, cfgMMRDupThreshold, cfgAdaptK, cfgAdaptFloor, cfgAdaptCeil,
			cfgCircWeekendMin, cfgCircWeekendSigma, cfgCircWeekendThought,
			cfgCircMorningMin, cfgCircMorningSigma, cfgCircMorningThought,
			cfgCircMiddayMin, cfgCircMiddaySigma, cfgCircMiddayThought,
			cfgCircAfternoonMin, cfgCircAfternoonSigma, cfgCircAfternoonThought,
			cfgCircEveningMin, cfgCircEveningSigma, cfgCircEveningThought,
			cfgCircNightMin, cfgCircNightSigma, cfgCircNightThought,
			cfgEngReadWeight, cfgEngSocialWeight, cfgEngConfWeight, cfgEngMinSessions,
			cfgEngNegativeThresh, cfgEngNegativePenalty,
			cfgCfMinMyReads, cfgCfTopNeighbors,
			cfgVelWindowHours, cfgVelPostTarget, cfgVelArticleTarget,
			cfgMilieuThreshold, cfgMilieuFactor,
			cfgShowMoreBoostMul, cfgFeedbackWindowDays, cfgImpressionThreshold, cfgImpressionFactor,
			cfgAdaptMinSessions, cfgFeedbackPreferWeight, cfgFeedbackMinSignals,
			cfgExplorationMinQuality,
			cfgRerankCircadian, cfgRerankCf, cfgThoughtCf, cfgThoughtMorningBonus,
			cfgCompletionBase, cfgCompletionScale, cfgColdStartSim,
		})
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
		case cfgAdaptK:
			cfg.adaptK = parseCfgFloat(v, cfg.adaptK)
		case cfgAdaptFloor:
			cfg.adaptFloor = parseCfgFloat(v, cfg.adaptFloor)
		case cfgAdaptCeil:
			cfg.adaptCeil = parseCfgFloat(v, cfg.adaptCeil)

		// 🌅 Circadien.
		case cfgCircWeekendMin:
			cfg.circWeekend.TargetMinutes = parseCfgFloatRange(v, cfg.circWeekend.TargetMinutes, 0, 10000)
		case cfgCircWeekendSigma:
			cfg.circWeekend.SigmaMinutes = parseCfgFloatRange(v, cfg.circWeekend.SigmaMinutes, 0.1, 100)
		case cfgCircWeekendThought:
			cfg.circWeekend.ThoughtRatio = parseCfgFloat(v, cfg.circWeekend.ThoughtRatio)
		case cfgCircMorningMin:
			cfg.circMorning.TargetMinutes = parseCfgFloatRange(v, cfg.circMorning.TargetMinutes, 0, 10000)
		case cfgCircMorningSigma:
			cfg.circMorning.SigmaMinutes = parseCfgFloatRange(v, cfg.circMorning.SigmaMinutes, 0.1, 100)
		case cfgCircMorningThought:
			cfg.circMorning.ThoughtRatio = parseCfgFloat(v, cfg.circMorning.ThoughtRatio)
		case cfgCircMiddayMin:
			cfg.circMidday.TargetMinutes = parseCfgFloatRange(v, cfg.circMidday.TargetMinutes, 0, 10000)
		case cfgCircMiddaySigma:
			cfg.circMidday.SigmaMinutes = parseCfgFloatRange(v, cfg.circMidday.SigmaMinutes, 0.1, 100)
		case cfgCircMiddayThought:
			cfg.circMidday.ThoughtRatio = parseCfgFloat(v, cfg.circMidday.ThoughtRatio)
		case cfgCircAfternoonMin:
			cfg.circAfternoon.TargetMinutes = parseCfgFloatRange(v, cfg.circAfternoon.TargetMinutes, 0, 10000)
		case cfgCircAfternoonSigma:
			cfg.circAfternoon.SigmaMinutes = parseCfgFloatRange(v, cfg.circAfternoon.SigmaMinutes, 0.1, 100)
		case cfgCircAfternoonThought:
			cfg.circAfternoon.ThoughtRatio = parseCfgFloat(v, cfg.circAfternoon.ThoughtRatio)
		case cfgCircEveningMin:
			cfg.circEvening.TargetMinutes = parseCfgFloatRange(v, cfg.circEvening.TargetMinutes, 0, 10000)
		case cfgCircEveningSigma:
			cfg.circEvening.SigmaMinutes = parseCfgFloatRange(v, cfg.circEvening.SigmaMinutes, 0.1, 100)
		case cfgCircEveningThought:
			cfg.circEvening.ThoughtRatio = parseCfgFloat(v, cfg.circEvening.ThoughtRatio)
		case cfgCircNightMin:
			cfg.circNight.TargetMinutes = parseCfgFloatRange(v, cfg.circNight.TargetMinutes, 0, 10000)
		case cfgCircNightSigma:
			cfg.circNight.SigmaMinutes = parseCfgFloatRange(v, cfg.circNight.SigmaMinutes, 0.1, 100)
		case cfgCircNightThought:
			cfg.circNight.ThoughtRatio = parseCfgFloat(v, cfg.circNight.ThoughtRatio)

		// 📚 Engagement article.
		case cfgEngReadWeight:
			cfg.engReadWeight = parseCfgFloat(v, cfg.engReadWeight)
		case cfgEngSocialWeight:
			cfg.engSocialWeight = parseCfgFloat(v, cfg.engSocialWeight)
		case cfgEngConfWeight:
			cfg.engConfWeight = parseCfgFloat(v, cfg.engConfWeight)
		case cfgEngMinSessions:
			cfg.engMinSessions = parseCfgInt(v, cfg.engMinSessions, 0, 1000)
		case cfgEngNegativeThresh:
			cfg.engNegativeThresh = parseCfgFloat(v, cfg.engNegativeThresh)
		case cfgEngNegativePenalty:
			cfg.engNegativePenalty = parseCfgFloat(v, cfg.engNegativePenalty)

		// 👥 CF co-lecture.
		case cfgCfMinMyReads:
			cfg.cfMinMyReads = parseCfgInt(v, cfg.cfMinMyReads, 0, 1000)
		case cfgCfTopNeighbors:
			cfg.cfTopNeighbors = parseCfgInt(v, cfg.cfTopNeighbors, 1, 100)

		// ⚡ Vélocité.
		case cfgVelWindowHours:
			cfg.velWindowHours = parseCfgInt(v, cfg.velWindowHours, 1, 720)
		case cfgVelPostTarget:
			cfg.velPostTarget = parseCfgInt(v, cfg.velPostTarget, 1, 1000)
		case cfgVelArticleTarget:
			cfg.velArticleTarget = parseCfgInt(v, cfg.velArticleTarget, 1, 1000)

		// 🚫 Pénalité de milieu.
		case cfgMilieuThreshold:
			cfg.milieuThreshold = parseCfgInt(v, cfg.milieuThreshold, 0, 100)
		case cfgMilieuFactor:
			cfg.milieuFactor = parseCfgFloat(v, cfg.milieuFactor)

		// 👍 Feedback explicite + impressions.
		case cfgShowMoreBoostMul:
			cfg.showMoreBoostMul = parseCfgFloat(v, cfg.showMoreBoostMul)
		case cfgFeedbackWindowDays:
			cfg.feedbackWindowDays = parseCfgInt(v, cfg.feedbackWindowDays, 1, 365)
		case cfgImpressionThreshold:
			cfg.impressionThreshold = parseCfgInt(v, cfg.impressionThreshold, 0, 100)
		case cfgImpressionFactor:
			cfg.impressionFactor = parseCfgFloat(v, cfg.impressionFactor)

		// 🎯 Mix adaptatif.
		case cfgAdaptMinSessions:
			cfg.adaptMinSessions = parseCfgInt(v, cfg.adaptMinSessions, 0, 1000)
		case cfgFeedbackPreferWeight:
			cfg.feedbackPreferWeight = parseCfgFloat(v, cfg.feedbackPreferWeight)
		case cfgFeedbackMinSignals:
			cfg.feedbackMinSignals = parseCfgInt(v, cfg.feedbackMinSignals, 0, 100)

		// 🌍 Exploration.
		case cfgExplorationMinQuality:
			cfg.explorationMinQuality = parseCfgFloat(v, cfg.explorationMinQuality)

		// ⚖️ Poids résiduels du rerank.
		case cfgRerankCircadian:
			cfg.rerankCircadian = parseCfgFloat(v, cfg.rerankCircadian)
		case cfgRerankCf:
			cfg.rerankCf = parseCfgFloat(v, cfg.rerankCf)
		case cfgThoughtCf:
			cfg.thoughtCf = parseCfgFloat(v, cfg.thoughtCf)
		case cfgThoughtMorningBonus:
			cfg.thoughtMorningBonus = parseCfgFloat(v, cfg.thoughtMorningBonus)
		case cfgCompletionBase:
			cfg.completionBase = parseCfgFloat(v, cfg.completionBase)
		case cfgCompletionScale:
			cfg.completionScale = parseCfgFloat(v, cfg.completionScale)
		case cfgColdStartSim:
			cfg.coldStartSim = parseCfgFloat(v, cfg.coldStartSim)
		}
	}
	if cfg.adaptFloor > cfg.adaptCeil {
		cfg.adaptFloor, cfg.adaptCeil = cfg.adaptCeil, cfg.adaptFloor
	}
	return cfg
}

// parseCfgFloat parse une valeur SystemConfig en float borné [0,1].
func parseCfgFloat(v string, def float64) float64 {
	f, err := strconv.ParseFloat(v, 64)
	if err != nil || f < 0 || f > 1 {
		return def
	}
	return f
}

// parseCfgFloatRange parse une valeur SystemConfig en float borné [lo, hi].
func parseCfgFloatRange(v string, def, lo, hi float64) float64 {
	f, err := strconv.ParseFloat(v, 64)
	if err != nil || f < lo || f > hi {
		return def
	}
	return f
}

// parseCfgInt parse une valeur SystemConfig en entier borné [lo, hi].
func parseCfgInt(v string, def, lo, hi int) int {
	n, err := strconv.Atoi(strings.TrimSpace(v))
	if err != nil || n < lo || n > hi {
		return def
	}
	return n
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
		return CircadianProfile{Name: "WEEKEND_LONGFORM", Label: "Exploration & Temps Long du Week-end", TargetReadingMinutes: 12, SigmaMinutes: 4.5, ArticleRatio: 0.40, ThoughtRatio: 0.60}
	}
	switch {
	case h >= 6 && h < 11:
		return CircadianProfile{Name: "MORNING_BRIEF", Label: "Matinée & Trajets : Formats Courts & Pensées", TargetReadingMinutes: 5.5, SigmaMinutes: 2.2, ArticleRatio: 0.30, ThoughtRatio: 0.70}
	case h >= 11 && h < 15:
		return CircadianProfile{Name: "MIDDAY_BREAK", Label: "Pause Déjeuner : Débats & Terroirs", TargetReadingMinutes: 7.5, SigmaMinutes: 2.8, ArticleRatio: 0.40, ThoughtRatio: 0.60}
	case h >= 15 && h < 19:
		return CircadianProfile{Name: "AFTERNOON_FLOW", Label: "Après-midi : Essais & Perspectives", TargetReadingMinutes: 8.5, SigmaMinutes: 3.0, ArticleRatio: 0.40, ThoughtRatio: 0.60}
	case h >= 19 && h <= 23:
		return CircadianProfile{Name: "EVENING_SANCTUARY", Label: "Sanctuaire du Soir : Essais de Fond & Philosophie", TargetReadingMinutes: 12.0, SigmaMinutes: 4.0, ArticleRatio: 0.45, ThoughtRatio: 0.55}
	default:
		return CircadianProfile{Name: "LATE_NIGHT", Label: "Lecture Nocturne Calme", TargetReadingMinutes: 7.0, SigmaMinutes: 3.0, ArticleRatio: 0.35, ThoughtRatio: 0.65}
	}
}

// applyCircadianConfig surcharge un profil circadien par défaut avec les
// valeurs pilotées via SystemConfig.
func applyCircadianConfig(p CircadianProfile, cfg engineConfig) CircadianProfile {
	var t circadianTuning
	switch p.Name {
	case "WEEKEND_LONGFORM":
		t = cfg.circWeekend
	case "MORNING_BRIEF":
		t = cfg.circMorning
	case "MIDDAY_BREAK":
		t = cfg.circMidday
	case "AFTERNOON_FLOW":
		t = cfg.circAfternoon
	case "EVENING_SANCTUARY":
		t = cfg.circEvening
	case "LATE_NIGHT":
		t = cfg.circNight
	default:
		return p
	}
	if t.TargetMinutes > 0 {
		p.TargetReadingMinutes = t.TargetMinutes
	}
	if t.SigmaMinutes > 0 {
		p.SigmaMinutes = t.SigmaMinutes
	}
	if t.ThoughtRatio > 0 && t.ThoughtRatio <= 1 {
		p.ThoughtRatio = t.ThoughtRatio
		p.ArticleRatio = 1 - t.ThoughtRatio
	}
	return p
}

// readConfig lit une valeur SystemConfig (best-effort).
func (s *Service) readConfig(ctx context.Context, key string) string {
	var v string
	if err := s.pool.QueryRow(ctx, `SELECT value FROM "SystemConfig" WHERE key=$1`, key).Scan(&v); err != nil {
		return ""
	}
	return v
}
