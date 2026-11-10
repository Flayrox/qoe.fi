package features

import (
	"encoding/json"
	"errors"
	"fmt"
	"html"
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

// RegisterProtected monte la mesure d'intérêt et les préférences de promesse.
// Routes protégées : l'attribution (créateur / média) vient du jeton, jamais
// du corps de la requête.
func (h *Handler) RegisterProtected(r chi.Router) {
	r.Route("/v1/features", func(r chi.Router) {
		r.Post("/signals", h.record)
		r.Get("/signals/summary", h.summary)
		r.Get("/signals/state", h.state)
		r.Get("/catalog", h.catalog)
		r.Post("/interests/unsubscribe", h.unsubscribeOwn)
	})
}

// RegisterPublic monte le retrait depuis un email : GET pour la page lisible,
// POST pour le one-click RFC 8058. Aucun email dans l'URL, seulement un jeton
// signé.
func (h *Handler) RegisterPublic(r chi.Router) {
	r.Get("/v1/features/unsubscribe", h.unsubscribePublic)
	r.Post("/v1/features/unsubscribe", h.unsubscribePublic)
}

type signalRequest struct {
	Feature       string `json:"feature"`
	Kind          string `json:"kind"`
	Source        string `json:"source"`
	PublisherID string `json:"publisherId"`
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
		PublisherID: body.PublisherID,
	})
	switch {
	case errors.Is(err, ErrInvalidSignal):
		response.ErrorCode(w, http.StatusBadRequest, "invalid_signal", "signal de fonctionnalité invalide")
		return
	case errors.Is(err, ErrForbidden):
		response.Forbidden(w, "Publisher inaccessible")
		return
	case errors.Is(err, ErrFeatureUnavailable):
		response.ErrorCode(w, http.StatusConflict, "notify_closed", "les notifications sont fermées pour cette fonctionnalité")
		return
	case err != nil:
		log.Printf("[features] record: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{"success": true, "notified": notified})
}

// state renvoie les fonctionnalités déjà demandées par l'appelant, pour que
// l'annonce n'affiche pas « me prévenir » après un rechargement de page.
func (h *Handler) state(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	features, err := h.svc.NotifiedFeatures(r.Context(), userID)
	if err != nil {
		log.Printf("[features] state: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{"features": features})
}

// catalog expose l'état serveur : le client peut masquer une promesse que le
// serveur refuserait (paused, retired, notifyEnabled=false).
func (h *Handler) catalog(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	features, err := h.svc.States(r.Context(), userID)
	if err != nil {
		log.Printf("[features] catalog: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{"features": features})
}

func (h *Handler) summary(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	publisherID := r.URL.Query().Get("publisherId")
	if publisherID == "" {
		response.BadRequest(w, "publisherId requis")
		return
	}
	signals, err := h.svc.Summary(r.Context(), userID, publisherID)
	switch {
	case errors.Is(err, ErrInvalidSignal):
		response.BadRequest(w, "publisherId requis")
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

func (h *Handler) unsubscribeOwn(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	var body struct {
		Feature string `json:"feature"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Feature == "" {
		response.BadRequest(w, "JSON invalide (feature requise)")
		return
	}
	if err := h.svc.UnsubscribeForUser(r.Context(), userID, body.Feature); err != nil {
		if errors.Is(err, ErrFeatureUnavailable) {
			response.NotFound(w, "Aucune promesse active pour cette fonctionnalité")
			return
		}
		log.Printf("[features] unsubscribe own: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

func (h *Handler) unsubscribePublic(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	featureKey, err := h.svc.Unsubscribe(r.Context(), token)
	if err != nil {
		if errors.Is(err, ErrUnsubscribeInvalid) {
			response.BadRequest(w, "Lien de désabonnement invalide ou expiré")
			return
		}
		log.Printf("[features] unsubscribe public: %v", err)
		response.Internal(w)
		return
	}
	if r.Method == http.MethodPost {
		response.OK(w, map[string]any{"success": true, "feature": featureKey})
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = fmt.Fprintf(w, `<!doctype html><html lang="fr"><meta charset="utf-8"><title>Désabonnement</title><body style="font-family:system-ui;max-width:42rem;margin:4rem auto;padding:0 1rem"><h1>C'est noté.</h1><p>Vous ne recevrez plus d'email de lancement pour <strong>%s</strong>.</p><p>You will no longer receive launch emails for this feature.</p></body></html>`, html.EscapeString(featureKey))
}
