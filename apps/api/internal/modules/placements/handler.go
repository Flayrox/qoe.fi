package placements

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/adminauthz"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/response"
)

type Handler struct {
	svc *Service
	// console déclare et monte les routes /v1/admin/placements* sous le garde
	// de capacité. Sans console partagée (tests unitaires), RegisterAdmin en
	// crée une autonome : pas d'enregistrement direct sur le routeur.
	console *adminauthz.Console
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// SetConsole branche la console partagée de la plateforme (même registre
// route → capacité que les autres modules /v1/admin/*).
func (h *Handler) SetConsole(c *adminauthz.Console) { h.console = c }

// RegisterPublic monte les routes publiques et lecteur (auth optionnelle).
func (h *Handler) RegisterPublic(r chi.Router) {
	r.Get("/v1/placements", h.getPlacements)
	r.Post("/v1/placements/{id}/dismiss", h.dismissPlacement)
}

// RegisterAdmin déclare et monte les routes d'administration des placements.
//
// Les placements n'ont pas de capacité dédiée au vocabulaire : ils alimentent
// les widgets in-app, donc lire demande admin.widgets.read et modifier demande
// admin.widgets.write. Le helper requireSuperadmin reste en plus (le service
// vérifie le rôle) : la défense en profondeur survit au mode observation.
func (h *Handler) RegisterAdmin(r chi.Router) {
	if h.console == nil {
		h.console = adminauthz.NewStandaloneConsole(r)
	}
	c := h.console
	c.Get("/v1/admin/placements", adminauthz.WidgetsRead, h.listPlacementsAdmin)
	c.Post("/v1/admin/placements", adminauthz.WidgetsWrite, h.createPlacementAdmin)
	c.Put("/v1/admin/placements/{id}", adminauthz.WidgetsWrite, h.updatePlacementAdmin)
	c.Delete("/v1/admin/placements/{id}", adminauthz.WidgetsWrite, h.deletePlacementAdmin)
}

// GET /v1/placements?slot=xxx OR ?slots=a,b,c
func (h *Handler) getPlacements(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	now := time.Now().UTC()

	singleSlot := strings.TrimSpace(r.URL.Query().Get("slot"))
	slotsParam := strings.TrimSpace(r.URL.Query().Get("slots"))

	// Requête mono-slot
	if singleSlot != "" {
		placement, err := h.svc.GetActivePlacementForSlot(r.Context(), singleSlot, userID, now)
		if err != nil {
			log.Printf("[placements] get slot %s: %v", singleSlot, err)
			response.Internal(w)
			return
		}
		response.OK(w, placement)
		return
	}

	// Requête multi-slots (optimisation anti-waterfall 2027)
	if slotsParam != "" {
		slots := strings.Split(slotsParam, ",")
		result := make(map[string]*Placement, len(slots))
		for _, s := range slots {
			slotName := strings.TrimSpace(s)
			if slotName == "" {
				continue
			}
			p, err := h.svc.GetActivePlacementForSlot(r.Context(), slotName, userID, now)
			if err != nil {
				log.Printf("[placements] batch slot %s: %v", slotName, err)
				result[slotName] = nil
				continue
			}
			result[slotName] = p
		}
		response.OK(w, result)
		return
	}

	response.BadRequest(w, "Paramètre 'slot' ou 'slots' requis")
}

// POST /v1/placements/{id}/dismiss
func (h *Handler) dismissPlacement(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if strings.TrimSpace(id) == "" {
		response.BadRequest(w, "Identifiant placement manquant")
		return
	}

	userID, ok := middleware.UserID(r.Context())
	if !ok || userID == "" {
		// Visiteur anonyme : acquitté côté client en localStorage
		response.OK(w, map[string]any{"success": true, "guest": true})
		return
	}

	if err := h.svc.DismissPlacement(r.Context(), id, userID, time.Now().UTC()); err != nil {
		log.Printf("[placements] dismiss %s for %s: %v", id, userID, err)
		response.Internal(w)
		return
	}

	response.OK(w, map[string]any{"success": true})
}

// Helper pour sécuriser l'accès superadmin
func (h *Handler) requireSuperadmin(w http.ResponseWriter, r *http.Request) (string, bool) {
	userID, ok := middleware.UserID(r.Context())
	if !ok || userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return "", false
	}
	if err := h.svc.CheckSuperadmin(r.Context(), userID); err != nil {
		response.Forbidden(w, "Accès réservé au superadmin")
		return "", false
	}
	return userID, true
}

// GET /v1/admin/placements
func (h *Handler) listPlacementsAdmin(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireSuperadmin(w, r); !ok {
		return
	}

	list, err := h.svc.ListPlacements(r.Context())
	if err != nil {
		log.Printf("[admin/placements] list: %v", err)
		response.Internal(w)
		return
	}

	response.OK(w, map[string]any{"placements": list, "count": len(list)})
}

// POST /v1/admin/placements
func (h *Handler) createPlacementAdmin(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireSuperadmin(w, r); !ok {
		return
	}

	var p Placement
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}

	created, err := h.svc.CreatePlacement(r.Context(), &p)
	if err != nil {
		if errors.Is(err, ErrInvalidPlacement) {
			response.BadRequest(w, err.Error())
			return
		}
		log.Printf("[admin/placements] create: %v", err)
		response.Internal(w)
		return
	}

	response.Created(w, created)
}

// PUT /v1/admin/placements/{id}
func (h *Handler) updatePlacementAdmin(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireSuperadmin(w, r); !ok {
		return
	}

	id := chi.URLParam(r, "id")
	var p Placement
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	p.ID = id

	updated, err := h.svc.UpdatePlacement(r.Context(), &p)
	if err != nil {
		if errors.Is(err, ErrPlacementNotFound) {
			response.NotFound(w, "Placement introuvable")
			return
		}
		if errors.Is(err, ErrInvalidPlacement) {
			response.BadRequest(w, err.Error())
			return
		}
		log.Printf("[admin/placements] update %s: %v", id, err)
		response.Internal(w)
		return
	}

	response.OK(w, updated)
}

// DELETE /v1/admin/placements/{id}
func (h *Handler) deletePlacementAdmin(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireSuperadmin(w, r); !ok {
		return
	}

	id := chi.URLParam(r, "id")
	if err := h.svc.DeletePlacement(r.Context(), id); err != nil {
		if errors.Is(err, ErrPlacementNotFound) {
			response.NotFound(w, "Placement introuvable")
			return
		}
		log.Printf("[admin/placements] delete %s: %v", id, err)
		response.Internal(w)
		return
	}

	response.OK(w, map[string]any{"success": true})
}
