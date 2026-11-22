package middleware

import (
	"context"
	"encoding/json"
	"log"
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
	mu      sync.Mutex
	at      time.Time
	cfg     apiaccess.AccessControlConfig
	pool    *pgxpool.Pool
	lastErr string // dernière erreur journalisée (une panne ne noie pas les logs)
}

func (s *accessControlState) load(ctx context.Context) apiaccess.AccessControlConfig {
	s.mu.Lock()
	defer s.mu.Unlock()
	if time.Since(s.at) < accessControlTTL {
		return s.cfg
	}
	if s.pool == nil {
		return s.cfg
	}
	cfg, err := apiaccess.LoadAccessControl(ctx, s.pool)
	if err != nil {
		// Lecture impossible (panne, ou configuration illisible) → on conserve
		// le dernier état connu : ne pas couper l'API sur un souci de lecture.
		// L'erreur est journalisée (une fois par message) : une coupure qu'on
		// croit armée alors qu'elle est illisible ne doit pas rester invisible.
		if msg := err.Error(); msg != s.lastErr {
			s.lastErr = msg
			log.Printf("[access-control] configuration illisible, dernier état connu conservé : %v", err)
		}
		return s.cfg
	}
	s.lastErr = ""
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
// Le corps est sérialisé, jamais concaténé : un message contenant un guillemet
// ou un antislash produisait un JSON invalide, donc un client incapable de lire
// la raison du refus.
func writeAccessControlJSON(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	body, err := json.Marshal(map[string]string{"error": msg})
	if err != nil {
		_, _ = w.Write([]byte(`{"error":"Accès refusé"}`))
		return
	}
	_, _ = w.Write(body)
}
