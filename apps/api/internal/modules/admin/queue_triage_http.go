package admin

// Routes de triage : une route par file, chacune avec la capacité de DÉCISION
// de son domaine. Une seule route générique obligerait à choisir une capacité
// unique, donc à élargir un droit pour toutes les files — exactement ce que le
// vocabulaire fermé évite.

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/adminauthz"
	"github.com/qoefi/api/internal/authz"
	"github.com/qoefi/api/internal/response"
)

func (h *Handler) registerQueueTriage() {
	c := h.console
	c.Put("/v1/admin/reports/{id}/triage", adminauthz.ReportsWrite, h.queueTriage(QueueReports))
	// Les quatre files qui portent un pouvoir de décision suivent le niveau de
	// leur capacité : le triage y est un acte lourd (preuve forte récente).
	stepUp := adminauthz.WithProofLevel(authz.Level2)
	c.Put("/v1/admin/abuse/appeals/{id}/triage", adminauthz.AppealsDecide, h.queueTriage(QueueAppeals), stepUp)
	c.Put("/v1/admin/abuse/decisions/{id}/triage", adminauthz.AbuseDecide, h.queueTriage(QueueAbuse), stepUp)
	c.Put("/v1/admin/import/subscribers/{id}/triage", adminauthz.ImportsReview, h.queueTriage(QueueImports), stepUp)
	c.Put("/v1/admin/approvals/{id}/triage", adminauthz.LegalWrite, h.queueTriage(QueueApprovals), stepUp)
	c.Put("/v1/admin/support/tickets/{id}/triage", adminauthz.SupportWrite, h.queueTriage(QueueSupport))
}

func (h *Handler) queueTriage(queue string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		staffID, ok := h.requireAuthenticated(w, r)
		if !ok {
			return
		}
		var in TriageUpdate
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			response.BadRequest(w, "JSON invalide")
			return
		}
		entry, err := h.svc.UpdateQueueTriage(r.Context(), staffID, queue, chi.URLParam(r, "id"), in)
		if err != nil {
			switch {
			case errors.Is(err, errQueueUnknown):
				response.NotFound(w, "File inconnue.")
			case errors.Is(err, errInvalidTriage):
				response.BadRequest(w, err.Error())
			default:
				h.handleErr(w, err)
			}
			return
		}
		response.OK(w, entry)
	}
}
