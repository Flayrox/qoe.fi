// Handler HTTP des feature flags — expose GET /v1/flags (public).
// L'UI (web/studio/admin) lit les mêmes flags via @qoe/flags ; cet endpoint
// sert aux widgets et intégrations tierces. Quand une clé de signature est
// configurée (FLAGS_SIGNING_KEY), le body `{flags, ts}` est signé HMAC-SHA256
// (header X-Flags-Signature sur `ts + "." + body brut`) : le widget vérifie
// l'authenticité et la fraîcheur sans accès Supabase, sans ré-sérialiser le
// JSON (la signature couvre les octets exacts reçus). Sans clé, la réponse
// reste le simple objet `{flag: bool, …}` (rétro-compatible).
package flags

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/response"
)

type Handler struct {
	svc *Service
	// signingKey signe la réponse (vide = réponse non signée).
	signingKey string
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// WithSigningKey active la signature HMAC de la réponse.
func (h *Handler) WithSigningKey(key string) *Handler {
	h.signingKey = key
	return h
}

// RegisterPublic monte GET /v1/flags (public, sans auth — les flags UI sont
// déjà exposés au client via @qoe/flags ; rien de sensible ici).
func (h *Handler) RegisterPublic(r chi.Router) {
	r.Get("/v1/flags", h.list)
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	all := h.svc.All(r.Context())
	if h.signingKey == "" {
		response.OK(w, all)
		return
	}
	ts := time.Now().Unix()
	body, err := json.Marshal(map[string]any{"flags": all, "ts": ts})
	if err != nil {
		response.Internal(w)
		return
	}
	// La signature couvre `ts + "." + body brut` : le widget vérifie les
	// octets exacts reçus (aucune ré-sérialisation canonique nécessaire).
	sig := SignFlagsPayload(body, ts, h.signingKey)
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Flags-Signature", sig)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

// SignFlagsPayload calcule HMAC-SHA256(clé, "<ts>.<body brut>") hexadécimal.
// Le timestamp est inclus pour limiter le rejeu (le vérificateur exige une
// fraîcheur raisonnable).
func SignFlagsPayload(body []byte, ts int64, key string) string {
	mac := hmac.New(sha256.New, []byte(key))
	_, _ = mac.Write([]byte(fmt.Sprintf("%d.", ts)))
	_, _ = mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

// VerifyFlagsPayload vérifie la signature d'une réponse /v1/flags (octets
// bruts du body + timestamp extrait) et que le timestamp n'est pas trop vieux
// (maxAge). À utiliser côté widget/intégration.
func VerifyFlagsPayload(body []byte, ts int64, sig, key string, maxAge time.Duration) bool {
	if key == "" || sig == "" {
		return false
	}
	want := SignFlagsPayload(body, ts, key)
	if !hmac.Equal([]byte(want), []byte(sig)) {
		return false
	}
	now := time.Now().Unix()
	return ts <= now && now-ts <= int64(maxAge.Seconds())
}
