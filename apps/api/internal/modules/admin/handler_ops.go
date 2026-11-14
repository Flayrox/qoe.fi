package admin

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/qoefi/api/internal/response"
	"github.com/qoefi/api/internal/subscriptions"
)

// GET /v1/admin/users — liste des utilisateurs (réservé superadmin).
func (h *Handler) users(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireAuthenticated(w, r)
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
	userID, ok := h.requireAuthenticated(w, r)
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

// PATCH /v1/admin/publications/{id} — palier email Pro (réservé superadmin).
func (h *Handler) setPublisherEmailPro(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	var in struct {
		EmailPro *bool `json:"emailPro"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.EmailPro == nil {
		response.BadRequest(w, "JSON invalide (emailPro requis)")
		return
	}
	pro, err := h.svc.SetPublisherEmailPro(r.Context(), userID, chi.URLParam(r, "id"), *in.EmailPro)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Publisher introuvable.")
			return
		}
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]any{"emailPro": pro})
}

// GET /v1/admin/subscriptions/grants — octrois (plus récents d'abord).
func (h *Handler) subscriptionGrants(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	items, total, err := h.svc.ListSubscriptionGrants(r.Context(), userID,
		r.URL.Query().Get("plan"), r.URL.Query().Get("effective") == "1", limit, offset)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]any{"items": items, "total": total})
}

// POST /v1/admin/subscriptions/grants — octroyer un palier.
func (h *Handler) grantSubscription(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	var in struct {
		SubjectType string `json:"subjectType"`
		SubjectID   string `json:"subjectId"`
		Plan        string `json:"plan"`
		StartsAt    string `json:"startsAt"`
		EndsAt      string `json:"endsAt"`
		Note        string `json:"note"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil ||
		in.SubjectType == "" || in.SubjectID == "" || in.Plan == "" {
		response.BadRequest(w, "JSON invalide (subjectType, subjectId et plan requis)")
		return
	}
	g, err := h.svc.GrantSubscription(r.Context(), userID, in.SubjectType, in.SubjectID, in.Plan, in.StartsAt, in.EndsAt, in.Note)
	if err != nil {
		if errors.Is(err, subscriptions.ErrInvalidGrant) {
			response.BadRequest(w, err.Error())
			return
		}
		h.handleErr(w, err)
		return
	}
	response.OK(w, g)
}

// POST /v1/admin/subscriptions/grants/{id}/revoke — fin immédiate.
func (h *Handler) revokeSubscriptionGrant(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	g, err := h.svc.RevokeSubscriptionGrant(r.Context(), userID, chi.URLParam(r, "id"))
	if err != nil {
		if errors.Is(err, subscriptions.ErrGrantNotFound) {
			response.NotFound(w, "Octroi introuvable.")
			return
		}
		h.handleErr(w, err)
		return
	}
	response.OK(w, g)
}

// PATCH /v1/admin/users/{userID} — modération (réservé superadmin).
func (h *Handler) updateModeration(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireAuthenticated(w, r)
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

// revokeUserSessions révoque toutes les sessions d'un compte côté fournisseur.
func (h *Handler) revokeUserSessions(w http.ResponseWriter, r *http.Request) {
	staffID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	if err := h.svc.checkSuperadmin(r.Context(), staffID); err != nil {
		h.handleErr(w, err)
		return
	}
	if h.usersSvc == nil {
		response.Error(w, http.StatusServiceUnavailable, "Service des comptes non branché")
		return
	}
	targetID := chi.URLParam(r, "userID")
	if targetID == "" {
		response.BadRequest(w, "userID requis")
		return
	}
	if err := h.usersSvc.RevokeUserSessions(r.Context(), targetID); err != nil {
		log.Printf("[admin] revoke-sessions %s: %v", targetID, err)
		response.Error(w, http.StatusBadGateway, "Révocation impossible pour le moment")
		return
	}
	h.svc.logAudit(r.Context(), staffID, "account.sessions_revoked", "user", targetID, map[string]any{
		"scope": "all",
	})
	response.OK(w, map[string]bool{"success": true})
}

// ── Widgets & tendances ───────────────────────────────────────────────────────

// GET /v1/admin/widgets — articles + tendances + promos.
func (h *Handler) widgets(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireAuthenticated(w, r)
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
	userID, ok := h.requireAuthenticated(w, r)
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
	userID, ok := h.requireAuthenticated(w, r)
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
	userID, ok := h.requireAuthenticated(w, r)
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
	userID, ok := h.requireAuthenticated(w, r)
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
	userID, ok := h.requireAuthenticated(w, r)
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
	userID, ok := h.requireAuthenticated(w, r)
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
	userID, ok := h.requireAuthenticated(w, r)
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
