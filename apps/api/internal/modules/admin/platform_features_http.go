package admin

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/adminauthz"
	"github.com/qoefi/api/internal/authz"
	"github.com/qoefi/api/internal/response"
)

// registerPlatformFeatures monte les flags et le registre opérationnel sur la
// console : lecture = config.read, écriture = flags.write + N2. Aucune écriture
// directe depuis Next.js.
func (h *Handler) registerPlatformFeatures() {
	c := h.console
	stepUp := adminauthz.WithProofLevel(authz.Level2)
	c.Get("/v1/admin/feature-flags", adminauthz.ConfigRead, h.listFeatureFlags)
	c.Put("/v1/admin/feature-flags/{key}", adminauthz.FlagsWrite, h.setFeatureFlag, stepUp)
	c.Get("/v1/admin/features", adminauthz.ConfigRead, h.listFeatures)
	c.Patch("/v1/admin/features/{key}", adminauthz.FlagsWrite, h.updateFeature, stepUp)
}

func (h *Handler) listFeatureFlags(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireAuthenticated(w, r); !ok {
		return
	}
	items, err := h.svc.ListFeatureFlags(r.Context())
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]any{"items": items})
}

func (h *Handler) setFeatureFlag(w http.ResponseWriter, r *http.Request) {
	staffID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	var in struct {
		Enabled bool `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	item, err := h.svc.SetFeatureFlag(r.Context(), staffID, chi.URLParam(r, "key"), in.Enabled)
	if err != nil {
		if errors.Is(err, errInvalidFeatureFlag) {
			response.BadRequest(w, err.Error())
			return
		}
		h.handleErr(w, err)
		return
	}
	response.OK(w, item)
}

func (h *Handler) listFeatures(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireAuthenticated(w, r); !ok {
		return
	}
	items, err := h.svc.ListFeatures(r.Context())
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, map[string]any{"items": items})
}

func (h *Handler) updateFeature(w http.ResponseWriter, r *http.Request) {
	staffID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	var in UpdateFeatureInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	item, err := h.svc.UpdateFeature(r.Context(), staffID, chi.URLParam(r, "key"), in)
	if err != nil {
		if errors.Is(err, errInvalidFeature) {
			response.BadRequest(w, err.Error())
			return
		}
		h.handleErr(w, err)
		return
	}
	response.OK(w, item)
}
