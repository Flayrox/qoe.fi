// Package middleware — rate-limiting Redis (fenêtre fixe, par IP + par user).
package middleware

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

// RateLimit limite à `max` requêtes par `window` pour une clé donnée
// (IP par défaut, ou UID si présent → `rl:{key}:{window}:{id}`).
func RateLimit(rc *redis.Client, window time.Duration, max int, scopeByUser bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if rc == nil {
				next.ServeHTTP(w, r)
				return
			}

			var key string
			if scopeByUser {
				if uid, ok := UserID(r.Context()); ok && uid != "" {
					key = uid
				} else {
					key = clientIP(r)
				}
			} else {
				key = clientIP(r)
			}

			bucket := time.Now().Unix() / int64(window.Seconds())
			redisKey := fmt.Sprintf("rl:%s:%d", key, bucket)
			ctx := context.Background()

			count, err := rc.Incr(ctx, redisKey).Result()
			if err == nil {
				if count == 1 {
					_ = rc.Expire(ctx, redisKey, window).Err()
				}
				if count > int64(max) {
					w.Header().Set("Content-Type", "application/json")
					w.Header().Set("Retry-After", strconv.Itoa(int(window.Seconds())))
					w.WriteHeader(http.StatusTooManyRequests)
					_, _ = w.Write([]byte(`{"error":"Trop de requêtes. Réessayez dans un instant."}`))
					return
				}
			}

			next.ServeHTTP(w, r)
		})
	}
}

// clientIP extrait l'IP réelle (RealIP header si derrière un proxy).
func clientIP(r *http.Request) string {
	if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
		parts := strings.Split(fwd, ",")
		return strings.TrimSpace(parts[0])
	}
	if r.Header.Get("X-Real-IP") != "" {
		return r.Header.Get("X-Real-IP")
	}
	host := r.RemoteAddr
	if i := strings.LastIndex(host, ":"); i != -1 {
		return host[:i]
	}
	return host
}
