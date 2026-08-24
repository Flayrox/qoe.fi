// Middlewares génériques : CORS, récupération de panique, logging.
package middleware

import (
	"log"
	"net/http"
	"strings"
	"time"
)

// Recovery récupère les paniques et répond 500 au lieu de faire tomber le serveur.
func Recovery(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				log.Printf("[panic] %v", rec)
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusInternalServerError)
				_, _ = w.Write([]byte(`{"error":"Internal Server Error"}`))
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// CORS autorise les origines configurées (défaut : localhost dev + qoe.fi).
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
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Qoe-Signature")
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

// Logger journalise méthode, chemin, statut et durée.
func Logger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		log.Printf("%s %s %d %s", r.Method, r.URL.Path, rec.status, time.Since(start))
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
