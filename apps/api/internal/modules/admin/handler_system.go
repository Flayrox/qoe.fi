package admin

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/adminauthz"
	"github.com/qoefi/api/internal/response"
)

// GET /v1/admin/dashboard — compteurs globaux (réservé superadmin).
func (h *Handler) dashboard(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireAuthenticated(w, r)
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

// GET /v1/admin/health — état de la plateforme (base, migration, mode, décisions).
func (h *Handler) health(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireAuthenticated(w, r); !ok {
		return
	}
	health := h.svc.GetPlatformHealth(r.Context())
	health.Mode = h.enforceMode(r)
	if h.decisionStats != nil {
		health.Decisions.Recorder = RecorderCounters{
			Written: h.decisionStats.Written(),
			Dropped: h.decisionStats.Dropped(),
			Queued:  h.decisionStats.Queued(),
		}
	}
	response.OK(w, health)
}

// GET /v1/admin/slo — rapport SLO et alertes par surface (latence, erreurs, outbox, migration).
func (h *Handler) sloReport(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireAuthenticated(w, r); !ok {
		return
	}
	report := h.svc.GetPlatformSLOReport(r.Context())
	response.OK(w, report)
}

// GET /v1/admin/storage/usage — supervision du bucket images (superadmin).
func (h *Handler) storageUsage(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	data, err := h.svc.GetStorageUsage(r.Context(), userID, limit)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, data)
}

// GET /v1/admin/registrations/allowlist — invitations d'inscription.
func (h *Handler) listAllowlist(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	data, err := h.svc.ListAllowlist(r.Context(), userID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, data)
}

// POST /v1/admin/registrations/allowlist — invite un email.
func (h *Handler) addAllowlist(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	var body struct {
		Email string `json:"email"`
		Note  string `json:"note"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	entry, err := h.svc.AddAllowlist(r.Context(), userID, body.Email, body.Note)
	if err != nil {
		if err.Error() == "email invalide" {
			response.BadRequest(w, err.Error())
			return
		}
		h.handleErr(w, err)
		return
	}
	response.OK(w, entry)
}

// DELETE /v1/admin/registrations/allowlist/{email} — retire une invitation.
func (h *Handler) deleteAllowlist(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	email, err := url.PathUnescape(chi.URLParam(r, "email"))
	if err != nil {
		response.BadRequest(w, "email invalide")
		return
	}
	if err := h.svc.DeleteAllowlist(r.Context(), userID, email); err != nil {
		if err.Error() == "email invalide" {
			response.BadRequest(w, err.Error())
			return
		}
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// ── Feature flags / config / frontend / traductions ──────────────────────────

// GET /v1/admin/config?keys=a,b,c — liste des configs (toutes si keys absent).
func (h *Handler) configs(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireAuthenticated(w, r)
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
	userID, ok := h.requireAuthenticated(w, r)
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

// PUT /v1/admin/reserved-identifiers/{kind} — replaces the admin-managed
// username/subdomain denylist. Values are normalized server-side.
func (h *Handler) updateReservedIdentifiers(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	var in struct {
		Values []string `json:"values"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if err := h.svc.UpdateReservedIdentifiers(r.Context(), userID, chi.URLParam(r, "kind"), in.Values); err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// DELETE /v1/admin/config/{key}
func (h *Handler) deleteConfig(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireAuthenticated(w, r)
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
	userID, ok := h.requireAuthenticated(w, r)
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
	userID, ok := h.requireAuthenticated(w, r)
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
	userID, ok := h.requireAuthenticated(w, r)
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
	userID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	var in struct {
		Status string   `json:"status"`
		Grants []string `json:"grants"`
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
	if err := h.svc.UpdateApiAccessStatus(r.Context(), userID, chi.URLParam(r, "userID"), in.Status, in.Grants); err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// PATCH /v1/admin/api-applicants/{userID}/grants — ajuste les permissions.
func (h *Handler) updateApiGrants(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	var in struct {
		Grants []string `json:"grants"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if err := h.svc.UpdateApiGrants(r.Context(), userID, chi.URLParam(r, "userID"), in.Grants); err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// GET /v1/admin/api-access/modules — registre des permissions modulables.
func (h *Handler) apiAccessModules(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	modules, err := h.svc.GetApiAccessModules(r.Context(), userID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, modules)
}

// GET /v1/admin/audit-log — journal des actions sensibles (qui, quand, quoi).
func (h *Handler) auditLog(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireAuthenticated(w, r); !ok {
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	filter := AuditFilter{
		Actor:      r.URL.Query().Get("actor"),
		Capability: r.URL.Query().Get("capability"),
		Action:     r.URL.Query().Get("action"),
		Target:     r.URL.Query().Get("target"),
		Since:      r.URL.Query().Get("since"),
		Until:      r.URL.Query().Get("until"),
		Limit:      int32(limit),
	}
	entries, err := h.svc.ListAuditEntries(r.Context(), filter)
	if err != nil {
		h.handleErr(w, err)
		return
	}

	if r.URL.Query().Get("format") == "csv" {
		csvBody, err := AuditCSV(entries)
		if err != nil {
			h.handleErr(w, err)
			return
		}
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename="audit-console.csv"`)
		_, _ = w.Write([]byte(csvBody))
		return
	}

	response.OK(w, map[string]any{
		"items": entries,
		"total": len(entries),
		"mode":  h.enforceMode(r),
	})
}

// enforceMode dit si le refus est réellement appliqué à cet instant.
func (h *Handler) enforceMode(r *http.Request) string {
	if h.console == nil {
		return adminauthz.ModeObserve.String()
	}
	if resolver, ok := h.console.Lookup().(adminauthz.ModeResolver); ok && resolver != nil {
		if resolver.Enforce(r.Context()) {
			return adminauthz.ModeEnforce.String()
		}
	}
	return adminauthz.ModeObserve.String()
}

// GET /v1/admin/access/decisions — journal des décisions du garde.
func (h *Handler) accessDecisions(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireAuthenticated(w, r); !ok {
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	windowHours, _ := strconv.Atoi(r.URL.Query().Get("window"))
	window := time.Duration(windowHours) * time.Hour
	filter := AuthzDecisionFilter{
		Capability: r.URL.Query().Get("capability"),
		OnlyDenied: r.URL.Query().Get("denied") == "1",
		UserID:     r.URL.Query().Get("userId"),
		Window:     window,
		Limit:      int32(limit),
	}
	groups, err := h.svc.ListAuthzDecisionGroups(r.Context(), window)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	items, err := h.svc.ListAuthzDecisions(r.Context(), filter)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]any{
		"items":  items,
		"groups": groups,
		"mode":   h.enforceMode(r),
	})
}

// PATCH /v1/admin/api-access/modules — active / désactive les modules accordables.
func (h *Handler) updateApiAccessModules(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	var in struct {
		Enabled []string `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if err := h.svc.UpdateApiAccessModules(r.Context(), userID, in.Enabled); err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// ── Notifications & livraisons ───────────────────────────────────────────────

// GET /v1/admin/deliveries — compteurs + 50 dernières livraisons.
func (h *Handler) deliveries(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireAuthenticated(w, r)
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
	userID, ok := h.requireAuthenticated(w, r)
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
