package features

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/response"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// RegisterProtected monte la mesure d'intérêt des fonctionnalités à venir.
// Routes protégées : l'attribution (créateur / média) vient du jeton, jamais
// du corps de la requête.
func (h *Handler) RegisterProtected(r chi.Router) {
	r.Route("/v1/features", func(r chi.Router) {
		r.Post("/signals", h.record)
		r.Get("/signals/summary", h.summary)
	})
}

type signalRequest struct {
	Feature       string `json:"feature"`
	Kind          string `json:"kind"`
	Source        string `json:"source"`
	PublicationID string `json:"publicationId"`
}

func (h *Handler) record(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	var body signalRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	notified, err := h.svc.Record(r.Context(), userID, SignalInput{
		FeatureKey:    body.Feature,
		Kind:          body.Kind,
		Source:        body.Source,
		PublicationID: body.PublicationID,
	})
	switch {
	case errors.Is(err, ErrInvalidSignal):
		response.ErrorCode(w, http.StatusBadRequest, "invalid_signal", "signal de fonctionnalité invalide")
		return
	case errors.Is(err, ErrForbidden):
		response.Forbidden(w, "Publication inaccessible")
		return
	case err != nil:
		log.Printf("[features] record: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{"success": true, "notified": notified})
}

func (h *Handler) summary(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	publicationID := r.URL.Query().Get("publicationId")
	if publicationID == "" {
		response.BadRequest(w, "publicationId requis")
		return
	}
	signals, err := h.svc.Summary(r.Context(), userID, publicationID)
	switch {
	case errors.Is(err, ErrInvalidSignal):
		response.BadRequest(w, "publicationId requis")
		return
	case errors.Is(err, ErrForbidden):
		response.Forbidden(w, "Permission insuffisante")
		return
	case err != nil:
		log.Printf("[features] summary: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{"signals": signals})
}
