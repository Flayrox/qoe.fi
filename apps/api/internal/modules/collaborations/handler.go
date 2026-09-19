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
		r.Post("/invite", h.invite)
		r.Post("/invite-by-username", h.inviteByUsername)
		r.Post("/{requestId}/respond", h.respond)
		r.Delete("/{articleId}/contributors/{contributorId}", h.removeContributor)
		r.Post("/{articleId}/withdraw", h.withdraw)

		// Liens d'invitation d'articles
		r.Post("/links", h.createLink)
		r.Get("/links/article/{articleId}", h.listLinks)
		r.Post("/links/{linkId}/revoke", h.revokeLink)
		r.Get("/links/{token}", h.getLinkPreview)
		r.Post("/links/{token}/join", h.joinLink)
	})
}

// RegisterPublic permet d'exposer la prévisualisation d'un lien publiquement si nécessaire.
func (h *Handler) RegisterPublic(r chi.Router) {
	r.Get("/v1/collaborations/public-links/{token}", h.getLinkPreview)
}

// writeError convertit une erreur en réponse HTTP.
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

// POST /v1/collaborations/invite-by-username — {articleId, username}.
func (h *Handler) inviteByUsername(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	var in struct {
		ArticleID string `json:"articleId"`
		Username  string `json:"username"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if in.ArticleID == "" || in.Username == "" {
		response.BadRequest(w, "articleId et username requis")
		return
	}
	req, err := h.svc.InviteByUsername(r.Context(), userID, in.ArticleID, in.Username)
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
		Accept              bool `json:"accept"`
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

// POST /v1/collaborations/links — {articleId, role?, expiresInHours?, maxUses?}.
func (h *Handler) createLink(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	var in struct {
		ArticleID string `json:"articleId"`
		Role      string `json:"role"`
		// Pointeurs pour distinguer « absent » (défauts sûrs : 24 h, 1 usage)
		// de « 0 explicite » (permanent / illimité).
		ExpiresInHours *int `json:"expiresInHours"`
		MaxUses        *int `json:"maxUses"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if in.ArticleID == "" {
		response.BadRequest(w, "articleId requis")
		return
	}
	expiresInHours, maxUses := 24, 1
	if in.ExpiresInHours != nil {
		expiresInHours = *in.ExpiresInHours
	}
	if in.MaxUses != nil {
		maxUses = *in.MaxUses
	}
	link, err := h.svc.CreateInviteLink(r.Context(), userID, in.ArticleID, in.Role, expiresInHours, maxUses)
	if err != nil {
		writeError(w, err)
		return
	}
	response.Created(w, map[string]any{"success": true, "link": link})
}

// GET /v1/collaborations/links/article/{articleId} — liste les liens d'un article.
func (h *Handler) listLinks(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	articleID := chi.URLParam(r, "articleId")
	links, err := h.svc.ListInviteLinks(r.Context(), userID, articleID)
	if err != nil {
		writeError(w, err)
		return
	}
	response.OK(w, map[string]any{"links": links})
}

// POST /v1/collaborations/links/{linkId}/revoke — révoque un lien.
func (h *Handler) revokeLink(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	linkID := chi.URLParam(r, "linkId")
	if err := h.svc.RevokeInviteLink(r.Context(), userID, linkID); err != nil {
		writeError(w, err)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// GET /v1/collaborations/links/{token} — aperçu d'un lien d'invitation.
func (h *Handler) getLinkPreview(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	preview, err := h.svc.GetInviteLinkPreview(r.Context(), token)
	if err != nil {
		writeError(w, err)
		return
	}
	response.OK(w, preview)
}

// POST /v1/collaborations/links/{token}/join — accepter et rejoindre via le lien.
func (h *Handler) joinLink(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	token := chi.URLParam(r, "token")
	res, err := h.svc.JoinViaInviteLink(r.Context(), userID, token)
	if err != nil {
		writeError(w, err)
		return
	}
	response.OK(w, res)
}
