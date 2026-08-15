package articles

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api-go/internal/middleware"
	"github.com/qoefi/api-go/internal/response"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// RegisterPublic enregistre la lecture publique (auth optionnelle) — hors auth.
func (h *Handler) RegisterPublic(r chi.Router) {
	r.Get("/v1/articles/{slug}", h.getBySlug)
	r.Get("/v1/articles/{id}/comments", h.listComments)
}

// RegisterProtected enregistre les routes créateur (auth requise).
func (h *Handler) RegisterProtected(r chi.Router) {
	r.Route("/v1/articles", func(r chi.Router) {
		r.Get("/", h.list)
		r.Post("/", h.create)
		r.Patch("/{id}", h.update)
		r.Post("/{id}/publish", h.publish)
		r.Delete("/{id}", h.delete)
		r.Post("/{id}/comments", h.createComment)
		r.Delete("/comments/{commentId}", h.deleteComment)
	})
}

// GET /v1/articles/{slug}?publicationId=&viewerEmail= — lecture publique + paywall.
func (h *Handler) getBySlug(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	publicationID := r.URL.Query().Get("publicationId")
	if publicationID == "" {
		response.BadRequest(w, "publicationId requis")
		return
	}

	viewerID, _ := middleware.UserID(r.Context())
	viewerEmail := r.URL.Query().Get("viewerEmail")

	article, err := h.svc.GetBySlug(r.Context(), slug, publicationID, viewerID, viewerEmail)
	if err != nil {
		if errors.Is(err, errNotFound) {
			response.NotFound(w, "Article introuvable")
			return
		}
		log.Printf("[articles] getBySlug: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, article)
}

type createInput struct {
	PublicationID  string  `json:"publicationId"`
	Title          string  `json:"title"`
	Slug           string  `json:"slug"`
	Content        string  `json:"content"`
	IsPremium      bool    `json:"isPremium"`
	Visibility     string  `json:"visibility"`
	CategoryID     *string `json:"categoryId"`
	TierID         *string `json:"tierId"`
	SeoTitle       *string `json:"seoTitle"`
	SeoDescription *string `json:"seoDescription"`
	ReadingTime    int     `json:"readingTime"`
	Published      bool    `json:"published"`
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	var in createInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if in.PublicationID == "" || in.Title == "" {
		response.BadRequest(w, "publicationId et title requis")
		return
	}

	id, err := h.svc.Create(r.Context(), userID, CreateArticleInput{
		PublicationID: in.PublicationID, Title: in.Title, Slug: in.Slug, Content: in.Content,
		IsPremium: in.IsPremium, Visibility: in.Visibility, CategoryID: in.CategoryID,
		TierID: in.TierID, SeoTitle: in.SeoTitle, SeoDescription: in.SeoDescription,
		ReadingTime: in.ReadingTime, Published: in.Published,
	})
	if err != nil {
		response.Forbidden(w, err.Error())
		return
	}
	response.Created(w, map[string]string{"id": id})
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	publicationID := r.URL.Query().Get("publicationId")
	if publicationID == "" {
		response.BadRequest(w, "publicationId requis")
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	items, err := h.svc.List(r.Context(), userID, publicationID, limit, offset)
	if err != nil {
		response.Forbidden(w, err.Error())
		return
	}
	response.OK(w, items)
}

type updateInput struct {
	Title          string  `json:"title"`
	Content        string  `json:"content"`
	Slug           string  `json:"slug"`
	IsPremium      bool    `json:"isPremium"`
	CategoryID     *string `json:"categoryId"`
	SeoTitle       *string `json:"seoTitle"`
	SeoDescription *string `json:"seoDescription"`
	ReadingTime    int     `json:"readingTime"`
}

func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")
	var in updateInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if err := h.svc.Update(r.Context(), id, userID, UpdateArticleInput{
		Title: in.Title, Content: in.Content, Slug: in.Slug, IsPremium: in.IsPremium,
		CategoryID: in.CategoryID, SeoTitle: in.SeoTitle, SeoDescription: in.SeoDescription,
		ReadingTime: in.ReadingTime,
	}); err != nil {
		response.BadRequest(w, err.Error())
		return
	}
	response.OK(w, map[string]bool{"updated": true})
}

func (h *Handler) publish(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")
	if err := h.svc.SetStatus(r.Context(), id, userID, "PUBLISHED", true); err != nil {
		response.BadRequest(w, err.Error())
		return
	}
	response.OK(w, map[string]bool{"published": true})
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")
	if err := h.svc.Delete(r.Context(), id, userID); err != nil {
		response.BadRequest(w, err.Error())
		return
	}
	response.OK(w, map[string]bool{"deleted": true})
}

// GET /v1/articles/{id}/comments — liste publique des commentaires.
func (h *Handler) listComments(w http.ResponseWriter, r *http.Request) {
	articleID := chi.URLParam(r, "id")
	comments, err := h.svc.ListComments(r.Context(), articleID)
	if err != nil {
		log.Printf("[articles] listComments: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, comments)
}

type createCommentInput struct {
	Content  string  `json:"content"`
	ParentID *string `json:"parentId"`
}

// POST /v1/articles/{id}/comments — crée un commentaire (auth requise).
func (h *Handler) createComment(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	articleID := chi.URLParam(r, "id")
	var in createCommentInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if in.Content == "" {
		response.BadRequest(w, "content requis")
		return
	}
	comment, err := h.svc.CreateComment(r.Context(), articleID, userID, in.Content, in.ParentID)
	if err != nil {
		switch {
		case errors.Is(err, errNotFound):
			response.NotFound(w, "Article introuvable")
		case errors.Is(err, errCommentsDisabled):
			response.Forbidden(w, err.Error())
		default:
			log.Printf("[articles] createComment: %v", err)
			response.Internal(w)
		}
		return
	}
	response.Created(w, comment)
}

// DELETE /v1/articles/comments/{commentId} — supprime son commentaire (auth requise).
func (h *Handler) deleteComment(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	commentID := chi.URLParam(r, "commentId")
	if err := h.svc.DeleteComment(r.Context(), commentID, userID); err != nil {
		switch {
		case errors.Is(err, errNotFound):
			response.NotFound(w, "Commentaire introuvable")
		case errors.Is(err, errForbidden):
			response.Forbidden(w, err.Error())
		default:
			log.Printf("[articles] deleteComment: %v", err)
			response.Internal(w)
		}
		return
	}
	response.OK(w, map[string]bool{"success": true})
}
