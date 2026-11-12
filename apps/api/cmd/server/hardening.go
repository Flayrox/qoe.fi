package main

import (
	"net/http"
	"strings"
	"time"

	authmw "github.com/qoefi/api/internal/middleware"
	"github.com/redis/go-redis/v9"
)

const (
	defaultBodyLimitBytes  int64 = 256 << 10 // 256 Ko
	richBodyLimitBytes     int64 = 2 << 20   // 2 Mo (articles, site-layout, imports, newsletters, support)
	mediaBodyLimitBytes    int64 = 11 << 20  // 11 Mo (upload créateur 10 Mo + overhead multipart)
	ebookBodyLimitBytes    int64 = 22 << 20  // 22 Mo (upload EPUB 20 Mo + overhead multipart)
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
