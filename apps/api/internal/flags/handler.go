// Handler HTTP des feature flags — expose GET /v1/flags (public).
// L'UI (web/studio/admin) lit les mêmes flags via @qoe/flags ; cet endpoint
// sert aux clients non-Supabase (widgets, intégrations) et à la vérification
// que l'état serveur correspond bien à la console.
package flags

import (
	"net/http"
	"sort"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/response"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// RegisterPublic monte GET /v1/flags (public, sans auth — les flags UI sont
// déjà exposés au client via @qoe/flags ; rien de sensible ici).
func (h *Handler) RegisterPublic(r chi.Router) {
	r.Get("/v1/flags", h.list)
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	all := h.svc.All(r.Context())
	keys := make([]string, 0, len(all))
	for k := range all {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	response.OK(w, all)
}
