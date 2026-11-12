package posts

import (
	"errors"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/antispam"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/response"
	"github.com/qoefi/api/internal/secguard"
	"github.com/qoefi/api/internal/trust"
)

type Handler struct {
	svc *Service
	sec *secguard.Guard
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// SetSecurityGuard attache le garde anti-spam et rate-limit temps réel (nil-safe).
func (h *Handler) SetSecurityGuard(g *secguard.Guard) *Handler {
	h.sec = g
	return h
}

func (h *Handler) enforceRateLimit(w http.ResponseWriter, r *http.Request, scope, userID string, quotas secguard.TierQuotas) bool {
	prof := h.sec.EvaluateRequest(r.Context(), r, userID)
	return h.sec.EnforceRateLimit(r.Context(), w, r, scope, userID, prof.Tier, quotas)
}

func (h *Handler) enforceThoughtWrite(w http.ResponseWriter, r *http.Request, userID, text string, validate func(trust.Tier) error) bool {
	prof := h.sec.EvaluateRequest(r.Context(), r, userID)
	if !h.sec.EnforceRateLimit(r.Context(), w, r, "thoughts", userID, prof.Tier, secguard.QuotasThoughts) {
		return false
	}
	if h.sec != nil {
		return h.sec.EnforceContentWrite(r.Context(), w, userID, "thoughts", text, prof, validate)
	}
	if err := validate(prof.Tier); err != nil {
		if !secguard.WriteRejection(w, err) {
			response.BadRequest(w, err.Error())
		}
		return false
	}
	return true
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
	IsDraft          bool              `json:"isDraft,omitempty"`
	ScheduledAt      *time.Time        `json:"scheduledAt,omitempty"`
	TriggerWarning   *string           `json:"triggerWarning,omitempty"`
	QuotedArticleID  *string           `json:"quotedArticleId,omitempty"`
	QuotedExcerpt    *string           `json:"quotedExcerpt,omitempty"`
	// Cite une annotation : le serveur en dérive l'article, l'extrait, la
	// note et l'attribution. Voir CreateFull.
	QuotedAnnotationID *string `json:"quotedAnnotationId,omitempty"`
}

func (h *Handler) Register(r chi.Router) {
	h.RegisterProtected(r)
	h.RegisterPublic(r)
}

// RegisterProtected enregistre les routes nécessitant une authentification :
// création/suppression, likes/reposts/réponses, signets, épingles, sondages, modération.
func (h *Handler) RegisterProtected(r chi.Router) {
	r.Post("/v1/posts", h.create)
	r.Delete("/v1/posts/{id}", h.delete)
	r.Post("/v1/posts/{id}/like", h.toggleLike)
	r.Post("/v1/posts/{id}/repost", h.toggleRepost)
	r.Post("/v1/posts/{id}/reply", h.reply)
	r.Post("/v1/posts/{id}/bookmark", h.toggleBookmark)
	r.Post("/v1/posts/{id}/pin", h.togglePin)
	r.Post("/v1/posts/{id}/poll/vote", h.votePoll)
	r.Post("/v1/posts/{id}/poll/unvote", h.unvotePoll)
	r.Post("/v1/users/{id}/block", h.toggleBlock)
	r.Post("/v1/users/{id}/mute", h.toggleMute)
	r.Post("/v1/reports", h.createReport)
	// Aliases mobile (parité Hono apps/api) : /v1/thoughts → posts.
	r.Post("/v1/thoughts", h.create)
	r.Post("/v1/thoughts/{id}/like", h.toggleLike)
	r.Post("/v1/thoughts/{id}/repost", h.toggleRepost)
	r.Post("/v1/thoughts/{id}/bookmark", h.toggleBookmark)
	r.Post("/v1/posts/{id}/hide", h.toggleHideReply)
}

// RegisterPublic enregistre la lecture publique d'un post et de ses listes d'engagement (auth optionnelle).
// GET /v1/posts/drafts doit être déclaré AVANT /v1/posts/{id} pour que chi
// ne capture pas "drafts" comme un id.
func (h *Handler) RegisterPublic(r chi.Router) {
	r.Get("/v1/posts/drafts", h.listDrafts)
	r.Get("/v1/posts/{id}", h.get)
	r.Get("/v1/posts/{id}/likes", h.likes)
	r.Get("/v1/posts/{id}/reposts", h.reposts)
	r.Get("/v1/posts/{id}/quotes", h.quotes)
	r.Get("/v1/posts/{id}/can-reply", h.canReply)
	r.Get("/v1/seo/sitemap-thoughts", h.sitemapThoughts)
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())

	var in createThoughtInput
	if !response.DecodeJSON(w, r, &in) {
		return
	}
	if !h.enforceThoughtWrite(w, r, userID, in.Content, func(tier trust.Tier) error {
		if in.ImageURL != nil {
			if err := antispam.ValidateSafeURL(*in.ImageURL); err != nil {
				return err
			}
		}
		for _, att := range in.Attachments {
			if err := antispam.ValidateSafeURL(att.URL); err != nil {
				return err
			}
		}
		return antispam.ValidateThought(in.Content, in.Tags, tier)
	}) {
		return
	}

	post, err := h.svc.CreateFull(r.Context(), userID, CreateFullInput{
		Content:            in.Content,
		Tags:               in.Tags,
		ImageURL:           in.ImageURL,
		ParentID:           in.ParentID,
		RepostID:           in.RepostID,
		ReplyRestriction:   in.ReplyRestriction,
		Attachments:        in.Attachments,
		Poll:               in.Poll,
		IsDraft:            in.IsDraft,
		ScheduledAt:        in.ScheduledAt,
		TriggerWarning:     in.TriggerWarning,
		QuotedArticleID:    in.QuotedArticleID,
		QuotedExcerpt:      in.QuotedExcerpt,
		QuotedAnnotationID: in.QuotedAnnotationID,
	})
	if err != nil {
		if errors.Is(err, ErrBlockedContent) {
			response.Forbidden(w, "Action impossible : ce compte est bloqué.")
			return
		}
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
	limit = middleware.ClampLimit(r.URL.Query().Get("limit"), 50, 100)
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
	if !response.DecodeJSON(w, r, &in) {
		return
	}
	if !h.enforceRateLimit(w, r, "reports", userID, secguard.QuotasReports) {
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
	if !h.enforceRateLimit(w, r, "engagement", userID, secguard.QuotasEngagement) {
		return
	}

	liked, err := h.svc.ToggleLike(r.Context(), id, userID)
	if err != nil {
		if errors.Is(err, ErrBlockedContent) {
			response.Forbidden(w, "Action impossible : ce compte est bloqué.")
			return
		}
		log.Printf("[posts] like: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]bool{"liked": liked})
}

func (h *Handler) toggleRepost(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")
	if !h.enforceRateLimit(w, r, "engagement", userID, secguard.QuotasEngagement) {
		return
	}

	reposted, err := h.svc.ToggleRepost(r.Context(), id, userID)
	if err != nil {
		if errors.Is(err, ErrBlockedContent) {
			response.Forbidden(w, "Action impossible : ce compte est bloqué.")
			return
		}
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
	if !response.DecodeJSON(w, r, &in) {
		return
	}
	if !h.enforceThoughtWrite(w, r, userID, in.Content, func(tier trust.Tier) error {
		return antispam.ValidateThought(in.Content, nil, tier)
	}) {
		return
	}

	post, err := h.svc.Reply(r.Context(), parentID, userID, in.Content)
	if err != nil {
		if errors.Is(err, ErrBlockedContent) {
			response.Forbidden(w, "Action impossible : ce compte est bloqué.")
			return
		}
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
	if !response.DecodeJSON(w, r, &in) {
		return
	}
	if in.OptionID == "" {
		response.BadRequest(w, "optionId requis")
		return
	}
	if !h.enforceRateLimit(w, r, "engagement", userID, secguard.QuotasEngagement) {
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
	if !h.enforceRateLimit(w, r, "engagement", userID, secguard.QuotasEngagement) {
		return
	}

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
	if !h.enforceRateLimit(w, r, "engagement", userID, secguard.QuotasEngagement) {
		return
	}

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

// GET /v1/posts/drafts — brouillons de l'utilisateur connecté (isDraft=true).
func (h *Handler) listDrafts(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}
	limit := middleware.ClampLimit(r.URL.Query().Get("limit"), 50, 100)
	drafts, err := h.svc.ListDrafts(r.Context(), userID, limit)
	if err != nil {
		log.Printf("[posts] drafts: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{"drafts": drafts})
}

// POST /v1/posts/{id}/hide — masque/restaure une réponse (auteur uniquement).
func (h *Handler) toggleHideReply(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")

	hidden, err := h.svc.ToggleHideReply(r.Context(), id, userID)
	if err != nil {
		response.BadRequest(w, err.Error())
		return
	}
	response.OK(w, map[string]bool{"isHiddenByAuthor": hidden})
}

// GET /v1/posts/{id}/can-reply — contrôle threadgate pour le viewer (auth optionnelle).
func (h *Handler) canReply(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")

	res, err := h.svc.CanReply(r.Context(), id, userID)
	if err != nil {
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{
		"canReply":    res.CanReply,
		"reason":      res.Reason,
		"restriction": res.Restriction,
	})
}

// sitemapThoughts — catalogue SEO slim paginé (GET /v1/seo/sitemap-thoughts).
// Public, sans auth : {items: [{id, authorUsername, updatedAt}], total,
// limit, offset}. Consommé par l'index de sitemaps (shards de 1000).
func (h *Handler) sitemapThoughts(w http.ResponseWriter, r *http.Request) {
	limit := middleware.ClampLimit(r.URL.Query().Get("limit"), maxSitemapLimit, maxSitemapLimit)
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

	result, err := h.svc.SitemapThoughts(r.Context(), limit, offset)
	if err != nil {
		log.Printf("[posts] sitemapThoughts: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, result)
}
