package home

import (
	"encoding/json"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"

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

func (h *Handler) RegisterPublic(r chi.Router) {
	r.Route("/v1/home", func(r chi.Router) {
		r.Get("/config", h.getConfig)
		r.Get("/trends", h.getTrends)
		r.Get("/promos", h.getPromos)
		// Widgets lecteur (auth optionnelle — le cas vectoriel utilise le userID) :
		r.Get("/onboarding", h.getOnboarding)
		r.Get("/suggested-creators", h.getSuggestedCreators)
		r.Get("/semantic-trends", h.getSemanticTrends)
		r.Post("/subscribe", h.subscribe)
	})
}

func (h *Handler) getConfig(w http.ResponseWriter, r *http.Request) {
	cfg, err := h.svc.GetSystemConfig(r.Context())
	if err != nil {
		response.Internal(w)
		return
	}
	response.OK(w, cfg)
}

func (h *Handler) getTrends(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	trends, err := h.svc.GetTrends(r.Context(), limit)
	if err != nil {
		response.Internal(w)
		return
	}
	response.OK(w, trends)
}

func (h *Handler) getPromos(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	promos, err := h.svc.GetPromos(r.Context(), limit)
	if err != nil {
		response.Internal(w)
		return
	}
	response.OK(w, promos)
}

// GET /v1/home/onboarding — catégories + créateurs suggérés pour l'onboarding.
func (h *Handler) getOnboarding(w http.ResponseWriter, r *http.Request) {
	response.OK(w, h.svc.GetOnboardingData(r.Context()))
}

// GET /v1/home/suggested-creators — créateurs recommandés (similarité
// vectorielle si connecté, cold-start sinon). ?limit=N
func (h *Handler) getSuggestedCreators(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	creators, err := h.svc.GetSuggestedCreators(r.Context(), userID, limit)
	if err != nil {
		log.Printf("[home] suggested-creators: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, creators)
}

// GET /v1/home/semantic-trends — tendances sémantiques (croissance par catégorie).
func (h *Handler) getSemanticTrends(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	trends, err := h.svc.GetSemanticTrends(r.Context(), limit)
	if err != nil {
		log.Printf("[home] semantic-trends: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, trends)
}

// POST /v1/home/subscribe — inscription newsletter d'une publication (public).
// Body : { email, publicationId }. Idempotent (upsert isActive=true).
func (h *Handler) subscribe(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email         string `json:"email"`
		PublicationID string `json:"publicationId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	body.Email = strings.TrimSpace(strings.ToLower(body.Email))
	if body.Email == "" || body.PublicationID == "" {
		response.BadRequest(w, "email et publicationId requis")
		return
	}
	emailRegex := regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)
	if !emailRegex.MatchString(body.Email) {
		response.BadRequest(w, "Veuillez saisir une adresse email valide.")
		return
	}
	if _, err := h.svc.SubscribeToNewsletter(r.Context(), body.Email, body.PublicationID); err != nil {
		log.Printf("[home] subscribe: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}
