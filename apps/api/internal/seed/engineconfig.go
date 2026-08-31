package seed

// ConfigDefault est une SystemConfig par défaut (clé + valeur + description).
type ConfigDefault struct {
	Key         string
	Value       string
	Description string
}

// DefaultEngineConfigs est le CATALOGUE des clés SystemConfig pilotables du
// moteur feed (feed.*) et de l'OAuth (OAUTH_*). Chaque clé est seedée avec sa
// description pour que le panel admin les liste sans les connaître par cœur ;
// les défauts ci-dessous sont le miroir exact des défauts du code (voir
// feed.engineConfig et oauth.defaultSettings). Une clé absente ou invalide
// retombe de toute façon sur le défaut du code.
func DefaultEngineConfigs() []ConfigDefault {
	return []ConfigDefault{
		// ── POOL de candidats ────────────────────────────────────────────────
		{"feed.pool_sim", "0.65", "Poids de la similarité vectorielle dans le score du POOL de candidats (avant rerank)."},
		{"feed.pool_fresh", "0.15", "Poids de la fraîcheur dans le score du POOL de candidats."},
		{"feed.pool_completion", "0.20", "Poids du taux de complétion dans le score du POOL de candidats."},

		// ── RERANK (score final) ─────────────────────────────────────────────
		{"feed.rerank_sim", "0.40", "Poids de la similarité vectorielle dans le score final (rerank)."},
		{"feed.rerank_fresh", "0.15", "Poids de la fraîcheur dans le score final (rerank)."},
		{"feed.rerank_engagement", "0.15", "Poids de l'engagement (lectures, likes, marque-pages) dans le score final."},
		{"feed.rerank_circadian_weight", "0.15", "Poids du fit circadien (durée de lecture visée du créneau) dans le score final article."},
		{"feed.rerank_cf_weight", "0.15", "Poids du filtrage collaboratif (co-lecture) dans le score final article."},
		{"feed.thought_cf_weight", "0.10", "Poids du filtrage collaboratif (co-lecture) dans le score final pensée."},
		{"feed.thought_morning_bonus", "0.10", "Bonus matinal appliqué aux pensées (créneau matinée)."},
		{"feed.completion_bonus_base", "0.7", "Base du bonus de complétion : score × (base + pente × taux de complétion)."},
		{"feed.completion_bonus_scale", "0.3", "Pente du bonus de complétion (récompense les articles lus jusqu'au bout)."},
		{"feed.cold_start_sim", "0.5", "Similarité neutre utilisée quand l'embedding de l'utilisateur manque (cold-start)."},

		// ── MMR (diversité) ──────────────────────────────────────────────────
		{"feed.mmr_lambda", "0.7", "Force de la diversité MMR : 0 = pertinence pure, 1 = diversité maximale."},
		{"feed.mmr_dup_threshold", "0.92", "Seuil de quasi-duplicat sémantique au-delà duquel le MMR pénalise un candidat."},

		// ── Profils circadiens (6 créneaux) ──────────────────────────────────
		{"feed.circadian_weekend_target_min", "12", "Durée de lecture visée (minutes) pour le week-end."},
		{"feed.circadian_weekend_sigma", "4.5", "Largeur de la gaussienne circadienne du week-end (tolérance autour de la durée visée)."},
		{"feed.circadian_weekend_thought_ratio", "0.60", "Ratio pensées du week-end (le ratio articles = 1 − ratio)."},
		{"feed.circadian_morning_target_min", "5.5", "Durée de lecture visée (minutes) pour la matinée."},
		{"feed.circadian_morning_sigma", "2.2", "Largeur de la gaussienne circadienne de la matinée."},
		{"feed.circadian_morning_thought_ratio", "0.70", "Ratio pensées de la matinée (le ratio articles = 1 − ratio)."},
		{"feed.circadian_midday_target_min", "7.5", "Durée de lecture visée (minutes) pour la pause déjeuner."},
		{"feed.circadian_midday_sigma", "2.8", "Largeur de la gaussienne circadienne de la pause déjeuner."},
		{"feed.circadian_midday_thought_ratio", "0.60", "Ratio pensées de la pause déjeuner (le ratio articles = 1 − ratio)."},
		{"feed.circadian_afternoon_target_min", "8.5", "Durée de lecture visée (minutes) pour l'après-midi."},
		{"feed.circadian_afternoon_sigma", "3.0", "Largeur de la gaussienne circadienne de l'après-midi."},
		{"feed.circadian_afternoon_thought_ratio", "0.60", "Ratio pensées de l'après-midi (le ratio articles = 1 − ratio)."},
		{"feed.circadian_evening_target_min", "12", "Durée de lecture visée (minutes) pour le soir."},
		{"feed.circadian_evening_sigma", "4.0", "Largeur de la gaussienne circadienne du soir."},
		{"feed.circadian_evening_thought_ratio", "0.55", "Ratio pensées du soir (le ratio articles = 1 − ratio)."},
		{"feed.circadian_night_target_min", "7", "Durée de lecture visée (minutes) pour la nuit."},
		{"feed.circadian_night_sigma", "3.0", "Largeur de la gaussienne circadienne de la nuit."},
		{"feed.circadian_night_thought_ratio", "0.65", "Ratio pensées de la nuit (le ratio articles = 1 − ratio)."},

		// ── Engagement article ───────────────────────────────────────────────
		{"feed.eng_read_weight", "0.5", "Poids de la qualité de lecture (statut des sessions) dans l'engagement article."},
		{"feed.eng_social_weight", "0.3", "Poids des marque-pages + highlights (preuve sociale) dans l'engagement article."},
		{"feed.eng_conf_weight", "0.2", "Poids du nombre de sessions (confiance) dans l'engagement article."},
		{"feed.eng_min_sessions", "5", "Sessions minimales avant d'appliquer la pénalité de rebond."},
		{"feed.eng_negative_thresh", "0.25", "Qualité de lecture sous laquelle l'engagement d'un article est pénalisé."},
		{"feed.eng_negative_penalty", "0.85", "Facteur appliqué à un article 'rejeté' (score × 0.85)."},

		// ── CF co-lecture ────────────────────────────────────────────────────
		{"feed.cf_min_my_reads", "3", "Lectures minimales avant d'activer le filtrage collaboratif (co-lecture)."},
		{"feed.cf_top_neighbors", "10", "Nombre de voisins de lecture conservés pour le filtrage collaboratif."},

		// ── Vélocité (trending 48h) ──────────────────────────────────────────
		{"feed.vel_window_hours", "48", "Fenêtre (heures) du signal 'trending' (vélocité d'engagement)."},
		{"feed.vel_post_target", "8", "Likes + réponses + reposts récents dans la fenêtre pour une vélocité maximale (pensées)."},
		{"feed.vel_article_target", "20", "Sessions de lecture pondérées récentes dans la fenêtre pour une vélocité maximale (articles)."},

		// ── Pénalité de milieu (tags rejetés) ────────────────────────────────
		{"feed.milieu_penalty_threshold", "3", "Signalements négatifs cumulés (Voir moins + rebonds) sur un tag avant dévaluation de tout le tag."},
		{"feed.milieu_penalty_factor", "0.5", "Facteur de dévaluation des contenus portant un tag rejeté (jamais exclus : le feed reste non vide)."},

		// ── Feedback explicite + impressions ─────────────────────────────────
		{"feed.show_more_boost_mult", "0.12", "Boost 'Voir plus' : score × (1 + α × similarité au contenu félicité)."},
		{"feed.feedback_window_days", "30", "Fenêtre (jours) des retours explicites (Voir plus/moins, impressions)."},
		{"feed.impression_penalty_threshold", "3", "Impressions vues sans engagement avant dévaluation d'un item."},
		{"feed.impression_penalty_factor", "0.6", "Facteur appliqué à un item déjà vu-ignoré (score × 0.6)."},

		// ── Mix adaptatif pensées/articles ───────────────────────────────────
		{"feed.adapt_k", "0.40", "Force du décalage pensées/articles selon le profil de lecture (× (affinité − 0.5))."},
		{"feed.adapt_ratio_floor", "0.15", "Borne basse du ratio pensées après adaptation (jamais moins de 15 % de pensées)."},
		{"feed.adapt_ratio_ceil", "0.85", "Borne haute du ratio pensées après adaptation (jamais plus de 85 % de pensées)."},
		{"feed.adapt_min_sessions", "3", "Sessions minimales avant de recalibrer le ratio pensées/articles par utilisateur."},
		{"feed.feedback_prefer_weight", "0.25", "Poids des retours explicites (Voir plus/moins) sur le penchant pensées/articles."},
		{"feed.feedback_min_signals", "2", "Retours explicites minimaux avant d'appliquer le drift au penchant (sinon bruit)."},

		// ── Exploration ε-greedy ─────────────────────────────────────────────
		{"feed.exploration_ratio", "0.12", "Taux d'exploration (injection hors bulle) pour les profils matures."},
		{"feed.exploration_ratio_cold", "0.22", "Taux d'exploration pour les profils froids (peu de signaux) — ~2× le taux mature."},
		{"feed.exploration_min_signals", "10", "Signaux (likes + lectures) pour passer d'un profil froid à mature."},
		{"feed.exploration_min_quality", "0.8", "Qualité minimale (taux de complétion) des articles injectés en exploration."},

		// ── Méthodes de connexion (toggle admin, JSON) ───────────────────────
		// Pilote l'affichage du formulaire de login : boutons OAuth (Google /
		// Apple), connexion email + mot de passe et lien magique. Le code retombe
		// sur « tout activé » si la clé est absente ou invalide.
		{"AUTH_METHODS", `{"google":false,"apple":false,"password":true,"magicLink":true}`, "Méthodes de connexion autorisées (JSON {google, apple, password, magicLink}) — pilote le formulaire de login."},

		// ── OAuth (quotas et durées de vie, secondes) ────────────────────────
		{"OAUTH_MAX_CLIENTS_PER_USER", "3", "Nombre maximal d'applications OAuth par compte."},
		{"OAUTH_MAX_REDIRECT_URIS", "10", "Nombre maximal d'URI de redirection par application."},
		{"OAUTH_MAX_ACTIVE_TOKENS_PER_USER", "50", "Nombre maximal de jetons actifs par utilisateur."},
		{"OAUTH_AUTH_CODE_TTL", "60", "Durée de vie du code d'autorisation (secondes)."},
		{"OAUTH_ACCESS_TOKEN_TTL", "3600", "Durée de vie du jeton d'accès (secondes)."},
		{"OAUTH_REFRESH_TOKEN_TTL", "2592000", "Durée de vie du jeton de rafraîchissement (secondes, 30 jours)."},
		{"OAUTH_ID_TOKEN_TTL", "3600", "Durée de vie du jeton d'identité OIDC (secondes)."},
		{"OAUTH_ALLOW_INSECURE_REDIRECT", "false", "Autorise les redirections http:// en clair (dev uniquement — jamais en production)."},
	}
}
