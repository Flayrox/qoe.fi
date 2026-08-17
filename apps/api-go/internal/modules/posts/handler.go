package posts

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

type createThoughtInput struct {
	Content          string            `json:"content"`
	Tags             []string          `json:"tags"`
	ImageURL         *string           `json:"imageUrl,omitempty"`
	ParentID         *string           `json:"parentId,omitempty"`
	RepostID         *string           `json:"repostId,omitempty"`
	ReplyRestriction string            `json:"replyRestriction,omitempty"`
	Attachments      []AttachmentInput `json:"attachments,omitempty"`
	Poll             *PollInput        `json:"poll,omitempty"`
}

func (h *Handler) Register(r chi.Router) {
	r.Route("/v1/posts", func(r chi.Router) {
		r.Post("/", h.create)
		r.Get("/{id}", h.get)
		r.Delete("/{id}", h.delete)
		r.Get("/{id}/likes", h.likes)
		r.Get("/{id}/reposts", h.reposts)
		r.Get("/{id}/quotes", h.quotes)
		r.Post("/{id}/like", h.toggleLike)
		r.Post("/{id}/repost", h.toggleRepost)
		r.Post("/{id}/reply", h.reply)
		r.Post("/{id}/bookmark", h.toggleBookmark)
		r.Post("/{id}/pin", h.togglePin)
		r.Post("/{id}/poll/vote", h.votePoll)
		r.Post("/{id}/poll/unvote", h.unvotePoll)
	})
	r.Post("/v1/users/{id}/block", h.toggleBlock)
	r.Post("/v1/users/{id}/mute", h.toggleMute)
	r.Post("/v1/reports", h.createReport)
	// Aliases mobile (parité Hono apps/api) : /v1/thoughts → posts.
	r.Route("/v1/thoughts", func(r chi.Router) {
		r.Post("/", h.create)
		r.Post("/{id}/like", h.toggleLike)
		r.Post("/{id}/repost", h.toggleRepost)
		r.Post("/{id}/bookmark", h.toggleBookmark)
	})
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())

	var in createThoughtInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}

	post, err := h.svc.CreateFull(r.Context(), userID, CreateFullInput{
		Content:          in.Content,
		Tags:             in.Tags,
		ImageURL:         in.ImageURL,
		ParentID:         in.ParentID,
		RepostID:         in.RepostID,
		ReplyRestriction: in.ReplyRestriction,
		Attachments:      in.Attachments,
		Poll:             in.Poll,
	})
	if err != nil {
		response.BadRequest(w, err.Error())
		return
	}
	response.Created(w, post)
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")

	post, err := h.svc.Get(r.Context(), id, userID)
	if err != nil {
		if errors.Is(err, errThoughtNotFound) {
			response.NotFound(w, "Post introuvable")
			return
		}
		response.Internal(w)
		return
	}
	response.OK(w, post)
}

func (h *Handler) likes(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	limit, offset := parsePage(r)

	page, err := h.svc.Likes(r.Context(), id, limit, offset)
	if err != nil {
		log.Printf("[posts] likes: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, page)
}

func (h *Handler) reposts(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	limit, offset := parsePage(r)

	page, err := h.svc.Reposts(r.Context(), id, limit, offset)
	if err != nil {
		log.Printf("[posts] reposts: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, page)
}

func (h *Handler) quotes(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")
	limit, offset := parsePage(r)

	page, err := h.svc.Quotes(r.Context(), id, userID, limit, offset)
	if err != nil {
		log.Printf("[posts] quotes: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, page)
}

func parsePage(r *http.Request) (limit, offset int) {
	limit, _ = strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	if c := r.URL.Query().Get("cursor"); c != "" {
		offset, _ = strconv.Atoi(c)
	}
	if offset < 0 {
		offset = 0
	}
	return limit, offset
}

func (h *Handler) toggleBlock(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	targetID := chi.URLParam(r, "id")

	blocked, err := h.svc.ToggleBlock(r.Context(), targetID, userID)
	if err != nil {
		log.Printf("[posts] block: %v", err)
		response.BadRequest(w, err.Error())
		return
	}
	response.OK(w, map[string]bool{"blocked": blocked})
}

func (h *Handler) toggleMute(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	targetID := chi.URLParam(r, "id")

	muted, err := h.svc.ToggleMute(r.Context(), targetID, userID)
	if err != nil {
		log.Printf("[posts] mute: %v", err)
		response.BadRequest(w, err.Error())
		return
	}
	response.OK(w, map[string]bool{"muted": muted})
}

type reportInput struct {
	TargetID   string `json:"targetId"`
	TargetType string `json:"targetType"`
	Reason     string `json:"reason"`
	Details    string `json:"details,omitempty"`
}

func (h *Handler) createReport(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())

	var in reportInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if err := h.svc.Report(r.Context(), userID, in.TargetID, in.TargetType, in.Reason, in.Details); err != nil {
		response.BadRequest(w, err.Error())
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

func (h *Handler) toggleLike(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")

	liked, err := h.svc.ToggleLike(r.Context(), id, userID)
	if err != nil {
		log.Printf("[posts] like: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]bool{"liked": liked})
}

func (h *Handler) toggleRepost(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")

	reposted, err := h.svc.ToggleRepost(r.Context(), id, userID)
	if err != nil {
		log.Printf("[posts] repost: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]bool{"reposted": reposted})
}

func (h *Handler) reply(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	parentID := chi.URLParam(r, "id")

	var in createThoughtInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}

	post, err := h.svc.Reply(r.Context(), parentID, userID, in.Content)
	if err != nil {
		response.BadRequest(w, err.Error())
		return
	}
	response.Created(w, post)
}

type votePollInput struct {
	OptionID string `json:"optionId"`
}

// POST /v1/posts/{id}/poll/vote — vote sur un sondage (idempotent).
func (h *Handler) votePoll(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")

	var in votePollInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if in.OptionID == "" {
		response.BadRequest(w, "optionId requis")
		return
	}

	poll, err := h.svc.VotePoll(r.Context(), id, in.OptionID, userID)
	if err != nil {
		response.BadRequest(w, err.Error())
		return
	}
	response.OK(w, poll)
}

// POST /v1/posts/{id}/poll/unvote — retire le vote.
func (h *Handler) unvotePoll(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")

	poll, err := h.svc.UnvotePoll(r.Context(), id, userID)
	if err != nil {
		response.BadRequest(w, err.Error())
		return
	}
	response.OK(w, poll)
}

func (h *Handler) toggleBookmark(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")

	bookmarked, err := h.svc.ToggleBookmark(r.Context(), id, userID)
	if err != nil {
		log.Printf("[posts] bookmark: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]bool{"bookmarked": bookmarked})
}

// DELETE /v1/posts/{id} — suppression (soft) par l'auteur.
func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")

	if err := h.svc.Delete(r.Context(), id, userID); err != nil {
		if errors.Is(err, errThoughtNotFound) {
			response.NotFound(w, "Post introuvable")
			return
		}
		response.BadRequest(w, err.Error())
		return
	}
	response.OK(w, map[string]bool{"deleted": true})
}

// POST /v1/posts/{id}/pin — épingle/désépingle sur le profil.
func (h *Handler) togglePin(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")

	pinned, err := h.svc.TogglePin(r.Context(), id, userID)
	if err != nil {
		response.BadRequest(w, err.Error())
		return
	}
	response.OK(w, map[string]bool{"pinned": pinned})
}
