package media

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/response"
)

// Handler expose les endpoints de gestion des Médias (studio).
type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// Register monte les routes média (auth JWT requise).
func (h *Handler) Register(r chi.Router) {
	r.Route("/v1/media", func(r chi.Router) {
		r.Get("/workspaces", h.listWorkspaces)
		r.Get("/", h.listMedia)
		r.Post("/", h.createMedia)
		r.Get("/{id}", h.getMedia)
		r.Patch("/{id}/settings", h.updateSettings)
		r.Post("/{id}/invites", h.inviteMember)
		r.Patch("/{id}/members/{userId}", h.updateMemberRole)
		r.Patch("/{id}/members/{userId}/permissions", h.updateMemberPermissions)
		r.Delete("/{id}/members/{userId}", h.removeMember)
		r.Post("/invites/{token}/accept", h.acceptInvite)
	})
}

func userID(r *http.Request) string {
	id, _ := middleware.UserID(r.Context())
	return id
}

func writeErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, errForbidden):
		response.Forbidden(w, "Permission insuffisante")
	case errors.Is(err, errNotFound):
		response.NotFound(w, "Ressource introuvable")
	default:
		log.Printf("[media] %v", err)
		response.Error(w, http.StatusBadRequest, err.Error())
	}
}

// GET /v1/media/workspaces — profil personnel + médias de l'utilisateur.
func (h *Handler) listWorkspaces(w http.ResponseWriter, r *http.Request) {
	id := userID(r)
	if id == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	out, err := h.svc.ListWorkspaces(r.Context(), id)
	if err != nil {
		writeErr(w, err)
		return
	}
	response.OK(w, out)
}

// GET /v1/media — médias de l'utilisateur (avec compteurs).
func (h *Handler) listMedia(w http.ResponseWriter, r *http.Request) {
	id := userID(r)
	if id == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	items, err := h.svc.ListMedia(r.Context(), id)
	if err != nil {
		writeErr(w, err)
		return
	}
	response.OK(w, map[string]any{"medias": items})
}

// POST /v1/media — crée un Média (publication + membre owner).
func (h *Handler) createMedia(w http.ResponseWriter, r *http.Request) {
	id := userID(r)
	if id == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	var in struct {
		Name     string `json:"name"`
		Slug     string `json:"slug"`
		Bio      string `json:"bio"`
		LogoURL  string `json:"logoUrl"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	out, err := h.svc.CreateMedia(r.Context(), id, in.Name, in.Slug, in.Bio, in.LogoURL)
	if err != nil {
		writeErr(w, err)
		return
	}
	response.Created(w, out)
}

// GET /v1/media/{id} — détail complet d'un média (membre requis).
func (h *Handler) getMedia(w http.ResponseWriter, r *http.Request) {
	id := userID(r)
	if id == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	detail, myRole, err := h.svc.GetMedia(r.Context(), id, chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, err)
		return
	}
	response.OK(w, map[string]any{"media": detail, "myRole": myRole})
}

// PATCH /v1/media/{id}/settings — réglages (identity, design, SEO).
func (h *Handler) updateSettings(w http.ResponseWriter, r *http.Request) {
	id := userID(r)
	if id == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	publication, err := h.svc.UpdateSettings(r.Context(), id, chi.URLParam(r, "id"), body)
	if err != nil {
		writeErr(w, err)
		return
	}
	response.OK(w, map[string]any{"success": true, "publication": publication})
}

// POST /v1/media/{id}/invites — invite un rédacteur par email.
func (h *Handler) inviteMember(w http.ResponseWriter, r *http.Request) {
	id := userID(r)
	if id == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	var in struct {
		Email string `json:"email"`
		Role  string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	out, err := h.svc.InviteMember(r.Context(), id, chi.URLParam(r, "id"), in.Email, in.Role)
	if err != nil {
		writeErr(w, err)
		return
	}
	response.OK(w, out)
}

// POST /v1/media/invites/{token}/accept — accepte une invitation.
func (h *Handler) acceptInvite(w http.ResponseWriter, r *http.Request) {
	id := userID(r)
	if id == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	mediaID, err := h.svc.AcceptInvite(r.Context(), id, chi.URLParam(r, "token"))
	if err != nil {
		writeErr(w, err)
		return
	}
	response.OK(w, map[string]any{"success": true, "mediaId": mediaID})
}

// PATCH /v1/media/{id}/members/{userId} — change le rôle d'un membre.
func (h *Handler) updateMemberRole(w http.ResponseWriter, r *http.Request) {
	id := userID(r)
	if id == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	var in struct {
		Role string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if err := h.svc.UpdateMemberRole(r.Context(), id, chi.URLParam(r, "id"), chi.URLParam(r, "userId"), in.Role); err != nil {
		writeErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// PATCH /v1/media/{id}/members/{userId}/permissions — permissions granulaires.
func (h *Handler) updateMemberPermissions(w http.ResponseWriter, r *http.Request) {
	id := userID(r)
	if id == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	var in struct {
		Permissions []string `json:"permissions"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if err := h.svc.UpdateMemberPermissions(r.Context(), id, chi.URLParam(r, "id"), chi.URLParam(r, "userId"), in.Permissions); err != nil {
		writeErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// DELETE /v1/media/{id}/members/{userId} — retire un membre.
func (h *Handler) removeMember(w http.ResponseWriter, r *http.Request) {
	id := userID(r)
	if id == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	if err := h.svc.RemoveMember(r.Context(), id, chi.URLParam(r, "id"), chi.URLParam(r, "userId")); err != nil {
		writeErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}
