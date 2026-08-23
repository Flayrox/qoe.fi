package users

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/response"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) Register(r chi.Router) {
	r.Route("/v1/users", func(r chi.Router) {
		r.Get("/search", h.search)
	})
	// Profil lecteur (auth requise) — GET /v1/me, PATCH /v1/me/profile.
	r.Get("/v1/me", h.me)
	r.Patch("/v1/me/profile", h.updateProfile)
}

// GET /v1/me — profil lecteur complet (remplace getRequestDbUser Prisma).
func (h *Handler) me(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	profile, err := h.svc.Profile(r.Context(), userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Utilisateur introuvable")
			return
		}
		response.Internal(w)
		return
	}
	response.OK(w, profile)
}

type profilePatch struct {
	Name           *string `json:"name"`
	Username       *string `json:"username"`
	OnboardingText *string `json:"onboardingText"`
	LogoURL        *string `json:"logoUrl"`
	Pronouns       *string `json:"pronouns"`
}

// PATCH /v1/me/profile — mise à jour du profil lecteur (profil réglages).
func (h *Handler) updateProfile(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	var patch profilePatch
	if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	profile, err := h.svc.UpdateProfile(r.Context(), userID,
		deref(patch.Name), deref(patch.Username), deref(patch.OnboardingText),
		deref(patch.LogoURL), deref(patch.Pronouns))
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(w, profile)
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func (h *Handler) search(w http.ResponseWriter, r *http.Request) {
	_, _ = middleware.UserID(r.Context())
	query := r.URL.Query().Get("q")
	if len(query) < 2 {
		response.OK(w, []Contributor{})
		return
	}
	// excludeIds: comma-separated ?excludeIds=id1,id2 ou répété ?excludeIds=id1&excludeIds=id2
	var excludeIds []string
	for _, v := range r.URL.Query()["excludeIds"] {
		if v == "" {
			continue
		}
		// support JSON array string
		var arr []string
		if err := json.Unmarshal([]byte(v), &arr); err == nil && len(arr) > 0 {
			excludeIds = append(excludeIds, arr...)
			continue
		}
		// comma-separated
		for _, part := range splitComma(v) {
			if part != "" {
				excludeIds = append(excludeIds, part)
			}
		}
	}
	for _, v := range r.URL.Query()["excludeId"] {
		if v != "" {
			excludeIds = append(excludeIds, v)
		}
	}
	results, err := h.svc.SearchForContributors(r.Context(), query, excludeIds)
	if err != nil {
		response.Internal(w)
		return
	}
	response.OK(w, results)
}

func splitComma(s string) []string {
	var out []string
	start := 0
	for i := 0; i <= len(s); i++ {
		if i == len(s) || s[i] == ',' {
			out = append(out, s[start:i])
			start = i + 1
		}
	}
	return out
}
