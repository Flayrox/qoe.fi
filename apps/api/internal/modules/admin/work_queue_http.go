package admin

import (
	"net/http"

	"github.com/qoefi/api/internal/response"
)

func (h *Handler) workQueue(w http.ResponseWriter, r *http.Request) {
	userID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}
	view, err := h.svc.GetWorkQueue(r.Context(), userID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	response.OK(w, view)
}
