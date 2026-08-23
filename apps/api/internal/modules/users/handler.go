package users

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/response"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) Register(r chi.Router) {
	r.Route("/v1/users", func(r chi.Router) {
		r.Get("/search", h.search)
	})
}

func (h *Handler) search(w http.ResponseWriter, r *http.Request) {
	_, _ = middleware.UserID(r.Context())
	query := r.URL.Query().Get("q")
	if len(query) < 2 {
		response.OK(w, []Contributor{})
		return
	}
	// excludeIds: comma-separated ?excludeIds=id1,id2 ou répété ?excludeIds=id1&excludeIds=id2
	var excludeIds []string
	for _, v := range r.URL.Query()["excludeIds"] {
		if v == "" {
			continue
		}
		// support JSON array string
		var arr []string
		if err := json.Unmarshal([]byte(v), &arr); err == nil && len(arr) > 0 {
			excludeIds = append(excludeIds, arr...)
			continue
		}
		// comma-separated
		for _, part := range splitComma(v) {
			if part != "" {
				excludeIds = append(excludeIds, part)
			}
		}
	}
	for _, v := range r.URL.Query()["excludeId"] {
		if v != "" {
			excludeIds = append(excludeIds, v)
		}
	}
	results, err := h.svc.SearchForContributors(r.Context(), query, excludeIds)
	if err != nil {
		response.Internal(w)
		return
	}
	response.OK(w, results)
}

func splitComma(s string) []string {
	var out []string
	start := 0
	for i := 0; i <= len(s); i++ {
		if i == len(s) || s[i] == ',' {
			out = append(out, s[start:i])
			start = i + 1
		}
	}
	return out
}
