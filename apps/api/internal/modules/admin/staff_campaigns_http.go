package admin

// ── Routes HTTP du centre de campagnes (console superadmin) ─────────────
// Façade fine sur le service : chaque handler vérifie le superadmin (le
// groupe chi est déjà protégé, mais la vérification explicite par route évite
// qu'un futur déplacement de route n'ouvre une voie sans garde).
// Erreurs métier mappées en codes exploitables, jamais de 500 muette.

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/response"
)

func (h *Handler) registerStaffCampaigns(r chi.Router) {
	r.Get("/v1/admin/campaigns", h.listCampaigns)
	r.Post("/v1/admin/campaigns", h.createCampaign)
	r.Get("/v1/admin/campaigns/{id}", h.getCampaign)
	r.Patch("/v1/admin/campaigns/{id}", h.updateCampaign)
	r.Post("/v1/admin/campaigns/{id}/submit", h.submitCampaign)
	r.Post("/v1/admin/campaigns/{id}/approve", h.approveCampaign)
	r.Post("/v1/admin/campaigns/{id}/start", h.startCampaign)
	r.Post("/v1/admin/campaigns/{id}/pause", h.pauseCampaign)
	r.Post("/v1/admin/campaigns/{id}/cancel", h.cancelCampaign)
}

func (h *Handler) listCampaigns(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireSuperadmin(w, r); !ok {
		return
	}
	items, err := h.svc.ListCampaigns(r.Context(), 50)
	if err != nil {
		log.Printf("[admin] campagnes: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{"items": items})
}

func (h *Handler) createCampaign(w http.ResponseWriter, r *http.Request) {
	staffID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	var in StaffCampaignInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	dto, err := h.svc.CreateCampaign(r.Context(), staffID, in)
	if err != nil {
		response.BadRequest(w, err.Error())
		return
	}
	response.Created(w, dto)
}

func (h *Handler) getCampaign(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireSuperadmin(w, r); !ok {
		return
	}
	dto, err := h.svc.GetCampaign(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		if errors.Is(err, ErrCampaignNotFound) {
			response.NotFound(w, "Campagne introuvable")
			return
		}
		log.Printf("[admin] campagne: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, dto)
}

func (h *Handler) updateCampaign(w http.ResponseWriter, r *http.Request) {
	staffID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	var in StaffCampaignInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	dto, err := h.svc.UpdateDraft(r.Context(), staffID, chi.URLParam(r, "id"), in)
	if err != nil {
		h.campaignErr(w, err)
		return
	}
	response.OK(w, dto)
}

func (h *Handler) submitCampaign(w http.ResponseWriter, r *http.Request) {
	staffID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	dto, err := h.svc.SubmitCampaign(r.Context(), staffID, chi.URLParam(r, "id"))
	if err != nil {
		h.campaignErr(w, err)
		return
	}
	response.OK(w, dto)
}

func (h *Handler) approveCampaign(w http.ResponseWriter, r *http.Request) {
	staffID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	dto, err := h.svc.ApproveCampaign(r.Context(), staffID, chi.URLParam(r, "id"))
	if err != nil {
		h.campaignErr(w, err)
		return
	}
	response.OK(w, dto)
}

func (h *Handler) startCampaign(w http.ResponseWriter, r *http.Request) {
	staffID, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	dto, err := h.svc.StartCampaign(r.Context(), staffID, chi.URLParam(r, "id"))
	if err != nil {
		h.campaignErr(w, err)
		return
	}
	response.OK(w, dto)
}

func (h *Handler) pauseCampaign(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireSuperadmin(w, r); !ok {
		return
	}
	if err := h.svc.PauseCampaign(r.Context(), chi.URLParam(r, "id")); err != nil {
		h.campaignErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

func (h *Handler) cancelCampaign(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireSuperadmin(w, r); !ok {
		return
	}
	if err := h.svc.CancelCampaign(r.Context(), chi.URLParam(r, "id")); err != nil {
		h.campaignErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// campaignErr mappe les erreurs métier en codes exploitables.
func (h *Handler) campaignErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrCampaignNotFound):
		response.NotFound(w, "Campagne introuvable")
	case errors.Is(err, ErrCampaignSelfApproval):
		response.Error(w, http.StatusConflict, "L'approbateur doit être un second superadmin, distinct du rédacteur.")
	case errors.Is(err, ErrCampaignTransition):
		response.Error(w, http.StatusConflict, "Transition d'état interdite pour cette campagne.")
	default:
		response.BadRequest(w, err.Error())
	}
}
