// Package events expose les endpoints internes d'émission d'événements
// (enqueue asynq), protégés par un secret partagé.
package events

import (
	"crypto/subtle"
	"encoding/json"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/hibiken/asynq"
	"github.com/qoefi/api-go/internal/queue"
	"github.com/qoefi/api-go/internal/response"
)

type Handler struct {
	client *asynq.Client
	secret string
}

func NewHandler(client *asynq.Client, secret string) *Handler {
	return &Handler{client: client, secret: secret}
}

func (h *Handler) Register(r chi.Router) {
	r.Route("/internal/events", func(r chi.Router) {
		r.Use(h.requireSecret)
		r.Post("/article-published", h.articlePublished)
		r.Post("/subscriber-created", h.subscriberCreated)
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

func (h *Handler) articlePublished(w http.ResponseWriter, r *http.Request) {
	var p queue.ArticlePublishedPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if p.ArticleID == "" || p.PublicationID == "" {
		response.BadRequest(w, "articleId et publicationId requis")
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
	if p.Email == "" || p.PublicationID == "" {
		response.BadRequest(w, "email et publicationId requis")
		return
	}
	if err := queue.PublishSubscriberCreated(h.client, p); err != nil {
		log.Printf("[events] enqueue subscriber.created: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]bool{"queued": true})
}
