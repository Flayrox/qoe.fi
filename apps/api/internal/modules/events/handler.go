// Package events expose les endpoints internes d'émission d'événements
// (enqueue asynq) et de télémétrie entrante (bounces/plaintes Stalwart),
// protégés par un secret partagé.
package events

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/comms"
	"github.com/qoefi/api/internal/observability"
	"github.com/qoefi/api/internal/queue"
	"github.com/qoefi/api/internal/response"
)

type Handler struct {
	client              *asynq.Client
	secret              string
	pool                *pgxpool.Pool
	recordSuppressionFn func(ctx context.Context, email, scope string, publisherID *string, reason, source string) error
}

func NewHandler(client *asynq.Client, secret string) *Handler {
	return &Handler{client: client, secret: secret}
}

// SetPool branche le pool Postgres pour enregistrer les bounces/plaintes dans EmailSuppression.
func (h *Handler) SetPool(pool *pgxpool.Pool) *Handler {
	h.pool = pool
	return h
}

func (h *Handler) Register(r chi.Router) {
	r.Route("/internal/events", func(r chi.Router) {
		r.Use(h.requireSecret)
		r.Post("/article-published", h.articlePublished)
		r.Post("/subscriber-created", h.subscriberCreated)
		r.Post("/mail-events", h.mailEvents)
	})
}

func (h *Handler) requireSecret(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if h.secret == "" {
			response.Forbidden(w, "secret interne non configuré")
			return
		}
		got := r.Header.Get("x-qoe-internal-secret")
		if subtle.ConstantTimeCompare([]byte(got), []byte(h.secret)) != 1 {
			response.Forbidden(w, "secret interne invalide")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// queueUnavailable : sans client asynq (Redis non configuré), les Publish*
// sont des no-op. Répondre « queued: true » ferait croire à l'appelant que
// l'événement est parti alors qu'il est perdu.
func (h *Handler) queueUnavailable(w http.ResponseWriter) bool {
	if h.client != nil {
		return false
	}
	response.Error(w, http.StatusServiceUnavailable, "file d'attente indisponible")
	return true
}

func (h *Handler) articlePublished(w http.ResponseWriter, r *http.Request) {
	var p queue.ArticlePublishedPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if p.ArticleID == "" || p.PublisherID == "" {
		response.BadRequest(w, "articleId et publisherId requis")
		return
	}
	if h.queueUnavailable(w) {
		return
	}
	if err := queue.PublishArticlePublished(h.client, p); err != nil {
		log.Printf("[events] enqueue article.published: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]bool{"queued": true})
}

func (h *Handler) subscriberCreated(w http.ResponseWriter, r *http.Request) {
	var p queue.SubscriberCreatedPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if p.Email == "" || p.PublisherID == "" {
		response.BadRequest(w, "email et publisherId requis")
		return
	}
	if h.queueUnavailable(w) {
		return
	}
	if err := queue.PublishSubscriberCreated(h.client, p); err != nil {
		log.Printf("[events] enqueue subscriber.created: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]bool{"queued": true})
}

type mailEventPayload struct {
	Event       string `json:"event"`
	Email       string `json:"email"`
	Recipient   string `json:"recipient"`
	PublisherID string `json:"publisherId"`
	Source      string `json:"source"`
	Diagnostic  string `json:"diagnostic"`
}

// POST /internal/events/mail-events — ingestion des retours SMTP Stalwart
// (hard bounces, plaintes FBL, désinscriptions) → EmailSuppression idempotente.
func (h *Handler) mailEvents(w http.ResponseWriter, r *http.Request) {
	var p mailEventPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	email := strings.TrimSpace(p.Email)
	if email == "" {
		email = strings.TrimSpace(p.Recipient)
	}
	if email == "" || !strings.Contains(email, "@") {
		response.BadRequest(w, "email invalide")
		return
	}

	ev := strings.ToLower(strings.TrimSpace(p.Event))
	var reason, scope, outcome string
	var pubPtr *string

	switch ev {
	case "hard_bounce", "bounce", "permanent_bounce":
		reason = "hard_bounce"
		scope = "global"
		outcome = "bounced"
	case "complaint", "spam_complaint", "fbl":
		reason = "complaint"
		scope = "global"
		outcome = "complained"
	case "unsubscribe":
		reason = "unsubscribe"
		pubID := strings.TrimSpace(p.PublisherID)
		if pubID != "" {
			scope = "publisher"
			pubPtr = &pubID
		} else {
			scope = "global"
		}
		outcome = "suppressed"
	case "soft_bounce", "delivered", "deferred":
		response.OK(w, map[string]any{"accepted": true, "suppressed": false})
		return
	default:
		response.BadRequest(w, "event mail invalide")
		return
	}

	source := strings.TrimSpace(p.Source)
	if source == "" {
		source = "stalwart_webhook"
	}

	if h.recordSuppressionFn == nil && h.pool == nil {
		response.Error(w, http.StatusServiceUnavailable, "base indisponible")
		return
	}

	var err error
	if h.recordSuppressionFn != nil {
		err = h.recordSuppressionFn(r.Context(), email, scope, pubPtr, reason, source)
	} else {
		err = comms.RecordSuppression(r.Context(), h.pool, email, scope, pubPtr, reason, source)
	}
	if err != nil {
		log.Printf("[events] mail-events record suppression (%s): %v", reason, err)
		response.Internal(w)
		return
	}

	observability.Default().IncEmailDispatch("webhook.mail_event", "stalwart", outcome)
	response.OK(w, map[string]any{
		"accepted":   true,
		"suppressed": true,
		"reason":     reason,
	})
}
