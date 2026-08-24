package collaborations

import (
	"encoding/json"
	"errors"
	"log"
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
	r.Route("/v1/collaborations", func(r chi.Router) {
		r.Get("/", h.list)
		r.Post("/invite-by-email", h.inviteByEmail)
		r.Post("/invite", h.invite)
		r.Post("/{requestId}/respond", h.respond)
		r.Delete("/{articleId}/contributors/{contributorId}", h.removeContributor)
		r.Post("/{articleId}/withdraw", h.withdraw)
	})
}

// writeError convertit une erreur en réponse HTTP (messages métier exposés tels quels).
func writeError(w http.ResponseWriter, err error) {
	var ce *ErrorCollab
	if errors.As(err, &ce) {
		response.BadRequest(w, ce.Error())
		return
	}
	switch {
	case errors.Is(err, errForbidden):
		response.Forbidden(w, "Accès refusé.")
	case errors.Is(err, errNotFound):
		response.NotFound(w, "Ressource introuvable")
	default:
		log.Printf("[collaborations] %v", err)
		response.Internal(w)
	}
}

// GET /v1/collaborations — demandes reçues + envoyées.
func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	received, sent, err := h.svc.ListRequests(r.Context(), userID)
	if err != nil {
		writeError(w, err)
		return
	}
	response.OK(w, map[string]any{"received": received, "sent": sent})
}

// POST /v1/collaborations/invite-by-email — {articleId, inviteeEmail}.
func (h *Handler) inviteByEmail(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	var in struct {
		ArticleID    string `json:"articleId"`
		InviteeEmail string `json:"inviteeEmail"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if in.ArticleID == "" || in.InviteeEmail == "" {
		response.BadRequest(w, "articleId et inviteeEmail requis")
		return
	}
	req, err := h.svc.InviteByEmail(r.Context(), userID, in.ArticleID, in.InviteeEmail)
	if err != nil {
		writeError(w, err)
		return
	}
	response.Created(w, map[string]any{"success": true, "request": req})
}

// POST /v1/collaborations/invite — {articleId, inviteeId, role?, order?}.
func (h *Handler) invite(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	var in struct {
		ArticleID string `json:"articleId"`
		InviteeID string `json:"inviteeId"`
		Role      string `json:"role"`
		Order     int32  `json:"order"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if in.ArticleID == "" || in.InviteeID == "" {
		response.BadRequest(w, "articleId et inviteeId requis")
		return
	}
	req, err := h.svc.InviteContributor(r.Context(), userID, in.ArticleID, in.InviteeID, in.Role, in.Order)
	if err != nil {
		writeError(w, err)
		return
	}
	response.Created(w, map[string]any{"success": true, "request": req})
}

// POST /v1/collaborations/{requestId}/respond — {accept, showOnPublicProfile}.
func (h *Handler) respond(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	requestID := chi.URLParam(r, "requestId")
	var in struct {
		Accept             bool `json:"accept"`
		ShowOnPublicProfile bool `json:"showOnPublicProfile"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if err := h.svc.Respond(r.Context(), userID, requestID, in.Accept, in.ShowOnPublicProfile); err != nil {
		writeError(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// DELETE /v1/collaborations/{articleId}/contributors/{contributorId}.
func (h *Handler) removeContributor(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	articleID := chi.URLParam(r, "articleId")
	contributorID := chi.URLParam(r, "contributorId")
	if err := h.svc.RemoveContributor(r.Context(), userID, articleID, contributorID); err != nil {
		writeError(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// POST /v1/collaborations/{articleId}/withdraw — retrait de consentement.
func (h *Handler) withdraw(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	articleID := chi.URLParam(r, "articleId")
	if err := h.svc.WithdrawConsent(r.Context(), userID, articleID); err != nil {
		writeError(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}
