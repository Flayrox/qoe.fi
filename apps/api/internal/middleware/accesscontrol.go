package middleware

import (
	"context"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/apiaccess"
)

// accessControlTTL est la durée de cache de la config de contrôle d'accès :
// une bascule admin (coupure générale, endpoints désactivés) est appliquée au
// runtime dans un délai de l'ordre de la seconde, sans re-déploiement.
// (var pour permettre aux tests de la ramener à 0.)
var accessControlTTL = 5 * time.Second

// alwaysAllowed sont les chemins qui échappent à la coupure générale : la
// console admin (pour pouvoir ré-activer), le fournisseur d'identité OAuth
// (le login en dépend), les webhooks entrants d'infra (Stripe/Supabase) et
// l'émission d'événements interne (workers). Les endpoints désactivés
// individuellement, eux, s'appliquent partout sauf /v1/admin/*.
var accessControlAlwaysAllowed = []string{
	"/v1/admin/",
	"/v1/oauth/",
	"/v1/events/",
	"/v1/webhooks/stripe",
	"/v1/webhooks/supabase",
}

// accessControlState porte le cache en mémoire de la config (mirroir du cache
// de quotas du module oauth).
type accessControlState struct {
	mu   sync.Mutex
	at   time.Time
	cfg  apiaccess.AccessControlConfig
	pool *pgxpool.Pool
}

func (s *accessControlState) load(ctx context.Context) apiaccess.AccessControlConfig {
	s.mu.Lock()
	defer s.mu.Unlock()
	if time.Since(s.at) < accessControlTTL {
		return s.cfg
	}
	cfg, err := apiaccess.LoadAccessControl(ctx, s.pool)
	if err != nil {
		// Lecture config impossible → on laisse l'API ouverte (disponibilité
		// avant tout : ne pas couper l'API à cause d'un souci de lecture).
		return s.cfg
	}
	s.cfg = cfg
	s.at = time.Now()
	return cfg
}

// AccessControl applique la coupure générale de l'API (API_ACCESS_DISABLED)
// et la liste des endpoints désactivés (API_DISABLED_ENDPOINTS), pilotées par
// les superadmins via la console admin. Défense en profondeur côté serveur :
// un flag client ne suffirait pas à bloquer des requêtes directes.
func AccessControl(pool *pgxpool.Pool) func(http.Handler) http.Handler {
	state := &accessControlState{pool: pool}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			path := r.URL.Path
			if !strings.HasPrefix(path, "/v1/") {
				next.ServeHTTP(w, r)
				return
			}
			if accessControlAlwaysAllowedPath(path) {
				next.ServeHTTP(w, r)
				return
			}
			cfg := state.load(r.Context())
			if cfg.Disabled {
				writeAccessControlJSON(w, http.StatusServiceUnavailable,
					"API temporairement désactivée par l'administration.")
				return
			}
			if apiaccess.EndpointDisabled(path, cfg.DisabledEndpoints) {
				writeAccessControlJSON(w, http.StatusNotFound,
					"Endpoint désactivé par l'administration.")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// accessControlAlwaysAllowedPath vérifie si le chemin échappe à la coupure
// générale (préfixe exact ou sous-chemin).
func accessControlAlwaysAllowedPath(path string) bool {
	for _, p := range accessControlAlwaysAllowed {
		if path == p || strings.HasPrefix(path, p) {
			return true
		}
	}
	return false
}

// writeAccessControlJSON écrit une erreur JSON (même forme que writeForbidden).
func writeAccessControlJSON(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(`{"error":"` + msg + `"}`))
}
