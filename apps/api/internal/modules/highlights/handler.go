package highlights

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"

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

// RegisterPublic enregistre la lecture publique des surlignages (auth optionnelle) :
// les surlignages publics d'un article sont visibles sans connexion.
func (h *Handler) RegisterPublic(r chi.Router) {
	r.Get("/v1/articles/{id}/highlights", h.listByArticle)
}

// RegisterProtected enregistre les routes nécessitant une authentification :
// création/suppression de surlignages, upvotes, commentaires, bibliothèque
// (bookmarks + mes surlignages).
func (h *Handler) RegisterProtected(r chi.Router) {
	// Bibliothèque (auth requise).
	r.Get("/v1/bookmarks", h.bookmarks)
	r.Get("/v1/me/highlights", h.myHighlights)
	r.Get("/v1/me/highlights/count", h.myHighlightsCount)

	// Surlignages d'un article.
	r.Post("/v1/articles/{id}/highlights", h.create)
	r.Delete("/v1/highlights/{id}", h.delete)

	// Upvotes.
	r.Post("/v1/highlights/{id}/upvote", h.toggleUpvote)

	// Commentaires d'annotation.
	r.Get("/v1/highlights/{id}/comments", h.listComments)
	r.Post("/v1/highlights/{id}/comments", h.createComment)
	r.Delete("/v1/highlights/comments/{commentId}", h.deleteComment)
}

// GET /v1/articles/{id}/highlights — surlignages publics + les siens.
func (h *Handler) listByArticle(w http.ResponseWriter, r *http.Request) {
	viewerID, _ := middleware.UserID(r.Context())
	articleID := chi.URLParam(r, "id")

	items, err := h.svc.ListByArticle(r.Context(), articleID, viewerID)
	if err != nil {
		log.Printf("[highlights] list: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, items)
}

type createInput struct {
	Text     string  `json:"text"`
	Note     *string `json:"note"`
	IsPublic bool    `json:"isPublic"`
}

// POST /v1/articles/{id}/highlights — crée un surlignage.
func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	articleID := chi.URLParam(r, "id")

	var in createInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if in.Text == "" {
		response.BadRequest(w, "text requis")
		return
	}

	item, err := h.svc.Create(r.Context(), articleID, userID, in.Text, in.Note, in.IsPublic)
	if err != nil {
		log.Printf("[highlights] create: %v", err)
		response.Internal(w)
		return
	}
	response.Created(w, item)
}

// DELETE /v1/highlights/{id} — supprime un de ses surlignages.
func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")

	if _, err := h.svc.Delete(r.Context(), id, userID); err != nil {
		log.Printf("[highlights] delete: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// POST /v1/highlights/{id}/upvote — toggle upvote.
func (h *Handler) toggleUpvote(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")

	upvoted, count, err := h.svc.ToggleUpvote(r.Context(), id, userID)
	if err != nil {
		log.Printf("[highlights] upvote: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{"upvoted": upvoted, "upvotesCount": count})
}

// GET /v1/highlights/{id}/comments — commentaires d'un surlignage.
func (h *Handler) listComments(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	items, err := h.svc.ListComments(r.Context(), id)
	if err != nil {
		log.Printf("[highlights] listComments: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, items)
}

type createCommentInput struct {
	Content string `json:"content"`
}

// POST /v1/highlights/{id}/comments — crée un commentaire d'annotation.
func (h *Handler) createComment(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")

	var in createCommentInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if in.Content == "" {
		response.BadRequest(w, "content requis")
		return
	}

	comment, err := h.svc.CreateComment(r.Context(), id, userID, in.Content)
	if err != nil {
		log.Printf("[highlights] createComment: %v", err)
		response.Internal(w)
		return
	}
	response.Created(w, comment)
}

// DELETE /v1/highlights/comments/{commentId} — supprime un de ses commentaires.
func (h *Handler) deleteComment(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	commentID := chi.URLParam(r, "commentId")

	if _, err := h.svc.DeleteComment(r.Context(), commentID, userID); err != nil {
		log.Printf("[highlights] deleteComment: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// GET /v1/bookmarks — articles sauvegardés (bibliothèque), paginés.
func (h *Handler) bookmarks(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	limit, offset := parseLimitOffset(r)

	items, err := h.svc.Bookmarks(r.Context(), userID, limit, offset)
	if err != nil {
		log.Printf("[highlights] bookmarks: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, items)
}

// GET /v1/me/highlights — mes surlignages (bibliothèque), paginés.
func (h *Handler) myHighlights(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	limit, offset := parseLimitOffset(r)

	items, err := h.svc.MyHighlights(r.Context(), userID, limit, offset)
	if err != nil {
		log.Printf("[highlights] myHighlights: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, items)
}

// GET /v1/me/highlights/count — nombre de mes surlignages (badge bibliothèque).
func (h *Handler) myHighlightsCount(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	rows, err := h.svc.MyHighlights(r.Context(), userID, 1000, 0)
	if err != nil {
		log.Printf("[highlights] count: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]int{"count": len(rows)})
}

func parseLimitOffset(r *http.Request) (limit int, offset int) {
	limit, _ = strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	offset, _ = strconv.Atoi(r.URL.Query().Get("offset"))
	if offset < 0 {
		offset = 0
	}
	return limit, offset
}

// ErrNotFound est exposé pour les tests (parité des handlers).
var ErrNotFound = errors.New("not found")
