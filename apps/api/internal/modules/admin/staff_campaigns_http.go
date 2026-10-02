package admin

// ── Routes HTTP du centre de campagnes (console d'administration) ─────
// Façade fine sur le service : chaque route est déclarée sur la console avec
// la capacité qu'elle exige (admin.campaigns.read|write), donc le droit est
// prouvé par construction et non par un helper local. Erreurs métier mappées
// en codes exploitables, jamais de 500 muette.

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/adminauthz"
	"github.com/qoefi/api/internal/authz"
	"github.com/qoefi/api/internal/response"
)

// registerStaffCampaigns déclare et monte les routes du centre de campagnes
// sur la console : lire une campagne exige admin.campaigns.read, la créer ou
// la faire avancer exige admin.campaigns.write. Le rôle est donc prouvé par
// route, sans dépendre d'un helper local.
//
// Les mouvements (créer, modifier, soumettre, approuver, démarrer, suspendre,
// annuler) exigent en plus une preuve forte récente (N2) : une campagne écrit à
// des milliers d'adresses au nom de la plateforme ; une session détournée ne
// doit pas pouvoir en lancer une.
func (h *Handler) registerStaffCampaigns() {
	c := h.console
	stepUp := adminauthz.WithProofLevel(authz.Level2)
	c.Get("/v1/admin/campaigns", adminauthz.CampaignsRead, h.listCampaigns)
	c.Post("/v1/admin/campaigns", adminauthz.CampaignsWrite, h.createCampaign, stepUp)
	c.Get("/v1/admin/campaigns/{id}", adminauthz.CampaignsRead, h.getCampaign)
	c.Patch("/v1/admin/campaigns/{id}", adminauthz.CampaignsWrite, h.updateCampaign, stepUp)
	c.Post("/v1/admin/campaigns/{id}/submit", adminauthz.CampaignsWrite, h.submitCampaign, stepUp)
	c.Post("/v1/admin/campaigns/{id}/approve", adminauthz.CampaignsWrite, h.approveCampaign, stepUp)
	c.Post("/v1/admin/campaigns/{id}/start", adminauthz.CampaignsWrite, h.startCampaign, stepUp)
	c.Post("/v1/admin/campaigns/{id}/pause", adminauthz.CampaignsWrite, h.pauseCampaign, stepUp)
	c.Post("/v1/admin/campaigns/{id}/cancel", adminauthz.CampaignsWrite, h.cancelCampaign, stepUp)
}

func (h *Handler) listCampaigns(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireAuthenticated(w, r); !ok {
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
	staffID, ok := h.requireAuthenticated(w, r)
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
	if _, ok := h.requireAuthenticated(w, r); !ok {
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
	staffID, ok := h.requireAuthenticated(w, r)
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
	staffID, ok := h.requireAuthenticated(w, r)
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
	staffID, ok := h.requireAuthenticated(w, r)
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
	staffID, ok := h.requireAuthenticated(w, r)
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
	if _, ok := h.requireAuthenticated(w, r); !ok {
		return
	}
	if err := h.svc.PauseCampaign(r.Context(), chi.URLParam(r, "id")); err != nil {
		h.campaignErr(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

func (h *Handler) cancelCampaign(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireAuthenticated(w, r); !ok {
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
