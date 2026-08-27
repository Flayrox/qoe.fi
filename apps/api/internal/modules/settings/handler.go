package settings

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/response"
)

// Handler expose les endpoints de settings du créateur.
type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// RegisterPublic enregistre les routes publiques (vérification de sous-domaine).
func (h *Handler) RegisterPublic(r chi.Router) {
	r.Get("/v1/settings/subdomain/check", h.checkSubdomain)
}

// RegisterProtected enregistre les routes créateur (auth JWT requise).
func (h *Handler) RegisterProtected(r chi.Router) {
	r.Route("/v1/settings", func(r chi.Router) {
		r.Patch("/profile", h.updateProfile)
		r.Get("/publication", h.getPublicationSettings)
		r.Get("/preferences", h.getPreferences)
		r.Patch("/preferences", h.updatePreferences)
		r.Post("/subdomain", h.updateSubdomain)
		r.Put("/navigation", h.saveNavigation)
		r.Put("/social", h.saveSocial)
		r.Post("/api-application", h.submitApiApplication)
		r.Get("/api-keys", h.listApiKeys)
		r.Post("/api-keys", h.generateApiKey)
		r.Delete("/api-keys/{id}", h.revokeApiKey)
		r.Post("/onboarding", h.completeOnboarding)
	})
	// Demande de suppression de compte (lecteur).
	r.Get("/v1/me/account-deletion-request", h.getDeletionRequest)
	r.Post("/v1/me/account-deletion-request", h.requestDeletion)
	r.Delete("/v1/me/account-deletion-request", h.cancelDeletion)
}

// GET /v1/settings/publication?publicationId= — publication + relations de la
// page settings créateur (navigation, socialLinks, articles, catégories, owner).
func (h *Handler) getPublicationSettings(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok || userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	publicationID := r.URL.Query().Get("publicationId")
	if publicationID == "" {
		response.BadRequest(w, "publicationId requis")
		return
	}
	pub, err := h.svc.GetPublicationSettings(r.Context(), userID, publicationID)
	if err != nil {
		if errors.Is(err, errForbidden) {
			response.Forbidden(w, "Accès refusé à cette publication.")
			return
		}
		if errors.Is(err, errNotFound) {
			response.NotFound(w, "Publication introuvable")
			return
		}
		log.Printf("[settings] getPublicationSettings: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, pub)
}

// GET /v1/settings/preferences — préférences lecteur (userSettings).
func (h *Handler) getPreferences(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	settings, err := h.svc.GetUserSettings(r.Context(), userID)
	if err != nil {
		log.Printf("[settings] getPreferences: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, settings)
}

// PATCH /v1/settings/preferences — mise à jour partielle (clés validées).
func (h *Handler) updatePreferences(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	var patch map[string]any
	if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	settings, err := h.svc.UpdateUserSettings(r.Context(), userID, patch)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	response.OK(w, settings)
}

// GET /v1/me/account-deletion-request — dernière demande (nil si aucune).
func (h *Handler) getDeletionRequest(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	req, err := h.svc.GetDeletionRequest(r.Context(), userID)
	if err != nil {
		response.Internal(w)
		return
	}
	response.OK(w, req)
}

// POST /v1/me/account-deletion-request — crée la demande (idempotent).
func (h *Handler) requestDeletion(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	req, err := h.svc.CreateDeletionRequest(r.Context(), userID, "User requested account deletion from settings")
	if err != nil {
		response.Internal(w)
		return
	}
	response.OK(w, req)
}

// DELETE /v1/me/account-deletion-request — annule les demandes PENDING.
func (h *Handler) cancelDeletion(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	if err := h.svc.CancelDeletionRequest(r.Context(), userID); err != nil {
		response.Internal(w)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// GET /v1/settings/subdomain/check?subdomain= — validation + disponibilité (public).
func (h *Handler) checkSubdomain(w http.ResponseWriter, r *http.Request) {
	subdomain := r.URL.Query().Get("subdomain")
	available, reason := h.svc.CheckSubdomain(r.Context(), subdomain)
	out := map[string]any{"available": available}
	if reason != "" {
		out["reason"] = reason
	}
	response.OK(w, out)
}

// PATCH /v1/settings/profile — mise à jour partielle du profil.
func (h *Handler) updateProfile(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	publicationID, _ := body["publicationId"].(string)
	if publicationID == "" {
		response.BadRequest(w, "publicationId requis")
		return
	}
	delete(body, "publicationId")

	user, err := h.svc.UpdateProfile(r.Context(), userID, publicationID, body)
	if err != nil {
		if errors.Is(err, errForbidden) {
			response.Forbidden(w, "Accès refusé à cette publication.")
			return
		}
		if errors.Is(err, errNotFound) {
			response.NotFound(w, "Utilisateur introuvable")
			return
		}
		log.Printf("[settings] updateProfile: %v", err)
		response.BadRequest(w, err.Error())
		return
	}
	response.OK(w, user)
}

// POST /v1/settings/subdomain — change le sous-domaine.
func (h *Handler) updateSubdomain(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	var in struct {
		PublicationID string `json:"publicationId"`
		Subdomain     string `json:"subdomain"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if in.PublicationID == "" || in.Subdomain == "" {
		response.BadRequest(w, "publicationId et subdomain requis")
		return
	}
	if err := h.svc.UpdateSubdomain(r.Context(), userID, in.PublicationID, in.Subdomain); err != nil {
		if errors.Is(err, errForbidden) {
			response.Forbidden(w, err.Error())
			return
		}
		response.BadRequest(w, err.Error())
		return
	}
	response.OK(w, map[string]any{"success": true, "subdomain": in.Subdomain})
}

// PUT /v1/settings/navigation — remplace les liens de navigation.
func (h *Handler) saveNavigation(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	var in struct {
		PublicationID string           `json:"publicationId"`
		Links         []NavigationLink `json:"links"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if in.PublicationID == "" {
		response.BadRequest(w, "publicationId requis")
		return
	}
	if err := h.svc.SaveNavigation(r.Context(), userID, in.PublicationID, in.Links); err != nil {
		if errors.Is(err, errForbidden) {
			response.Forbidden(w, "Accès refusé à cette publication.")
			return
		}
		log.Printf("[settings] saveNavigation: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// PUT /v1/settings/social — remplace les liens sociaux.
func (h *Handler) saveSocial(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	var in struct {
		PublicationID string       `json:"publicationId"`
		Links         []SocialLink `json:"links"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if in.PublicationID == "" {
		response.BadRequest(w, "publicationId requis")
		return
	}
	if err := h.svc.SaveSocial(r.Context(), userID, in.PublicationID, in.Links); err != nil {
		if errors.Is(err, errForbidden) {
			response.Forbidden(w, "Accès refusé à cette publication.")
			return
		}
		log.Printf("[settings] saveSocial: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// POST /v1/settings/api-application — demande d'accès API.
func (h *Handler) submitApiApplication(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	var in struct {
		Reason string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if len([]rune(in.Reason)) < 10 {
		response.BadRequest(w, "Veuillez fournir une explication détaillée (au moins 10 caractères).")
		return
	}
	if err := h.svc.SubmitApiApplication(r.Context(), userID, in.Reason); err != nil {
		log.Printf("[settings] submitApiApplication: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// POST /v1/settings/api-keys — génère une clé API (avec scopes optionnels).
func (h *Handler) generateApiKey(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	var in struct {
		Name   string   `json:"name"`
		Scopes []string `json:"scopes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	apiKey, err := h.svc.GenerateApiKey(r.Context(), userID, in.Name, in.Scopes)
	if err != nil {
		response.Forbidden(w, err.Error())
		return
	}
	response.OK(w, map[string]string{"apiKey": apiKey})
}

// GET /v1/settings/api-keys — liste les clés API de l'utilisateur (sans hash).
func (h *Handler) listApiKeys(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	keys, err := h.svc.ListApiKeys(r.Context(), userID)
	if err != nil {
		log.Printf("[settings] listApiKeys: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{"keys": keys})
}

// DELETE /v1/settings/api-keys/{id} — révoque une clé API.
func (h *Handler) revokeApiKey(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")
	if err := h.svc.RevokeApiKey(r.Context(), userID, id); err != nil {
		log.Printf("[settings] revokeApiKey: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// POST /v1/settings/onboarding — finalise l'onboarding.
func (h *Handler) completeOnboarding(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	var in OnboardingInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if err := h.svc.CompleteOnboarding(r.Context(), userID, in); err != nil {
		log.Printf("[settings] completeOnboarding: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}
