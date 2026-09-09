// Package flags — feature flags lus côté serveur Go.
//
// Unification UI + sécurité : la table `feature_flags` (même Postgres que
// l'app, pilotée depuis la console admin via Supabase / @qoe/flags) est lue
// directement par l'API Go. Un flag activé/désactivé dans la console est donc
// enforceable côté serveur (workers, admin…) et exposable via GET /v1/flags —
// sans nouvelle écriture, une seule source de vérité.
//
// Dégradation gracieuse : table absente, DB down ou clé inconnue → valeur par
// défaut du registre (miroir exact de packages/flags/src/flags.ts). Zéro crash.
package flags

import (
	"context"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Clés des feature flags (kebab-case, miroir de @qoe/flags).
const (
	FeedRecommendations   = "feed-recommendations"
	WebNewsletterBanner   = "web-newsletter-banner"
	DashboardAITitle      = "dashboard-ai-title-suggestions"
	LandingPricingSection = "landing-pricing-section"
	AdminAuditLog         = "admin-audit-log"
	WorkersNewsletter     = "workers-newsletter-dispatch"
)

// defaults est le registre des défauts (miroir exact de @qoe/flags) : utilisé
// quand la table est absente, la clé inconnue, ou la DB injoignable.
var defaults = map[string]bool{
	FeedRecommendations:   true,
	WebNewsletterBanner:   false,
	DashboardAITitle:      false,
	LandingPricingSection: false,
	AdminAuditLog:         false,
	WorkersNewsletter:     true,
}

// cacheTTL borne la fraîcheur d'un flag : une bascule console est appliquée
// côté serveur en quelques secondes, sans redéploiement. Var (non const) pour
// être raccourci dans les tests.
var cacheTTL = 30 * time.Second

// Service lit les feature flags depuis la table partagée, avec cache TTL.
type Service struct {
	pool *pgxpool.Pool

	mu     sync.Mutex
	at     time.Time
	cached map[string]bool
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool}
}

// All retourne l'état de tous les flags (registre + surcharges table).
func (s *Service) All(ctx context.Context) map[string]bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	out := map[string]bool{}
	for k, v := range defaults {
		out[k] = v
	}
	if time.Since(s.at) >= cacheTTL {
		s.reload(ctx)
	}
	for k, v := range s.cached {
		out[k] = v
	}
	return out
}

// IsOn évalue un flag (défaut du registre si clé inconnue / DB down).
func (s *Service) IsOn(ctx context.Context, key string) bool {
	if _, known := defaults[key]; !known {
		return false
	}
	return s.All(ctx)[key]
}

// reload rafraîchit le cache depuis la table feature_flags (best-effort).
// Doit être appelé avec s.mu tenue.
func (s *Service) reload(ctx context.Context) {
	s.cached = map[string]bool{}
	rows, err := s.pool.Query(ctx, `SELECT key, is_enabled FROM feature_flags`)
	if err != nil {
		// DB down → on garde le cache précédent (ou registre vide → défauts).
		if s.cached == nil {
			s.cached = map[string]bool{}
		}
		return
	}
	defer rows.Close()
	for rows.Next() {
		var key string
		var enabled bool
		if err := rows.Scan(&key, &enabled); err != nil {
			continue
		}
		if _, known := defaults[key]; known {
			s.cached[key] = enabled
		}
	}
	s.at = time.Now()
}
