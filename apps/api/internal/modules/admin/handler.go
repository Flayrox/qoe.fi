package admin

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/response"
)

// Handler expose la console superadmin.
type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// Register enregistre les routes admin (groupe protégé JWT).
func (h *Handler) Register(r chi.Router) {
	r.Get("/v1/admin/dashboard", h.dashboard)
	r.Get("/v1/admin/users", h.users)
	r.Get("/v1/admin/users/{userID}", h.userDetail)
	r.Patch("/v1/admin/users/{userID}", h.updateModeration)

	// Widgets & tendances
	r.Get("/v1/admin/widgets", h.widgets)
	r.Post("/v1/admin/widgets/featured", h.setFeatured)
	r.Post("/v1/admin/widgets/trends", h.addTrend)
	r.Delete("/v1/admin/widgets/trends/{id}", h.deleteTrend)
	r.Patch("/v1/admin/widgets/trends/{id}", h.updateTrend)
	r.Post("/v1/admin/widgets/promos", h.savePromo)
	r.Delete("/v1/admin/widgets/promos/{id}", h.deletePromo)
	r.Patch("/v1/admin/widgets/promos/{id}", h.togglePromo)

	// Feature flags / config / frontend / traductions
	r.Get("/v1/admin/config", h.configs)
	r.Put("/v1/admin/config", h.upsertConfigs)
	r.Delete("/v1/admin/config/{key}", h.deleteConfig)

	// OAuth
	r.Get("/v1/admin/oauth/clients", h.oauthClients)
	r.Patch("/v1/admin/oauth/clients/{id}", h.updateOAuthStatus)

	// Demandes d'accès API
	r.Get("/v1/admin/api-applicants", h.apiApplicants)
	r.Patch("/v1/admin/api-applicants/{userID}", h.updateApiAccess)

	// Notifications & livraisons
	r.Get("/v1/admin/deliveries", h.deliveries)
	r.Post("/v1/admin/deliveries/{id}/retry", h.retryDelivery)
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
		response.NotFound(w, "Utilisateur introuvable.")
	default:
		log.Printf("[admin] %v", err)
		response.Internal(w)
	}
}

// GET /v1/admin/dashboard — compteurs globaux (réservé superadmin).
func (h *Handler) dashboard(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	data, err := h.svc.GetDashboard(r.Context(), userID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, data)
}

// GET /v1/admin/users — liste des utilisateurs (réservé superadmin).
func (h *Handler) users(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	data, err := h.svc.ListUsers(r.Context(), userID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, data)
}

// GET /v1/admin/users/{userID} — détail d'un utilisateur (réservé superadmin).
func (h *Handler) userDetail(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	data, err := h.svc.GetUser(r.Context(), userID, chi.URLParam(r, "userID"))
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, data)
}

// PATCH /v1/admin/users/{userID} — modération (réservé superadmin).
func (h *Handler) updateModeration(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	var in ModerationInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	data, err := h.svc.UpdateModeration(r.Context(), userID, chi.URLParam(r, "userID"), in)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, data)
}

// ── Widgets & tendances ───────────────────────────────────────────────────────

// GET /v1/admin/widgets — articles + tendances + promos.
func (h *Handler) widgets(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	data, err := h.svc.GetWidgets(r.Context(), userID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, data)
}

// POST /v1/admin/widgets/featured — bascule l'article à la une.
func (h *Handler) setFeatured(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	var in struct {
		ArticleID string `json:"articleId"`
		Featured  bool   `json:"featured"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.ArticleID == "" {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if err := h.svc.SetArticleFeatured(r.Context(), userID, in.ArticleID, in.Featured); err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// POST /v1/admin/widgets/trends — ajoute / met à jour une tendance.
func (h *Handler) addTrend(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	var in struct {
		Hashtag string `json:"hashtag"`
		Count   int32  `json:"count"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Hashtag == "" {
		response.BadRequest(w, "JSON invalide")
		return
	}
	data, err := h.svc.UpsertTrend(r.Context(), userID, in.Hashtag, in.Count)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, data)
}

// DELETE /v1/admin/widgets/trends/{id}
func (h *Handler) deleteTrend(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	if err := h.svc.DeleteTrend(r.Context(), userID, chi.URLParam(r, "id")); err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// PATCH /v1/admin/widgets/trends/{id} — met à jour le volume.
func (h *Handler) updateTrend(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	var in struct {
		Count int32 `json:"count"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if err := h.svc.UpdateTrendCount(r.Context(), userID, chi.URLParam(r, "id"), in.Count); err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// POST /v1/admin/widgets/promos — crée / met à jour une promo.
func (h *Handler) savePromo(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	var in PromoInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	data, err := h.svc.SavePromo(r.Context(), userID, in)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, data)
}

// DELETE /v1/admin/widgets/promos/{id}
func (h *Handler) deletePromo(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	if err := h.svc.DeletePromo(r.Context(), userID, chi.URLParam(r, "id")); err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// PATCH /v1/admin/widgets/promos/{id} — active / désactive.
func (h *Handler) togglePromo(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	var in struct {
		IsActive bool `json:"isActive"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if err := h.svc.TogglePromoActive(r.Context(), userID, chi.URLParam(r, "id"), in.IsActive); err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// ── Feature flags / config / frontend / traductions ──────────────────────────

// GET /v1/admin/config?keys=a,b,c — liste des configs (toutes si keys absent).
func (h *Handler) configs(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	var (
		data []SystemConfigItem
		err  error
	)
	if keysParam := r.URL.Query().Get("keys"); keysParam != "" {
		keys := splitKeys(keysParam)
		data, err = h.svc.GetSystemConfigsByKeys(r.Context(), userID, keys)
	} else {
		data, err = h.svc.ListSystemConfigs(r.Context(), userID)
	}
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, data)
}

// PUT /v1/admin/config — upsert d'une ou plusieurs configs.
func (h *Handler) upsertConfigs(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	var items []SystemConfigItem
	if err := json.NewDecoder(r.Body).Decode(&items); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if len(items) == 0 {
		response.BadRequest(w, "Aucune config fournie")
		return
	}
	if err := h.svc.UpsertSystemConfigs(r.Context(), userID, items); err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// DELETE /v1/admin/config/{key}
func (h *Handler) deleteConfig(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	if err := h.svc.DeleteSystemConfig(r.Context(), userID, chi.URLParam(r, "key")); err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// ── OAuth ────────────────────────────────────────────────────────────────────

// GET /v1/admin/oauth/clients — applications OAuth + propriétaires.
func (h *Handler) oauthClients(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	data, err := h.svc.ListOAuthClients(r.Context(), userID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, data)
}

// PATCH /v1/admin/oauth/clients/{id} — approuve / rejette / révoque.
func (h *Handler) updateOAuthStatus(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	var in struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	switch in.Status {
	case "APPROVED", "REJECTED", "REVOKED", "PENDING":
	default:
		response.BadRequest(w, "Statut invalide")
		return
	}
	if err := h.svc.UpdateOAuthClientStatus(r.Context(), userID, chi.URLParam(r, "id"), in.Status); err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// ── Demandes d'accès API ─────────────────────────────────────────────────────

// GET /v1/admin/api-applicants
func (h *Handler) apiApplicants(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	data, err := h.svc.ListApiApplicants(r.Context(), userID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, data)
}

// PATCH /v1/admin/api-applicants/{userID} — approuve / rejette / révoque.
func (h *Handler) updateApiAccess(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	var in struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	switch in.Status {
	case "approved", "rejected", "revoked", "none", "pending":
	default:
		response.BadRequest(w, "Statut invalide")
		return
	}
	if err := h.svc.UpdateApiAccessStatus(r.Context(), userID, chi.URLParam(r, "userID"), in.Status); err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// ── Notifications & livraisons ───────────────────────────────────────────────

// GET /v1/admin/deliveries — compteurs + 50 dernières livraisons.
func (h *Handler) deliveries(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	counts, err := h.svc.GetDeliveryCounts(r.Context(), userID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	rows, err := h.svc.ListDeliveries(r.Context(), userID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]any{"counts": counts.Counts, "total": counts.Total, "deliveries": rows})
}

// POST /v1/admin/deliveries/{id}/retry — relance une livraison en échec.
func (h *Handler) retryDelivery(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	if err := h.svc.RetryDelivery(r.Context(), userID, chi.URLParam(r, "id")); err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// splitKeys découpe une liste de clés séparées par des virgules.
func splitKeys(s string) []string {
	out := []string{}
	for _, k := range strings.Split(s, ",") {
		if k = strings.TrimSpace(k); k != "" {
			out = append(out, k)
		}
	}
	return out
}
