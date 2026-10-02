package admin

// =====================================================================
// 🗓️ Revue périodique des accès staff — façade HTTP (Phase 8)
// =====================================================================
// Trois routes sous contrôle de capacité et niveau de preuve :
//
//   1. GET /v1/admin/access/reviews : liste des revues mensuelles archivées
//      avec l'instantané calculé en direct (`admin.access.read`) ;
//   2. GET /v1/admin/access/reviews/{period} : relecture d'un mois scellé
//      (`admin.access.read`) ;
//   3. POST /v1/admin/access/reviews/snapshot : scellement manuel ou forcé
//      d'une revue (`admin.access.grant` + preuve forte N2 StepUp).
// =====================================================================

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/response"
)

// GET /v1/admin/access/reviews — revues périodiques archivées + rapport en direct.
// Query : ?limit= (max 100, défaut 24).
// Réponse : { "current": AccessReviewReport, "items": []AccessReview, "total": int }
func (h *Handler) accessReviews(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireAuthenticated(w, r); !ok {
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	current, err := h.svc.ComputeAccessReviewReport(r.Context(), "")
	if err != nil {
		h.handleErr(w, err)
		return
	}
	items, err := h.svc.ListAccessReviews(r.Context(), limit)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]any{
		"current": current,
		"items":   items,
		"total":   len(items),
	})
}

// GET /v1/admin/access/reviews/{period} — revue d'une période précise ('AAAA-MM').
func (h *Handler) accessReviewPeriod(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireAuthenticated(w, r); !ok {
		return
	}
	period := chi.URLParam(r, "period")
	rev, err := h.svc.GetAccessReview(r.Context(), period)
	if errors.Is(err, ErrReviewNotFound) {
		response.NotFound(w, "Revue d'accès introuvable pour cette période.")
		return
	}
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, rev)
}

// POST /v1/admin/access/reviews/snapshot — déclenchement d'un instantané mensuel.
// Body optionnel : { "period": "AAAA-MM", "force": bool, "reason": "..." }
// Nécessite la capacité admin.access.grant et une preuve N2 (step-up).
func (h *Handler) triggerAccessReviewSnapshot(w http.ResponseWriter, r *http.Request) {
	actorID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	var in struct {
		Period string `json:"period"`
		Force  bool   `json:"force"`
		Reason string `json:"reason"`
	}
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&in)
	}
	rev, err := h.svc.SnapshotAccessReview(r.Context(), in.Period, in.Force)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	reason := in.Reason
	if reason == "" {
		reason = "Instantané de la revue périodique des accès"
	}
	h.svc.logAccessAudit(r.Context(), actorID, "access.review.snapshot", "admin.access.grant", rev.Period, reason, nil, map[string]any{
		"period":       rev.Period,
		"activeGrants": rev.Report.ActiveGrants,
		"totalStaff":   rev.Report.TotalStaff,
	})
	response.Created(w, rev)
}
