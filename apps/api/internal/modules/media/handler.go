package media

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/permissions"
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

		// Liens d'invitation média (sans email requis)
		r.Post("/{id}/links", h.createLink)
		r.Get("/{id}/links", h.listLinks)
		r.Post("/{id}/links/{linkId}/revoke", h.revokeLink)
		r.Get("/invites/link/{token}", h.getLinkPreview)
		r.Post("/invites/link/{token}/join", h.joinLink)

		// PATCH /v1/media/by-publication/{publicationId}/settings — équivalent de
		// /{id}/settings mais adressé par la PUBLICATION du média. Le profil public
		// d'un média n'expose que la publicationId ; accepter les deux évite que le
		// front ne confonde jamais les deux identifiants (source du bug du 19/09 :
		// l'id de publication envoyé comme si c'était l'id du média → 404).
		r.Patch("/by-publication/{publicationId}/settings", h.updateSettingsByPublication)
		// GET /v1/media/by-publication/{publicationId} — résout {mediaId} pour que
		// le front puisse adresser les autres endpoints sans deviner.
		r.Get("/by-publication/{publicationId}", h.mediaIdByPublication)

		// Clés API Média (gestion workspace / délégation fine api_keys:manage)
		r.Get("/{id}/api-keys", h.listApiKeys)
		r.Post("/{id}/api-keys", h.createApiKey)
		r.Patch("/{id}/api-keys/{keyId}", h.updateApiKey)
		r.Post("/{id}/api-keys/{keyId}/rotate", h.rotateApiKey)
		r.Delete("/{id}/api-keys/{keyId}", h.revokeApiKey)
	})
}

func userID(r *http.Request) string {
	id, _ := middleware.UserID(r.Context())
	return id
}

func writeErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrInvalidScopes):
		response.Error(w, http.StatusUnprocessableEntity, "scopes invalides")
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
		Name    string `json:"name"`
		Slug    string `json:"slug"`
		Bio     string `json:"bio"`
		LogoURL string `json:"logoUrl"`
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
	mediaID := chi.URLParam(r, "id")
	detail, myRole, err := h.svc.GetMedia(r.Context(), id, mediaID)
	if err != nil {
		writeErr(w, err)
		return
	}
	canManageKeys := false
	if m, _ := h.svc.member(r.Context(), mediaID, id); m != nil {
		canManageKeys = permissions.CanMedia(&permissions.MediaMember{
			Role: m.Role, Permissions: m.Permissions, Status: m.Status,
		}, permissions.PermManageApiKeys)
	}
	response.OK(w, map[string]any{
		"media":            detail,
		"myRole":           myRole,
		"canManageApiKeys": canManageKeys,
	})
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

// PATCH /v1/media/by-publication/{publicationId}/settings — voit /{id}/settings.
func (h *Handler) updateSettingsByPublication(w http.ResponseWriter, r *http.Request) {
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
	mediaID, err := h.svc.MediaIDByPublication(r.Context(), chi.URLParam(r, "publicationId"))
	if err != nil {
		writeErr(w, err)
		return
	}
	publication, err := h.svc.UpdateSettings(r.Context(), id, mediaID, body)
	if err != nil {
		writeErr(w, err)
		return
	}
	response.OK(w, map[string]any{"success": true, "publication": publication})
}

// GET /v1/media/by-publication/{publicationId} — {mediaId}.
func (h *Handler) mediaIdByPublication(w http.ResponseWriter, r *http.Request) {
	id := userID(r)
	if id == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	mediaID, err := h.svc.MediaIDByPublication(r.Context(), chi.URLParam(r, "publicationId"))
	if err != nil {
		writeErr(w, err)
		return
	}
	response.OK(w, map[string]string{"mediaId": mediaID})
}

// POST /v1/media/{id}/invites — {username, role?} : ajoute un collaborateur par
// son @username (100% confidentiel, aucun email requis ni divulgué).
func (h *Handler) inviteMember(w http.ResponseWriter, r *http.Request) {
	id := userID(r)
	if id == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	var in struct {
		Username string `json:"username"`
		Role     string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	out, err := h.svc.InviteMemberByUsername(r.Context(), id, chi.URLParam(r, "id"), in.Username, in.Role)
	if err != nil {
		writeErr(w, err)
		return
	}
	response.OK(w, out)
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

// GET /v1/media/{id}/api-keys — liste les clés API du média.
func (h *Handler) listApiKeys(w http.ResponseWriter, r *http.Request) {
	id := userID(r)
	if id == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	mediaID := chi.URLParam(r, "id")
	keys, err := h.svc.ListApiKeys(r.Context(), id, mediaID)
	if err != nil {
		writeErr(w, err)
		return
	}
	response.OK(w, map[string]any{"keys": keys})
}

// POST /v1/media/{id}/api-keys — génère une clé API média (secret retourné une seule fois).
func (h *Handler) createApiKey(w http.ResponseWriter, r *http.Request) {
	id := userID(r)
	if id == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	mediaID := chi.URLParam(r, "id")
	var in struct {
		Name   string   `json:"name"`
		Scopes []string `json:"scopes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	key, err := h.svc.CreateApiKey(r.Context(), id, mediaID, in.Name, in.Scopes)
	if err != nil {
		writeErr(w, err)
		return
	}
	response.Created(w, key)
}

// PATCH /v1/media/{id}/api-keys/{keyId} — renomme une clé API média.
func (h *Handler) updateApiKey(w http.ResponseWriter, r *http.Request) {
	id := userID(r)
	if id == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	mediaID := chi.URLParam(r, "id")
	keyID := chi.URLParam(r, "keyId")
	var in struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if err := h.svc.UpdateApiKeyName(r.Context(), id, mediaID, keyID, in.Name); err != nil {
		writeErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// POST /v1/media/{id}/api-keys/{keyId}/rotate — régénère le secret d'une clé API média.
func (h *Handler) rotateApiKey(w http.ResponseWriter, r *http.Request) {
	id := userID(r)
	if id == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	mediaID := chi.URLParam(r, "id")
	keyID := chi.URLParam(r, "keyId")
	res, err := h.svc.RotateApiKey(r.Context(), id, mediaID, keyID)
	if err != nil {
		writeErr(w, err)
		return
	}
	response.OK(w, res)
}

// DELETE /v1/media/{id}/api-keys/{keyId} — révoque/supprime une clé API média.
func (h *Handler) revokeApiKey(w http.ResponseWriter, r *http.Request) {
	id := userID(r)
	if id == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	mediaID := chi.URLParam(r, "id")
	keyID := chi.URLParam(r, "keyId")
	if err := h.svc.RevokeApiKey(r.Context(), id, mediaID, keyID); err != nil {
		writeErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// POST /v1/media/{id}/links — {role?, expiresInHours?, maxUses?}.
func (h *Handler) createLink(w http.ResponseWriter, r *http.Request) {
	id := userID(r)
	if id == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	mediaID := chi.URLParam(r, "id")
	var in struct {
		Role string `json:"role"`
		// Pointeurs pour distinguer « absent » (défauts sûrs : 24 h, 1 usage)
		// de « 0 explicite » (permanent / illimité).
		ExpiresInHours *int `json:"expiresInHours"`
		MaxUses        *int `json:"maxUses"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	expiresInHours, maxUses := 24, 1
	if in.ExpiresInHours != nil {
		expiresInHours = *in.ExpiresInHours
	}
	if in.MaxUses != nil {
		maxUses = *in.MaxUses
	}
	link, err := h.svc.CreateInviteLink(r.Context(), id, mediaID, in.Role, expiresInHours, maxUses)
	if err != nil {
		writeErr(w, err)
		return
	}
	response.Created(w, map[string]any{"success": true, "link": link})
}

// GET /v1/media/{id}/links — liste les liens d'un média.
func (h *Handler) listLinks(w http.ResponseWriter, r *http.Request) {
	id := userID(r)
	if id == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	mediaID := chi.URLParam(r, "id")
	links, err := h.svc.ListInviteLinks(r.Context(), id, mediaID)
	if err != nil {
		writeErr(w, err)
		return
	}
	response.OK(w, map[string]any{"links": links})
}

// POST /v1/media/{id}/links/{linkId}/revoke — révoque un lien.
func (h *Handler) revokeLink(w http.ResponseWriter, r *http.Request) {
	id := userID(r)
	if id == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	mediaID := chi.URLParam(r, "id")
	linkID := chi.URLParam(r, "linkId")
	if err := h.svc.RevokeInviteLink(r.Context(), id, mediaID, linkID); err != nil {
		writeErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// GET /v1/media/invites/link/{token} — aperçu d'un lien d'invitation.
func (h *Handler) getLinkPreview(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	preview, err := h.svc.GetInviteLinkPreview(r.Context(), token)
	if err != nil {
		writeErr(w, err)
		return
	}
	response.OK(w, preview)
}

// POST /v1/media/invites/link/{token}/join — accepter et rejoindre le média via lien.
func (h *Handler) joinLink(w http.ResponseWriter, r *http.Request) {
	id := userID(r)
	if id == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	token := chi.URLParam(r, "token")
	res, err := h.svc.JoinViaInviteLink(r.Context(), id, token)
	if err != nil {
		writeErr(w, err)
		return
	}
	response.OK(w, res)
}
