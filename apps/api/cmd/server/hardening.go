package main

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"net/http"
	"strings"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	authmw "github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/observability"
	"github.com/qoefi/api/internal/pow"
	"github.com/qoefi/api/internal/response"
	"github.com/redis/go-redis/v9"
)

const (
	defaultBodyLimitBytes int64 = 256 << 10 // 256 Ko
	richBodyLimitBytes    int64 = 2 << 20   // 2 Mo (articles, site-layout, imports, newsletters, support)
	mediaBodyLimitBytes   int64 = 11 << 20  // 11 Mo (upload créateur 10 Mo + overhead multipart)
	ebookBodyLimitBytes   int64 = 22 << 20  // 22 Mo (upload EPUB 20 Mo + overhead multipart)
)

// corsAllowedOrigins retourne les origines CORS autorisées.
// Les origines localhost et *.qoe.test ne sont exposées qu'en mode dev (DevtoolsDevOnly).
func corsAllowedOrigins(devOnly bool) []string {
	origins := []string{"https://qoe.fi", "https://*.qoe.fi"}
	if devOnly {
		origins = append(origins,
			"http://localhost:3000",
			"http://localhost:3001",
			"http://localhost:3002",
			"http://localhost:3003",
			"http://qoe.test",
			"http://*.qoe.test",
			"https://qoe.test",
			"https://*.qoe.test",
		)
	}
	return origins
}

// bodyLimitForPath détermine le plafond de taille du corps HTTP en fonction
// du chemin pour éviter tout double-wrapping de http.MaxBytesReader.
func bodyLimitForPath(path string) int64 {
	switch {
	case strings.HasPrefix(path, "/v1/me/ebooks"):
		return ebookBodyLimitBytes
	case path == "/v1/creator/media":
		return mediaBodyLimitBytes
	case strings.HasPrefix(path, "/v1/articles"),
		strings.HasPrefix(path, "/v1/creator/articles"),
		strings.Contains(path, "/site-layout"),
		strings.HasPrefix(path, "/v1/import"),
		strings.HasPrefix(path, "/v1/newsletters"),
		strings.HasPrefix(path, "/v1/support"):
		return richBodyLimitBytes
	default:
		return defaultBodyLimitBytes
	}
}

// routeAwareMaxBodyBytes applique http.MaxBytesReader selon le chemin sur les
// requêtes portant un corps (POST, PUT, PATCH).
func routeAwareMaxBodyBytes() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch r.Method {
			case http.MethodPost, http.MethodPut, http.MethodPatch:
				r.Body = http.MaxBytesReader(w, r.Body, bodyLimitForPath(r.URL.Path))
			}
			next.ServeHTTP(w, r)
		})
	}
}

type routeQuotaRule struct {
	name      string
	method    string
	match     func(path string) bool
	window    time.Duration
	userMax   int
	subnetMax int
}

func matchRouteQuota(r *http.Request, rules []routeQuotaRule) (routeQuotaRule, bool) {
	for _, rule := range rules {
		if r.Method == rule.method && rule.match(r.URL.Path) {
			return rule, true
		}
	}
	return routeQuotaRule{}, false
}

func applyRouteQuotas(rc *redis.Client, rules []routeQuotaRule) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		if rc == nil {
			return next
		}
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			rule, ok := matchRouteQuota(r, rules)
			if !ok {
				next.ServeHTTP(w, r)
				return
			}
			authmw.RateLimitDual(rule.name, rc, rule.window, rule.userMax, rule.window, rule.subnetMax)(next).ServeHTTP(w, r)
		})
	}
}

var publicRouteQuotas = []routeQuotaRule{
	{
		name:      "search-semantic",
		method:    http.MethodGet,
		match:     func(p string) bool { return p == "/search/semantic" },
		window:    time.Minute,
		userMax:   20,
		subnetMax: 40,
	},
	{
		name:      "search-public",
		method:    http.MethodGet,
		match:     func(p string) bool { return p == "/search/articles" || p == "/search/thoughts" },
		window:    time.Minute,
		userMax:   60,
		subnetMax: 120,
	},
	{
		name:      "auth-reg-status",
		method:    http.MethodGet,
		match:     func(p string) bool { return p == "/v1/auth/registration-status" },
		window:    time.Minute,
		userMax:   20,
		subnetMax: 30,
	},
	{
		// Résolution de permalien court /l/{code} : route publique non
		// authentifiée, appelée en SSR à chaque redirection. Sans quota, elle
		// permet d'énumérer les ~900 000 codes et d'aspirer les articles publiés.
		name:      "article-shortcode",
		method:    http.MethodGet,
		match:     func(p string) bool { return strings.HasPrefix(p, "/v1/articles/short/") },
		window:    time.Minute,
		userMax:   60,
		subnetMax: 150,
	},
	{
		name:   "tracking-write",
		method: http.MethodPost,
		match: func(p string) bool {
			return p == "/v1/tracking/reading-session" || p == "/v1/tracking/feed-impression"
		},
		window:    time.Minute,
		userMax:   60,
		subnetMax: 150,
	},
}

var protectedRouteQuotas = []routeQuotaRule{
	{
		name:      "mfa-totp-verify",
		method:    http.MethodPost,
		match:     func(p string) bool { return p == "/v1/me/mfa/totp/verify" },
		window:    5 * time.Minute,
		userMax:   5,
		subnetMax: 15,
	},
	{
		name:      "mfa-totp-enroll",
		method:    http.MethodPost,
		match:     func(p string) bool { return p == "/v1/me/mfa/totp/enroll" },
		window:    time.Minute,
		userMax:   10,
		subnetMax: 25,
	},
	{
		name:      "account-sec-change",
		method:    http.MethodPost,
		match:     func(p string) bool { return p == "/v1/me/password-change" || p == "/v1/me/email-change" },
		window:    time.Minute,
		userMax:   10,
		subnetMax: 25,
	},
	{
		name:      "ai-burst",
		method:    http.MethodPost,
		match:     func(p string) bool { return p == "/v1/ai/summarize" || p == "/v1/ai/explain" },
		window:    time.Minute,
		userMax:   10,
		subnetMax: 30,
	},
	{
		name:   "webhooks-write",
		method: http.MethodPost,
		match: func(p string) bool {
			return p == "/v1/webhooks" || (strings.HasPrefix(p, "/v1/webhooks/") && strings.HasSuffix(p, "/test"))
		},
		window:    time.Minute,
		userMax:   10,
		subnetMax: 25,
	},
}

// publicRouteRateLimit protège les routes publiques coûteuses (recherche sémantique,
// tracking anonyme, vérification d'inscription) par GCRA double clé.
func publicRouteRateLimit(rc *redis.Client) func(http.Handler) http.Handler {
	return applyRouteQuotas(rc, publicRouteQuotas)
}

// protectedRouteRateLimit protège les endpoints critiques après authentification
// (brute-force MFA TOTP 5/5min, changement mot de passe/email, IA, webhooks).
func protectedRouteRateLimit(rc *redis.Client) func(http.Handler) http.Handler {
	return applyRouteQuotas(rc, protectedRouteQuotas)
}

type metricsStatusWriter struct {
	http.ResponseWriter
	status int
}

func (w *metricsStatusWriter) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

func normalizeMetricRouteGroup(path string) string {
	trimmed := strings.Trim(path, "/")
	if trimmed == "" {
		return "/"
	}
	parts := strings.Split(trimmed, "/")
	if len(parts) >= 2 && parts[0] == "v1" {
		return "/v1/" + parts[1]
	}
	return "/" + parts[0]
}

// httpMetricsMiddleware enregistre le volume et la latence de chaque requête HTTP.
func httpMetricsMiddleware() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			rec := &metricsStatusWriter{ResponseWriter: w, status: http.StatusOK}
			next.ServeHTTP(rec, r)
			observability.Default().ObserveHTTPRequest(
				r.Method,
				normalizeMetricRouteGroup(r.URL.Path),
				rec.status,
				time.Since(start),
			)
		})
	}
}

// metricsHandler expose les métriques Prometheus sur /metrics derrière le secret interne.
func metricsHandler(internalSecret string) http.HandlerFunc {
	promHandler := observability.Default().Handler()
	return func(w http.ResponseWriter, r *http.Request) {
		if internalSecret == "" {
			response.Unauthorized(w, "Secret interne non configuré")
			return
		}
		provided := strings.TrimSpace(r.Header.Get("x-qoe-internal-secret"))
		if provided == "" {
			if authz := r.Header.Get("Authorization"); strings.HasPrefix(authz, "Bearer ") {
				provided = strings.TrimSpace(strings.TrimPrefix(authz, "Bearer "))
			}
		}
		if subtle.ConstantTimeCompare([]byte(provided), []byte(internalSecret)) != 1 {
			response.Unauthorized(w, "Accès métriques refusé")
			return
		}
		promHandler.ServeHTTP(w, r)
	}
}

func powSecretFromDeps(d RouterDeps) string {
	if s := strings.TrimSpace(d.InternalSecret); s != "" {
		return s
	}
	return strings.TrimSpace(d.JWTSecret)
}

func challengeHandler(secret string) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		if secret == "" {
			response.Error(w, http.StatusServiceUnavailable, "Service de challenge indisponible")
			return
		}
		ch, err := pow.GenerateChallenge(secret, 25000, 5*time.Minute)
		if err != nil {
			response.Internal(w)
			return
		}
		response.OK(w, ch)
	}
}

func isPoWBurstCandidate(r *http.Request) bool {
	if r.Method != http.MethodPost {
		return false
	}
	p := r.URL.Path
	if p == "/v1/support/public/tickets" {
		return true
	}
	return strings.HasPrefix(p, "/v1/users/") && strings.HasSuffix(p, "/subscribe")
}

// requirePoWOnBurst déclenche un challenge Proof-of-Work Altcha adaptatif lors
// d'une rafale sur les formulaires publics sensibles sans bloquer le trafic normal.
func requirePoWOnBurst(rc *redis.Client, secret string, freeBurst int, window time.Duration) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		if rc == nil || secret == "" || freeBurst <= 0 {
			return next
		}
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !isPoWBurstCandidate(r) {
				next.ServeHTTP(w, r)
				return
			}
			key := "rl:pow-burst:" + authmw.ClientIP(r)
			allowed, _, err := authmw.CheckGCRA(r.Context(), rc, key, window, freeBurst)
			if err == nil && allowed {
				next.ServeHTTP(w, r)
				return
			}
			token := strings.TrimSpace(r.Header.Get("X-Qoe-Challenge"))
			if token != "" {
				if verifyErr := pow.VerifyAndConsume(r.Context(), rc, secret, token); verifyErr == nil {
					next.ServeHTTP(w, r)
					return
				}
			}
			ch, chErr := pow.GenerateChallenge(secret, 25000, 5*time.Minute)
			if chErr != nil {
				response.Internal(w)
				return
			}
			observability.Default().IncSecGuardRejection("pow", "CHALLENGE_REQUIRED")
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusPreconditionRequired)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"error":     "Vérification anti-robot requise.",
				"code":      "CHALLENGE_REQUIRED",
				"challenge": ch,
			})
		})
	}
}

func readinessHandler(ready *atomic.Bool, pool *pgxpool.Pool, rc *redis.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if ready != nil && !ready.Load() {
			response.Error(w, http.StatusServiceUnavailable, "Serveur en cours d'arrêt (draining)")
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), time.Second)
		defer cancel()
		if pool != nil {
			if err := pool.Ping(ctx); err != nil {
				response.Error(w, http.StatusServiceUnavailable, "Base de données indisponible")
				return
			}
		}
		if rc != nil {
			if err := rc.Ping(ctx).Err(); err != nil {
				response.Error(w, http.StatusServiceUnavailable, "Redis indisponible")
				return
			}
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ready"}`))
	}
}
