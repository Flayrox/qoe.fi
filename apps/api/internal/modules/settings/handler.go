package settings

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/antispam"
	"github.com/qoefi/api/internal/authz"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/response"
	"github.com/qoefi/api/internal/secguard"
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
		r.Get("/publisher", h.getPublisherSettings)
		// Mise à jour atomique de la page settings : profil, sous-domaine,
		// navigation et réseaux sociaux dans une seule transaction, avec
		// relecture canonique dans la réponse.
		r.Patch("/publisher", h.updatePublisherSettings)
		r.Get("/preferences", h.getPreferences)
		r.Get("/consent", h.getConsent)
		r.Patch("/consent", h.updateConsent)
		r.Patch("/preferences", h.updatePreferences)
		r.Get("/email", h.getEmailSettings)
		r.Patch("/email", h.updateEmailSettings)
		r.Post("/email/preview", h.previewEmailSettings)
		r.Post("/email/test", h.sendTestEmail)
		r.Post("/subdomain", h.updateSubdomain)
		r.Put("/navigation", h.saveNavigation)
		r.Put("/social", h.saveSocial)
		// Défaut de téléchargement des nouveaux articles (hors-ligne/file
		// d'écoute — l'auteur ajuste ensuite par article).
		r.Patch("/publisher/download-default", h.setDownloadDefault)
		registerSiteLayoutRoutes(r, h)
		r.Post("/api-application", h.submitApiApplication)
		r.Get("/api-keys", h.listApiKeys)
		// Clés API personnelles : créer, faire tourner ou révoquer un secret
		// exige une preuve forte récente (N2). Le mode d'application est piloté
		// par le flag `authz-enforce` (observation par défaut).
		manageKeys := middleware.RequireAction(authz.ActionPersonalApiKeyManage)
		r.With(manageKeys).Post("/api-keys", h.generateApiKey)
		r.With(manageKeys).Post("/api-keys/{id}/rotate", h.rotateApiKey)
		r.With(manageKeys).Delete("/api-keys/{id}", h.revokeApiKey)
		r.Post("/onboarding", h.completeOnboarding)
	})
	// Demande de suppression de compte (lecteur).
	r.Get("/v1/me/account-deletion-request", h.getDeletionRequest)
	r.Post("/v1/me/account-deletion-request", h.requestDeletion)
	r.Delete("/v1/me/account-deletion-request", h.cancelDeletion)
}

// requireUser extrait l'identité du contexte et répond 401 si absente.
func requireUser(h http.ResponseWriter, r *http.Request) (string, bool) {
	userID, ok := middleware.UserID(r.Context())
	if !ok || userID == "" {
		response.Unauthorized(h, "Authentification requise")
		return "", false
	}
	return userID, true
}

func (h *Handler) getConsent(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}
	out, err := h.svc.GetConsentPreferences(r.Context(), userID)
	if err != nil {
		writeSettingsError(w, err, "getConsent")
		return
	}
	response.OK(w, out)
}

func (h *Handler) updateConsent(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}
	var in ConsentPreferences
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	out, err := h.svc.UpdateConsentPreferences(r.Context(), userID, in)
	if err != nil {
		writeSettingsError(w, err, "updateConsent")
		return
	}
	response.OK(w, out)
}

// GET /v1/settings/publisher?publisherId= — publication + relations de la
// page settings créateur (navigation, socialLinks, articles, catégories, owner).
func (h *Handler) getPublisherSettings(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}
	publisherID := r.URL.Query().Get("publisherId")
	if publisherID == "" {
		response.BadRequest(w, "publisherId requis")
		return
	}
	pub, err := h.svc.GetPublisherSettings(r.Context(), userID, publisherID)
	if err != nil {
		writeSettingsError(w, err, "getPublisherSettings")
		return
	}
	response.OK(w, pub)
}

// PATCH /v1/settings/publisher — mise à jour partielle et atomique.
func (h *Handler) updatePublisherSettings(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}
	var in PublisherSettingsPatch
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if in.PublisherID == "" {
		in.PublisherID = r.URL.Query().Get("publisherId")
	}
	if in.PublisherID == "" {
		response.BadRequest(w, "publisherId requis")
		return
	}
	pub, err := h.svc.UpdatePublisherSettings(r.Context(), userID, in)
	if err != nil {
		writeSettingsError(w, err, "updatePublisherSettings")
		return
	}
	response.OK(w, pub)
}

// GET /v1/settings/preferences — préférences lecteur (userSettings).
func (h *Handler) getPreferences(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}
	settings, err := h.svc.GetUserSettings(r.Context(), userID)
	if err != nil {
		writeSettingsError(w, err, "getPreferences")
		return
	}
	response.OK(w, settings)
}

// PATCH /v1/settings/preferences — mise à jour partielle (clés validées).
func (h *Handler) updatePreferences(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}
	var patch map[string]any
	if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	settings, err := h.svc.UpdateUserSettings(r.Context(), userID, patch)
	if err != nil {
		writeSettingsError(w, err, "updatePreferences")
		return
	}
	response.OK(w, settings)
}

// GET /v1/me/account-deletion-request — dernière demande (nil si aucune).
func (h *Handler) getDeletionRequest(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}
	req, err := h.svc.GetDeletionRequest(r.Context(), userID)
	if err != nil {
		writeSettingsError(w, err, "getDeletionRequest")
		return
	}
	response.OK(w, req)
}

// POST /v1/me/account-deletion-request — crée la demande (idempotent).
func (h *Handler) requestDeletion(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}
	req, err := h.svc.CreateDeletionRequest(r.Context(), userID, "User requested account deletion from settings")
	if err != nil {
		writeSettingsError(w, err, "requestDeletion")
		return
	}
	response.OK(w, req)
}

// DELETE /v1/me/account-deletion-request — annule les demandes PENDING.
func (h *Handler) cancelDeletion(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}
	if err := h.svc.CancelDeletionRequest(r.Context(), userID); err != nil {
		writeSettingsError(w, err, "cancelDeletion")
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// GET /v1/settings/subdomain/check?subdomain= — validation + disponibilité
// (public). Une panne de lecture répond 500 : renvoyer available=false ferait
// passer une base indisponible pour un nom déjà attribué.
func (h *Handler) checkSubdomain(w http.ResponseWriter, r *http.Request) {
	subdomain := r.URL.Query().Get("subdomain")
	available, reason, err := h.svc.CheckSubdomain(r.Context(), subdomain)
	if err != nil {
		writeSettingsError(w, err, "checkSubdomain")
		return
	}
	out := map[string]any{"available": available}
	if reason != "" {
		out["reason"] = reason
	}
	response.OK(w, out)
}

// PATCH /v1/settings/profile — mise à jour partielle du profil.
func (h *Handler) updateProfile(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	publisherID, _ := body["publisherId"].(string)
	if publisherID == "" {
		response.BadRequest(w, "publisherId requis")
		return
	}
	delete(body, "publisherId")

	user, err := h.svc.UpdateProfile(r.Context(), userID, publisherID, body)
	if err != nil {
		writeSettingsError(w, err, "updateProfile")
		return
	}
	response.OK(w, user)
}

// POST /v1/settings/subdomain — change (ou retire, chaîne vide) le sous-domaine.
func (h *Handler) updateSubdomain(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}
	var in struct {
		PublisherID string `json:"publisherId"`
		Subdomain   string `json:"subdomain"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if in.PublisherID == "" {
		response.BadRequest(w, "publisherId requis")
		return
	}
	stored, err := h.svc.UpdateSubdomain(r.Context(), userID, in.PublisherID, in.Subdomain)
	if err != nil {
		writeSettingsError(w, err, "updateSubdomain")
		return
	}
	response.OK(w, map[string]any{"success": true, "subdomain": stored})
}

// PUT /v1/settings/navigation — remplace les liens de navigation.
func (h *Handler) saveNavigation(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}
	var in struct {
		PublisherID string           `json:"publisherId"`
		Links       []NavigationLink `json:"links"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if in.PublisherID == "" {
		response.BadRequest(w, "publisherId requis")
		return
	}
	if err := h.svc.SaveNavigation(r.Context(), userID, in.PublisherID, in.Links); err != nil {
		writeSettingsError(w, err, "saveNavigation")
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// PATCH /v1/settings/publication/download-default — défaut de téléchargement
// des NOUVEAUX articles (hors-ligne/file d'écoute). Body : { publisherId,
// allowDownloadDefault }. L'auteur ajuste ensuite par article.
func (h *Handler) setDownloadDefault(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}
	var in struct {
		PublisherID          string `json:"publisherId"`
		AllowDownloadDefault *bool  `json:"allowDownloadDefault"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil ||
		in.PublisherID == "" || in.AllowDownloadDefault == nil {
		response.BadRequest(w, "JSON invalide (publisherId et allowDownloadDefault requis)")
		return
	}
	val, err := h.svc.SetDownloadDefault(r.Context(), userID, in.PublisherID, *in.AllowDownloadDefault)
	if err != nil {
		writeSettingsError(w, err, "setDownloadDefault")
		return
	}
	response.OK(w, map[string]any{"allowDownloadDefault": val})
}

// PUT /v1/settings/social — remplace les liens sociaux.
func (h *Handler) saveSocial(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}
	var in struct {
		PublisherID string       `json:"publisherId"`
		Links       []SocialLink `json:"links"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if in.PublisherID == "" {
		response.BadRequest(w, "publisherId requis")
		return
	}
	if err := h.svc.SaveSocial(r.Context(), userID, in.PublisherID, in.Links); err != nil {
		writeSettingsError(w, err, "saveSocial")
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// POST /v1/settings/api-application — demande d'accès API.
func (h *Handler) submitApiApplication(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}
	var in struct {
		Reason string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	cleanReason, err := antispam.SanitizeAndValidateText(in.Reason, 10, 1000, antispam.TextOptions{
		AllowNewlines: true,
		CheckXSS:      true,
	})
	if err != nil {
		if !secguard.WriteRejection(w, err) {
			response.BadRequest(w, err.Error())
		}
		return
	}
	if err := h.svc.SubmitApiApplication(r.Context(), userID, cleanReason); err != nil {
		writeSettingsError(w, err, "submitApiApplication")
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// POST /v1/settings/api-keys — génère une clé API (avec scopes optionnels).
func (h *Handler) generateApiKey(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}
	var in struct {
		Name   string   `json:"name"`
		Scopes []string `json:"scopes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	cleanName, err := antispam.SanitizeAndValidateText(in.Name, 1, 80, antispam.TextOptions{
		AllowNewlines: false,
		CheckXSS:      true,
	})
	if err != nil {
		if !secguard.WriteRejection(w, err) {
			response.BadRequest(w, err.Error())
		}
		return
	}
	apiKey, err := h.svc.GenerateApiKey(r.Context(), userID, cleanName, in.Scopes)
	if err != nil {
		// Une panne de base n'est plus un 403 « non approuvé ».
		writeSettingsError(w, err, "generateApiKey")
		return
	}
	response.OK(w, map[string]string{"apiKey": apiKey})
}

// GET /v1/settings/api-keys — liste les clés API de l'utilisateur (sans hash).
func (h *Handler) listApiKeys(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}
	keys, err := h.svc.ListApiKeys(r.Context(), userID)
	if err != nil {
		writeSettingsError(w, err, "listApiKeys")
		return
	}
	response.OK(w, map[string]any{"keys": keys})
}

// POST /v1/settings/api-keys/{id}/rotate — régénère le secret d'une clé API.
func (h *Handler) rotateApiKey(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}
	apiKey, err := h.svc.RotateApiKey(r.Context(), userID, chi.URLParam(r, "id"))
	if err != nil {
		writeSettingsError(w, err, "rotateApiKey")
		return
	}
	response.OK(w, map[string]string{"apiKey": apiKey})
}

// DELETE /v1/settings/api-keys/{id} — révoque une clé API.
func (h *Handler) revokeApiKey(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")
	if id == "" {
		response.BadRequest(w, "identifiant de clé requis")
		return
	}
	if err := h.svc.RevokeApiKey(r.Context(), userID, id); err != nil {
		writeSettingsError(w, err, "revokeApiKey")
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// POST /v1/settings/onboarding — finalise l'onboarding.
func (h *Handler) completeOnboarding(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}
	var in OnboardingInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if err := h.svc.CompleteOnboarding(r.Context(), userID, in); err != nil {
		writeSettingsError(w, err, "completeOnboarding")
		return
	}
	response.OK(w, map[string]bool{"success": true})
}
