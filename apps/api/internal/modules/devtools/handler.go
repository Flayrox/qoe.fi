package devtools

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/response"
)

// Handler expose le panneau de dev local.
type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// Register enregistre les routes devtools (groupe protégé JWT, superadmin).
func (h *Handler) Register(r chi.Router) {
	r.Get("/v1/devtools/data", h.data)
	r.Post("/v1/devtools/create-user", h.createUser)
	r.Post("/v1/devtools/generate-posts", h.generatePosts)
	r.Post("/v1/devtools/reset", h.reset)
	r.Post("/v1/devtools/seed", h.seed)
	r.Post("/v1/devtools/simulate-subscriber", h.simulateSubscriber)
	r.Post("/v1/devtools/simulate-follow", h.simulateFollow)
	r.Post("/v1/devtools/simulate-like", h.simulateLike)
	r.Post("/v1/devtools/add-funds", h.addFunds)
	r.Post("/v1/devtools/reset-onboarding", h.resetOnboarding)
	r.Get("/v1/devtools/user-by-email", h.userByEmail)
	r.Post("/v1/devtools/reindex", h.reindex)
	r.Post("/v1/devtools/seed-top", h.seedTop)
	r.Post("/v1/devtools/seed-top-complete", h.seedTopComplete)
}

func (h *Handler) requireSuperadmin(w http.ResponseWriter, r *http.Request) (string, bool) {
	userID, ok := middleware.UserID(r.Context())
	if !ok || userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return "", false
	}
	return userID, true
}

func (h *Handler) handleErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, errForbidden):
		response.Forbidden(w, "Accès réservé au superadmin.")
	case errors.Is(err, pgx.ErrNoRows):
		response.NotFound(w, "Introuvable.")
	default:
		log.Printf("[devtools] %v", err)
		response.Internal(w)
	}
}

// GET /v1/devtools/data — compteurs + utilisateurs.
func (h *Handler) data(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	data, err := h.svc.Data(r.Context(), userID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, data)
}

// POST /v1/devtools/create-user — créateur + publication + pack de départ.
func (h *Handler) createUser(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	var p CreateUserParams
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if err := h.svc.CreateUser(r.Context(), userID, p); err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// POST /v1/devtools/generate-posts — 15 pensées de démo.
func (h *Handler) generatePosts(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	if err := h.svc.GeneratePosts(r.Context(), userID); err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// POST /v1/devtools/reset — vide la base + configs par défaut.
func (h *Handler) reset(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	if err := h.svc.Reset(r.Context(), userID); err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// POST /v1/devtools/seed — seed canonique Go (internal/seed).
func (h *Handler) seed(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	if err := h.svc.Seed(r.Context(), userID); err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// POST /v1/devtools/simulate-subscriber — abonné CRM (+ crédits si premium).
func (h *Handler) simulateSubscriber(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	var p SimulateSubscriberParams
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if err := h.svc.SimulateSubscriber(r.Context(), userID, p); err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// POST /v1/devtools/simulate-follow — liaison lecteur → publication.
func (h *Handler) simulateFollow(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	var p struct {
		ReaderID      string `json:"readerId"`
		PublicationID string `json:"publicationId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if err := h.svc.SimulateFollow(r.Context(), userID, p.ReaderID, p.PublicationID); err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// POST /v1/devtools/simulate-like — toggle like.
func (h *Handler) simulateLike(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	var p struct {
		PostID string `json:"postId"`
		UserID string `json:"userId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	liked, err := h.svc.SimulateLike(r.Context(), userID, p.PostID, p.UserID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]any{"success": true, "liked": liked})
}

// POST /v1/devtools/add-funds — ajustement de portefeuille.
func (h *Handler) addFunds(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	var p struct {
		UserID      string `json:"userId"`
		AmountCents int    `json:"amountCents"`
	}
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	balance, err := h.svc.AddFunds(r.Context(), userID, p.UserID, p.AmountCents)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]any{"success": true, "balanceCents": balance})
}

// POST /v1/devtools/reset-onboarding — reset de l'onboarding (cible optionnelle).
func (h *Handler) resetOnboarding(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	var p struct {
		Target string `json:"target"`
	}
	_ = json.NewDecoder(r.Body).Decode(&p)
	if err := h.svc.ResetOnboarding(r.Context(), userID, p.Target); err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// POST /v1/devtools/seed-top — régénère la DB top du top (déterministe).
func (h *Handler) seedTop(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	res, err := h.svc.SeedTop(r.Context(), userID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, res)
}

// POST /v1/devtools/seed-top-complete — base complète reset + enrichissement.
func (h *Handler) seedTopComplete(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	res, err := h.svc.SeedTopComplete(r.Context(), userID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, res)
}

// POST /v1/devtools/reindex — re-synchronise l'index Meilisearch (backfill).
func (h *Handler) reindex(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	res, err := h.svc.Reindex(r.Context(), userID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, res)
}

// GET /v1/devtools/user-by-email — lookup pour l'impersonation.
func (h *Handler) userByEmail(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	email := r.URL.Query().Get("email")
	if email == "" {
		response.BadRequest(w, "paramètre email requis")
		return
	}
	user, err := h.svc.UserByEmail(r.Context(), userID, email)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, user)
}
