// Middlewares génériques : CORS, durcissement transport, récupération de panique, logging.
package middleware

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net/http"
	"runtime/debug"
	"strconv"
	"strings"
	"time"

	"github.com/qoefi/api/internal/logging"
)

// GetRequestID renvoie l'identifiant de corrélation attaché à la requête.
func GetRequestID(ctx context.Context) string {
	return logging.RequestIDFromContext(ctx)
}

// RequestID propage X-Request-Id (sanitisé) ou génère un identifiant aléatoire
// injecté dans le contexte et renvoyé dans la réponse HTTP.
func RequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := sanitizeRequestID(r.Header.Get("X-Request-Id"))
		if id == "" {
			var b [12]byte
			_, _ = rand.Read(b[:])
			id = hex.EncodeToString(b[:])
		}
		w.Header().Set("X-Request-Id", id)
		ctx := logging.WithRequestID(r.Context(), id)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func sanitizeRequestID(raw string) string {
	raw = strings.TrimSpace(raw)
	if len(raw) == 0 || len(raw) > 64 {
		return ""
	}
	for i := 0; i < len(raw); i++ {
		c := raw[i]
		if !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-' || c == '_') {
			return ""
		}
	}
	return raw
}

// SecurityHeaders ajoute les en-têtes de durcissement HTTP sur chaque réponse.
func SecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		next.ServeHTTP(w, r)
	})
}

// MaxBodyBytes plafonne la taille du corps de requête sur les méthodes avec payload
// (POST, PUT, PATCH) via http.MaxBytesReader.
func MaxBodyBytes(limit int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch r.Method {
			case http.MethodPost, http.MethodPut, http.MethodPatch:
				if r.Body != nil {
					r.Body = http.MaxBytesReader(w, r.Body, limit)
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

// IsBodyTooLarge indique si l'erreur correspond à un dépassement de MaxBodyBytes.
func IsBodyTooLarge(err error) bool {
	var maxBytesErr *http.MaxBytesError
	return errors.As(err, &maxBytesErr)
}

// ClampLimit parse un entier strictement positif borné entre 1 et maxLimit,
// et renvoie defaultLimit si la valeur est invalide ou <= 0.
func ClampLimit(raw string, defaultLimit, maxLimit int) int {
	n, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || n <= 0 {
		return defaultLimit
	}
	if maxLimit > 0 && n > maxLimit {
		return maxLimit
	}
	return n
}

// Recovery récupère les paniques et répond 500 au lieu de faire tomber le serveur.
func Recovery(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				// La pile est indispensable : sans elle, un 500 silencieux
				// (nil pointer dans un handler) est indébogable en prod.
				logging.FromContext(r.Context()).Error(
					"panic recovered", "panic", rec, "method", r.Method, "path", r.URL.Path,
					"stack", string(debug.Stack()),
				)
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusInternalServerError)
				_, _ = w.Write([]byte(`{"error":"Internal Server Error"}`))
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// CORS autorise les origines configurées (défaut : localhost dev + qoefi).
func CORS(allowedOrigins []string) func(http.Handler) http.Handler {
	originSet := map[string]bool{}
	for _, o := range allowedOrigins {
		originSet[o] = true
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if originAllowed(origin, originSet, allowedOrigins) {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Vary", "Origin")
			}
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Qoe-Signature, X-Qoe-Challenge, X-Request-Id, Idempotency-Key")
			w.Header().Set("Access-Control-Expose-Headers", "X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After, X-Request-Id")
			w.Header().Set("Access-Control-Max-Age", "86400")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func originAllowed(origin string, exact map[string]bool, allowed []string) bool {
	if origin == "" || len(allowed) == 0 {
		return len(allowed) == 0
	}
	if exact[origin] {
		return true
	}
	for _, pattern := range allowed {
		star := strings.IndexByte(pattern, '*')
		if star < 0 {
			continue
		}
		prefix, suffix := pattern[:star], pattern[star+1:]
		if strings.HasPrefix(origin, prefix) && strings.HasSuffix(origin, suffix) {
			middle := origin[len(prefix) : len(origin)-len(suffix)]
			if middle != "" && !strings.ContainsAny(middle, "/:.") {
				return true
			}
		}
	}
	return false
}

// Logger journalise méthode, chemin, statut, durée et identifiant de corrélation.
func Logger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		logging.FromContext(r.Context()).Info("http request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", rec.status,
			"duration_ms", time.Since(start).Milliseconds(),
		)
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}
