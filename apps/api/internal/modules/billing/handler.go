// Package billing — endpoint webhook Stripe (vérif signature + enqueue asynq).
package billing

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/hibiken/asynq"
	"github.com/qoefi/api/internal/queue"
	"github.com/qoefi/api/internal/response"
)

type Handler struct {
	client        *asynq.Client
	webhookSecret string
}

func NewHandler(client *asynq.Client, webhookSecret string) *Handler {
	return &Handler{client: client, webhookSecret: webhookSecret}
}

// Register enregistre les webhooks ENTRANTS Stripe/Supabase. Routes en
// siblings directs (pas de r.Route("/v1/webhooks")) : le module webhooks de
// gestion monte aussi /v1/webhooks — deux sous-arbres sur le même chemin font
// paniquer chi au démarrage (vérifié par le smoke test du routeur).
func (h *Handler) Register(r chi.Router) {
	r.Post("/v1/webhooks/stripe", h.stripe)
	r.Post("/v1/webhooks/supabase", h.supabase)
}

// verifySignature vérifie le header Stripe-Signature (t=…,v1=…) avec HMAC-SHA256
// + fenêtre anti-replay (le timestamp doit être proche de maintenant).
func (h *Handler) verifySignature(sigHeader string, rawBody []byte) bool {
	if h.webhookSecret == "" || sigHeader == "" {
		return false
	}
	timestamp, signature := parseSigHeader(sigHeader)
	if timestamp == "" || signature == "" {
		return false
	}
	ts, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil {
		return false
	}
	// Anti-replay : un rejeu d'une ancienne requête valide est refusé.
	if diff := time.Now().Unix() - ts; diff < -300 || diff > 300 {
		return false
	}
	payload := timestamp + "." + string(rawBody)
	expected := hmacSHA256(h.webhookSecret, []byte(payload))
	return subtle.ConstantTimeCompare([]byte(signature), []byte(expected)) == 1
}

func parseSigHeader(header string) (timestamp, signature string) {
	for _, part := range strings.Split(header, ",") {
		kv := strings.SplitN(strings.TrimSpace(part), "=", 2)
		if len(kv) != 2 {
			continue
		}
		switch kv[0] {
		case "t":
			timestamp = kv[1]
		case "v1":
			signature = kv[1]
		}
	}
	return
}

func hmacSHA256(secret string, payload []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	return hex.EncodeToString(mac.Sum(nil))
}

func (h *Handler) stripe(w http.ResponseWriter, r *http.Request) {
	rawBody, err := io.ReadAll(r.Body)
	if err != nil {
		response.BadRequest(w, "corps invalide")
		return
	}

	if !h.verifySignature(r.Header.Get("Stripe-Signature"), rawBody) {
		response.Unauthorized(w, "signature Stripe invalide")
		return
	}

	var event struct {
		ID   string         `json:"id"`
		Type string         `json:"type"`
		Data map[string]any `json:"data"`
	}
	if err := json.Unmarshal(rawBody, &event); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if event.ID == "" {
		response.BadRequest(w, "event id requis")
		return
	}

	if err := queue.PublishStripeEvent(h.client, queue.StripeEventPayload{
		EventID:   event.ID,
		EventType: event.Type,
		Data:      event.Data,
	}); err != nil {
		log.Printf("[billing] enqueue stripe event: %v", err)
		response.Internal(w)
		return
	}

	response.OK(w, map[string]bool{"received": true})
}

func (h *Handler) supabase(w http.ResponseWriter, _ *http.Request) {
	response.OK(w, map[string]bool{"received": true})
}
