// Package middleware — rate-limiting Redis atomique par algorithme GCRA (Lua).
package middleware

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"net/netip"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"github.com/qoefi/api/internal/observability"
	"github.com/redis/go-redis/v9"
)

const (
	// rateLimitWarnInterval borne la fréquence des logs fail-open quand Redis est joignable mais en erreur.
	rateLimitWarnInterval = 30 * time.Second
	rateLimitedBody       = `{"error":"Trop de requêtes. Réessayez dans un instant."}`
)

var lastRateLimitWarnUnixNano atomic.Int64

// gcraLuaScript implémente l'algorithme GCRA (Generic Cell Rate Algorithm / leaky bucket)
// de façon atomique côté Redis avec une capacité de burst égale à limit sur window.
// Entrées : KEYS[1] = clé Redis, ARGV[1] = fenêtre en microsecondes, ARGV[2] = limite (>= 1).
// Sortie : {allowed (0|1), limit, remaining, resetSeconds, retryAfterSeconds}.
var gcraScript = redis.NewScript(`
local key = KEYS[1]
local window_us = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])

local t = redis.call('TIME')
local now_us = tonumber(t[1]) * 1000000 + tonumber(t[2])

local increment = math.floor(window_us / limit)
if increment < 1 then
	increment = 1
end
local burst_offset = increment * limit

local tat = now_us
local raw = redis.call('GET', key)
if raw then
	local parsed = tonumber(raw)
	if parsed and parsed > tat then
		tat = parsed
	end
end

local new_tat = tat + increment
local allow_at = new_tat - burst_offset
local diff = now_us - allow_at

if diff < 0 then
	local retry_after_us = -diff
	local reset_us = tat - now_us
	if reset_us < 0 then
		reset_us = 0
	end
	local retry_after_s = math.ceil(retry_after_us / 1000000)
	local reset_s = math.ceil(reset_us / 1000000)
	return {0, limit, 0, reset_s, retry_after_s}
end

local reset_us = new_tat - now_us
local ttl_ms = math.ceil(reset_us / 1000)
if ttl_ms < 1 then
	ttl_ms = 1
end
redis.call('SET', key, string.format('%.0f', new_tat), 'PX', ttl_ms)

local remaining = math.floor(diff / increment)
if remaining < 0 then
	remaining = 0
end
local reset_s = math.ceil(reset_us / 1000000)
return {1, limit, remaining, reset_s, 0}
`)

type gcraResult struct {
	Allowed           bool
	Limit             int
	Remaining         int
	ResetSeconds      int
	RetryAfterSeconds int
}

// CheckGCRA exécute une vérification GCRA atomique sur `key` (burst=`limit` sur `window`).
// Utile côté handlers/services pour vérifier plusieurs fenêtres dynamiques (ex. minute + heure).
func CheckGCRA(ctx context.Context, rc *redis.Client, key string, window time.Duration, limit int) (allowed bool, retryAfter int, err error) {
	if rc == nil || window <= 0 || limit <= 0 {
		return true, 0, nil
	}
	if ctx == nil {
		ctx = context.Background()
	}
	res, err := evalGCRA(ctx, rc, key, window, limit)
	if err != nil {
		return false, 0, err
	}
	return res.Allowed, res.RetryAfterSeconds, nil
}

// RateLimit limite à `max` requêtes par `window` (GCRA burst=`max`) pour une clé donnée
// (IP par défaut, ou UID si présent quand scopeByUser vaut true → `rl:{name}:{id}`).
// En cas d'erreur Redis, le middleware applique un fail-open avec log bridé (max 1 / 30s).
func RateLimit(name string, rc *redis.Client, window time.Duration, max int, scopeByUser bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if rc == nil || window <= 0 || max <= 0 {
				next.ServeHTTP(w, r)
				return
			}

			key := ClientIP(r)
			if scopeByUser {
				if uid, ok := UserID(r.Context()); ok && uid != "" {
					key = uid
				}
			}

			redisKey := fmt.Sprintf("rl:%s:%s", name, key)
			serveWithGCRA(w, r, next, rc, name, redisKey, window, max)
		})
	}
}

// RateLimitAPIKey limite à `max` requêtes par `window` PAR CLÉ API
// (qoe_live_…), en plus du limiteur global par IP. Les requêtes non
// authentifiées par clé (JWT, anonymes) passent sans compter ici : elles
// restent couvertes par le limiteur global/protégé. À placer APRÈS
// APIKeyAuth / CombinedAuth pour que l'id de clé soit dans le contexte.
func RateLimitAPIKey(name string, rc *redis.Client, window time.Duration, max int) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if rc == nil || window <= 0 || max <= 0 {
				next.ServeHTTP(w, r)
				return
			}
			keyID, ok := APIKeyID(r.Context())
			if !ok || keyID == "" {
				next.ServeHTTP(w, r)
				return
			}

			redisKey := fmt.Sprintf("rl:%s:key:%s", name, keyID)
			serveWithGCRA(w, r, next, rc, name, redisKey, window, max)
		})
	}
}

// RateLimitDual vérifie indépendamment un seau par utilisateur (ou IP si anonyme)
// ET un seau par sous-réseau (/24 IPv4 ou /64 IPv6). Retourne 429 dès que l'un des
// deux seuils est franchi.
func RateLimitDual(name string, rc *redis.Client, userWin time.Duration, userMax int, subnetWin time.Duration, subnetMax int) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if rc == nil {
				next.ServeHTTP(w, r)
				return
			}

			var (
				hasRes bool
				best   gcraResult
			)

			if userWin > 0 && userMax > 0 {
				actor := "ip:" + ClientIP(r)
				if uid, ok := UserID(r.Context()); ok && uid != "" {
					actor = "uid:" + uid
				}
				userKey := fmt.Sprintf("rl:%s:u:%s", name, actor)
				res, err := evalGCRA(r.Context(), rc, userKey, userWin, userMax)
				if err != nil {
					logRateLimitWarnThrottled(err)
					observability.Default().IncRateLimitDecision(name, "fail_open")
					next.ServeHTTP(w, r)
					return
				}
				if !res.Allowed {
					observability.Default().IncRateLimitDecision(name, "blocked")
					setRateLimitHeaders(w, res)
					writeRateLimited(w, res)
					return
				}
				best = res
				hasRes = true
			}

			if subnetWin > 0 && subnetMax > 0 {
				subnetKey := fmt.Sprintf("rl:%s:sub:%s", name, ClientSubnet(r))
				res, err := evalGCRA(r.Context(), rc, subnetKey, subnetWin, subnetMax)
				if err != nil {
					logRateLimitWarnThrottled(err)
					observability.Default().IncRateLimitDecision(name, "fail_open")
					if hasRes {
						setRateLimitHeaders(w, best)
					}
					next.ServeHTTP(w, r)
					return
				}
				if !res.Allowed {
					observability.Default().IncRateLimitDecision(name, "blocked")
					setRateLimitHeaders(w, res)
					writeRateLimited(w, res)
					return
				}
				if !hasRes || res.Remaining < best.Remaining {
					best = res
					hasRes = true
				}
			}

			observability.Default().IncRateLimitDecision(name, "allowed")
			if hasRes {
				setRateLimitHeaders(w, best)
			}
			next.ServeHTTP(w, r)
		})
	}
}

func serveWithGCRA(w http.ResponseWriter, r *http.Request, next http.Handler, rc *redis.Client, namespace, key string, window time.Duration, max int) {
	res, err := evalGCRA(r.Context(), rc, key, window, max)
	if err != nil {
		logRateLimitWarnThrottled(err)
		observability.Default().IncRateLimitDecision(namespace, "fail_open")
		next.ServeHTTP(w, r)
		return
	}

	setRateLimitHeaders(w, res)
	if !res.Allowed {
		observability.Default().IncRateLimitDecision(namespace, "blocked")
		writeRateLimited(w, res)
		return
	}

	observability.Default().IncRateLimitDecision(namespace, "allowed")
	next.ServeHTTP(w, r)
}

func evalGCRA(ctx context.Context, rc *redis.Client, key string, window time.Duration, limit int) (gcraResult, error) {
	windowUS := window.Microseconds()
	if windowUS < 1 {
		windowUS = 1
	}

	raw, err := gcraScript.Run(ctx, rc, []string{key}, windowUS, limit).Result()
	if err != nil {
		return gcraResult{}, err
	}

	vals, ok := raw.([]any)
	if !ok || len(vals) < 5 {
		return gcraResult{}, fmt.Errorf("réponse GCRA inattendue: %T", raw)
	}

	allowed, err := toInt64(vals[0])
	if err != nil {
		return gcraResult{}, err
	}
	lim, err := toInt64(vals[1])
	if err != nil {
		return gcraResult{}, err
	}
	rem, err := toInt64(vals[2])
	if err != nil {
		return gcraResult{}, err
	}
	resetS, err := toInt64(vals[3])
	if err != nil {
		return gcraResult{}, err
	}
	retryS, err := toInt64(vals[4])
	if err != nil {
		return gcraResult{}, err
	}

	return gcraResult{
		Allowed:           allowed == 1,
		Limit:             int(lim),
		Remaining:         int(rem),
		ResetSeconds:      int(resetS),
		RetryAfterSeconds: int(retryS),
	}, nil
}

func toInt64(v any) (int64, error) {
	switch n := v.(type) {
	case int64:
		return n, nil
	case int:
		return int64(n), nil
	case string:
		return strconv.ParseInt(n, 10, 64)
	default:
		return 0, fmt.Errorf("type entier inattendu: %T", v)
	}
}

func setRateLimitHeaders(w http.ResponseWriter, res gcraResult) {
	w.Header().Set("X-RateLimit-Limit", strconv.Itoa(res.Limit))
	w.Header().Set("X-RateLimit-Remaining", strconv.Itoa(res.Remaining))
	w.Header().Set("X-RateLimit-Reset", strconv.Itoa(res.ResetSeconds))
}

func writeRateLimited(w http.ResponseWriter, res gcraResult) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Retry-After", strconv.Itoa(res.RetryAfterSeconds))
	w.WriteHeader(http.StatusTooManyRequests)
	_, _ = w.Write([]byte(rateLimitedBody))
}

func logRateLimitWarnThrottled(err error) {
	now := time.Now().UnixNano()
	last := lastRateLimitWarnUnixNano.Load()
	if now-last < int64(rateLimitWarnInterval) {
		return
	}
	if lastRateLimitWarnUnixNano.CompareAndSwap(last, now) {
		slog.Warn("[ratelimit] Redis indisponible, fail-open activé", "err", err)
	}
}

// ClientIP extrait l'IP réelle du client. Le middleware doit être placé derrière un
// proxy de confiance qui réécrit ces headers (ou utiliser chi.RealIP).
func ClientIP(r *http.Request) string {
	if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
		parts := strings.Split(fwd, ",")
		if first := strings.TrimSpace(parts[0]); first != "" {
			return first
		}
	}
	if realIP := strings.TrimSpace(r.Header.Get("X-Real-IP")); realIP != "" {
		return realIP
	}
	host := r.RemoteAddr
	if host == "" {
		return "unknown"
	}
	if parsedHost, _, err := net.SplitHostPort(host); err == nil {
		return parsedHost
	}
	return host
}

// clientIP reste un alias interne pour les autres fichiers du package.
func clientIP(r *http.Request) string {
	return ClientIP(r)
}

// ClientSubnet normalise l'IP client vers son sous-réseau CIDR (/24 pour IPv4,
// /64 pour IPv6). Retourne ClientIP(r) tel quel si l'adresse est invalide.
func ClientSubnet(r *http.Request) string {
	raw := ClientIP(r)
	addr, err := netip.ParseAddr(raw)
	if err != nil {
		return raw
	}
	addr = addr.Unmap().WithZone("")
	bits := 64
	if addr.Is4() {
		bits = 24
	}
	return netip.PrefixFrom(addr, bits).Masked().String()
}
