package middleware

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"time"

	"github.com/redis/go-redis/v9"
)

// IdempotencyKeyHeader est l'en-tête porteur de la clé d'idempotence
// (réessais CMS sûrs : un POST/PATCH rejoué ne duplique pas l'article).
const IdempotencyKeyHeader = "Idempotency-Key"

// idempotencyProcessing marque une requête en cours (verrou anti-double-envoi).
const idempotencyProcessing = "processing"

// idempotencyLockTTL est la durée du verrou : au-delà, un rejeu concurrent
// repart en 409 au lieu de dupliquer.
const idempotencyLockTTL = 30 * time.Second

// idempotencyEntry est la réponse mise en cache pour un rejeu.
type idempotencyEntry struct {
	Status  int               `json:"status"`
	Body    []byte            `json:"body"`
	Headers map[string]string `json:"headers,omitempty"`
}

// Idempotency rend les mutations idempotentes via l'en-tête Idempotency-Key :
// le premier appel exécute la requête et met en cache la réponse (statut +
// corps) ; les appels suivants avec la même clé (même acteur + méthode +
// chemin) rejouent la réponse sans ré-exécuter. Les réponses 5xx ne sont
// PAS mises en cache : le client peut réessayer avec la même clé. Un verrou
// Redis court (SETNX) protège contre le double-envoi concurrent (409).
//
// La clé de cache est liée à l'acteur (clé API → id de clé, sinon UID, sinon
// IP) + méthode + chemin + Idempotency-Key : une même clé ne peut pas être
// « empruntée » par un autre créateur, ni rejouée sur une autre route.
func Idempotency(rc *redis.Client, ttl time.Duration) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if rc == nil || !isMutatingMethod(r.Method) {
				next.ServeHTTP(w, r)
				return
			}
			key := r.Header.Get(IdempotencyKeyHeader)
			if key == "" {
				next.ServeHTTP(w, r)
				return
			}
			cacheKey := idempotencyCacheKey(r)
			lockKey := cacheKey + ":lock"
			ctx := r.Context()

			// 1) Rejeu d'une réponse déjà mémorisée.
			if raw, err := rc.Get(ctx, cacheKey).Bytes(); err == nil {
				var entry idempotencyEntry
				if json.Unmarshal(raw, &entry) == nil && entry.Status > 0 {
					for k, v := range entry.Headers {
						w.Header().Set(k, v)
					}
					w.WriteHeader(entry.Status)
					_, _ = w.Write(entry.Body)
					return
				}
			}

			// 2) Verrou anti-double-envoi (30 s — durée max raisonnable d'un
			// POST/PATCH d'article ; les plus lents repartent en 409). Clé
			// distincte de la réponse : le rejeu lit cacheKey, jamais le verrou.
			locked, err := rc.SetNX(ctx, lockKey, idempotencyProcessing, idempotencyLockTTL).Result()
			if err != nil || !locked {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusConflict)
				_, _ = w.Write([]byte(`{"error":"Une requête avec cette Idempotency-Key est déjà en cours."}`))
				return
			}
			defer func() { _ = rc.Del(context.Background(), lockKey) }()

			// 3) Exécution + capture de la réponse.
			rec := &idempotencyRecorder{ResponseWriter: w, body: &bytes.Buffer{}}
			next.ServeHTTP(rec, r)

			if rec.status == 0 || rec.status >= 500 {
				return // Handler muet ou erreur serveur → pas de cache (réessai possible).
			}
			entry := idempotencyEntry{Status: rec.status, Body: rec.body.Bytes()}
			if ct := rec.Header().Get("Content-Type"); ct != "" {
				entry.Headers = map[string]string{"Content-Type": ct}
			}
			if raw, err := json.Marshal(entry); err == nil {
				_ = rc.Set(ctx, cacheKey, raw, ttl).Err()
			}
		})
	}
}

// idempotencyRecorder capture le statut + corps de la réponse sans bloquer
// l'écriture vers le client.
type idempotencyRecorder struct {
	http.ResponseWriter
	status int
	body   *bytes.Buffer
}

func (r *idempotencyRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

func (r *idempotencyRecorder) Write(b []byte) (int, error) {
	if r.status == 0 {
		r.status = http.StatusOK
	}
	_, _ = r.body.Write(b)
	return r.ResponseWriter.Write(b)
}

func isMutatingMethod(m string) bool {
	return m == http.MethodPost || m == http.MethodPut || m == http.MethodPatch || m == http.MethodDelete
}

// idempotencyCacheKey construit la clé Redis : acteur (clé API > UID > IP) +
// méthode + chemin + Idempotency-Key, hashée SHA-256.
func idempotencyCacheKey(r *http.Request) string {
	actor := clientIP(r)
	if kid, ok := APIKeyID(r.Context()); ok && kid != "" {
		actor = "key:" + kid
	} else if uid, ok := UserID(r.Context()); ok && uid != "" {
		actor = "user:" + uid
	}
	raw := actor + "\n" + r.Method + "\n" + r.URL.Path + "\n" + r.Header.Get(IdempotencyKeyHeader)
	sum := sha256.Sum256([]byte(raw))
	return "idem:" + hex.EncodeToString(sum[:])
}
