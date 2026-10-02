package admin

// =====================================================================
// 🩺 Santé de la plateforme (plan console, Phase 7)
// =====================================================================
// La console doit prouver, chiffres en main, que l'autorisation ne casse rien
// AVANT d'armer `authz-enforce`. Trois vérités à portée de clic :
//   - la base répond (et en combien de temps) ;
//   - la version de migration APPLIQUÉE (ce que le schéma sait faire) ;
//   - le mode d'autorisation en cours et le volume de décisions récentes,
//     séparant « refusé et appliqué » de « refusé mais observé ».
//
// Aucune de ces lectures ne passe par `checkSuperadmin` : l'autorité est la
// capacité `admin.dashboard.read` de la route. Un analyste doit pouvoir lire la
// santé de la plateforme sans devenir superadmin.
// =====================================================================

import (
	"context"
	"os"
	"time"
)

// PostgresHealth dit si la base répond, et en combien de temps.
type PostgresHealth struct {
	OK        bool   `json:"ok"`
	LatencyMs int64  `json:"latencyMs"`
	Error     string `json:"error,omitempty"`
}

// MigrationHealth est la version de migration APPLIQUÉE (table goose).
type MigrationHealth struct {
	Applied int64  `json:"applied"`
	Error   string `json:"error,omitempty"`
}

// DecisionCounters agrège les décisions du garde sur 24 h, par issue.
type DecisionCounters struct {
	Last24h  DecisionWindowCounts `json:"last24h"`
	Recorder RecorderCounters     `json:"recorder"`
}

// DecisionWindowCounts : accords, refus appliqués, refus seulement observés.
type DecisionWindowCounts struct {
	Allowed        int64 `json:"allowed"`
	DeniedObserved int64 `json:"deniedObserved"`
	DeniedEnforced int64 `json:"deniedEnforced"`
}

// RecorderCounters : santé du journal lui-même (une perte doit se voir).
type RecorderCounters struct {
	Written int64 `json:"written"`
	Dropped int64 `json:"dropped"`
	Queued  int   `json:"queued"`
}

// DecisionStatsSource est l'enregistreur de décisions, réduit à ses compteurs.
// Interface étroite : la console n'écrit pas une décision, elle lit son état.
type DecisionStatsSource interface {
	Written() int64
	Dropped() int64
	Queued() int
}

// SetDecisionStats branche l'enregistreur (nil = compteurs à zéro, jamais un
// panic : la santé d'une console ne doit pas dépendre d'un câblage optionnel).
func (h *Handler) SetDecisionStats(source DecisionStatsSource) { h.decisionStats = source }

// PlatformHealth est l'état complet rendu à /admin/health.
type PlatformHealth struct {
	Postgres  PostgresHealth   `json:"postgres"`
	Migration MigrationHealth  `json:"migration"`
	Mode      string           `json:"mode"`
	Version   string           `json:"version"`
	Decisions DecisionCounters `json:"decisions"`
}

// GetPlatformHealth lit l'état de la plateforme. Chaque sonde est indépendante :
// une base en panne ne doit pas empêcher de lire la version de migration déjà
// connue, ni l'inverse.
func (s *Service) GetPlatformHealth(ctx context.Context) *PlatformHealth {
	out := &PlatformHealth{
		Version: buildVersion(),
		Decisions: DecisionCounters{
			Recorder: RecorderCounters{},
		},
	}

	if s == nil || s.pool == nil {
		out.Postgres = PostgresHealth{OK: false, Error: "base non branchée"}
		return out
	}

	start := time.Now()
	if err := s.pool.Ping(ctx); err != nil {
		out.Postgres = PostgresHealth{OK: false, LatencyMs: time.Since(start).Milliseconds(), Error: err.Error()}
	} else {
		out.Postgres = PostgresHealth{OK: true, LatencyMs: time.Since(start).Milliseconds()}
	}

	var applied int64
	if err := s.pool.QueryRow(ctx,
		`SELECT COALESCE(MAX(version_id), 0)::bigint FROM goose_db_version`).Scan(&applied); err != nil {
		out.Migration = MigrationHealth{Error: err.Error()}
	} else {
		out.Migration = MigrationHealth{Applied: applied}
	}

	// « 24 h » est mesuré en base, pas en mémoire : deux instances de l'API
	// doivent lire le même chiffre.
	if err := s.pool.QueryRow(ctx, `
		SELECT
		    COUNT(*) FILTER (WHERE "allowed")::bigint,
		    COUNT(*) FILTER (WHERE NOT "allowed" AND "mode" = 'observe')::bigint,
		    COUNT(*) FILTER (WHERE NOT "allowed" AND "mode" = 'enforce')::bigint
		  FROM "AdminAuthzDecision"
		 WHERE "createdAt" >= CURRENT_TIMESTAMP - interval '24 hours'`,
	).Scan(
		&out.Decisions.Last24h.Allowed,
		&out.Decisions.Last24h.DeniedObserved,
		&out.Decisions.Last24h.DeniedEnforced,
	); err != nil {
		// Une table de décisions absente (migration non appliquée) ne doit pas
		// faire échouer la santé : les compteurs restent à zéro et la version de
		// migration, elle, dit pourquoi.
		out.Decisions.Last24h = DecisionWindowCounts{}
	}

	return out
}

// buildVersion lit la version du binaire déployé, sans jamais l'inventer.
func buildVersion() string {
	for _, key := range []string{"QOEFI_VERSION", "GIT_SHA", "SOURCE_VERSION"} {
		if value := os.Getenv(key); value != "" {
			return value
		}
	}
	return "dev"
}
