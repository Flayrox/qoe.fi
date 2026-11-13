package highlights

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/antispam"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/response"
	"github.com/qoefi/api/internal/secguard"
	"github.com/qoefi/api/internal/trust"
)

const (
	maxHighlightTextRunes    = 2000
	maxHighlightNoteRunes    = 2000
	maxHighlightCommentRunes = 2000
	maxQuoteOrdinal          = 1000
)

type Handler struct {
	svc *Service
	sec *secguard.Guard
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// WithSecGuard attache le garde anti-spam et rate-limit temps réel (nil-safe).
func (h *Handler) WithSecGuard(g *secguard.Guard) *Handler {
	h.sec = g
	return h
}

func (h *Handler) enforceRateLimit(w http.ResponseWriter, r *http.Request, scope, userID string, quotas secguard.TierQuotas) bool {
	prof := h.sec.EvaluateRequest(r.Context(), r, userID)
	return h.sec.EnforceRateLimit(r.Context(), w, r, scope, userID, prof.Tier, quotas)
}

func (h *Handler) enforceContentWrite(w http.ResponseWriter, r *http.Request, scope, userID, text string, quotas secguard.TierQuotas, validate func(trust.Tier) error) bool {
	prof := h.sec.EvaluateRequest(r.Context(), r, userID)
	if !h.sec.EnforceRateLimit(r.Context(), w, r, scope, userID, prof.Tier, quotas) {
		return false
	}
	if h.sec != nil {
		return h.sec.EnforceContentWrite(r.Context(), w, userID, scope, text, prof, validate)
	}
	if err := validate(prof.Tier); err != nil {
		if !secguard.WriteRejection(w, err) {
			response.BadRequest(w, err.Error())
		}
		return false
	}
	return true
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
	r.Patch("/v1/highlights/{id}", h.update)
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
	// Occurrence du passage cité (0-based) si le texte se répète.
	QuoteOrdinal *int `json:"quoteOrdinal,omitempty"`
}

// POST /v1/articles/{id}/highlights — crée un surlignage.
func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok || userID == "" {
		response.Unauthorized(w, "Non authentifié")
		return
	}

	articleID := chi.URLParam(r, "id")

	var in createInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}

	// quoteOrdinal : quelle occurrence du passage (0..1000).
	ordinal := 0
	if in.QuoteOrdinal != nil {
		if *in.QuoteOrdinal < 0 || *in.QuoteOrdinal > maxQuoteOrdinal {
			response.BadRequest(w, "quoteOrdinal doit être compris entre 0 et 1000")
			return
		}
		ordinal = *in.QuoteOrdinal
	}

	var cleanText string
	var cleanNote *string
	combined := in.Text
	if in.Note != nil {
		combined += "\n" + *in.Note
	}
	if !h.enforceContentWrite(w, r, "highlights", userID, combined, secguard.QuotasComments, func(tier trust.Tier) error {
		var err error
		cleanText, err = antispam.SanitizeAndValidateText(in.Text, 1, maxHighlightTextRunes, antispam.TextOptions{
			AllowNewlines: true,
			CheckXSS:      true,
		})
		if err != nil {
			return err
		}
		if in.Note != nil {
			n, err := antispam.SanitizeAndValidateText(*in.Note, 0, maxHighlightNoteRunes, antispam.TextOptions{
				AllowNewlines: true,
				CheckXSS:      true,
			})
			if err != nil {
				return err
			}
			cleanNote = &n
		}
		return nil
	}) {
		return
	}

	item, err := h.svc.Create(r.Context(), articleID, userID, cleanText, cleanNote, in.IsPublic, ordinal)
	if err != nil {
		if errors.Is(err, errHighlightNotFound) {
			response.NotFound(w, "Article introuvable")
			return
		}
		if errors.Is(err, errQuoteNotFound) {
			response.BadRequest(w, "Passage introuvable dans l'article")
			return
		}
		log.Printf("[highlights] create: %v", err)
		response.Internal(w)
		return
	}
	response.Created(w, item)
}

type updateInput struct {
	Note     *string `json:"note"`
	IsPublic *bool   `json:"isPublic"`
}

// PATCH /v1/highlights/{id} — met à jour la note et/ou la visibilité d'un de ses surlignages.
func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")

	var in updateInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}

	var cleanNote *string
	if in.Note != nil {
		if !h.enforceContentWrite(w, r, "highlights", userID, *in.Note, secguard.QuotasComments, func(tier trust.Tier) error {
			n, err := antispam.SanitizeAndValidateText(*in.Note, 0, maxHighlightNoteRunes, antispam.TextOptions{
				AllowNewlines: true,
				CheckXSS:      true,
			})
			if err != nil {
				return err
			}
			cleanNote = &n
			return nil
		}) {
			return
		}
	} else if !h.enforceRateLimit(w, r, "highlights", userID, secguard.QuotasComments) {
		return
	}

	item, err := h.svc.Update(r.Context(), id, userID, cleanNote, in.IsPublic)
	if err != nil {
		log.Printf("[highlights] update: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, item)
}

// DELETE /v1/highlights/{id} — supprime un de ses surlignages.
func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok || userID == "" {
		response.Unauthorized(w, "Non authentifié")
		return
	}
	id := chi.URLParam(r, "id")

	deleted, err := h.svc.Delete(r.Context(), id, userID)
	if err != nil {
		log.Printf("[highlights] delete: %v", err)
		response.Internal(w)
		return
	}
	// Reflète la réalité : false = inexistant ou non propriétaire.
	response.OK(w, map[string]bool{"success": deleted})
}

// POST /v1/highlights/{id}/upvote — toggle upvote.
func (h *Handler) toggleUpvote(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok || userID == "" {
		response.Unauthorized(w, "Non authentifié")
		return
	}

	if !h.enforceRateLimit(w, r, "highlight-upvote", userID, secguard.QuotasEngagement) {
		return
	}

	id := chi.URLParam(r, "id")

	upvoted, count, err := h.svc.ToggleUpvote(r.Context(), id, userID)
	if err != nil {
		if errors.Is(err, errHighlightNotFound) {
			response.NotFound(w, "Surlignage introuvable")
			return
		}
		log.Printf("[highlights] upvote: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{"upvoted": upvoted, "upvotesCount": count})
}

// GET /v1/highlights/{id}/comments — commentaires d'un surlignage.
func (h *Handler) listComments(w http.ResponseWriter, r *http.Request) {
	viewerID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")
	items, err := h.svc.ListComments(r.Context(), id, viewerID)
	if err != nil {
		if errors.Is(err, errHighlightNotFound) {
			response.NotFound(w, "Surlignage introuvable")
			return
		}
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
	userID, ok := middleware.UserID(r.Context())
	if !ok || userID == "" {
		response.Unauthorized(w, "Non authentifié")
		return
	}

	id := chi.URLParam(r, "id")

	var in createCommentInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}

	var cleanContent string
	if !h.enforceContentWrite(w, r, "highlight-comments", userID, in.Content, secguard.QuotasComments, func(tier trust.Tier) error {
		var err error
		cleanContent, err = antispam.SanitizeAndValidateText(in.Content, 1, maxHighlightCommentRunes, antispam.TextOptions{
			AllowNewlines: true,
			CheckXSS:      true,
		})
		return err
	}) {
		return
	}

	comment, err := h.svc.CreateComment(r.Context(), id, userID, cleanContent)
	if err != nil {
		if errors.Is(err, errHighlightNotFound) {
			response.NotFound(w, "Surlignage introuvable")
			return
		}
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

	deleted, err := h.svc.DeleteComment(r.Context(), commentID, userID)
	if err != nil {
		log.Printf("[highlights] deleteComment: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]bool{"success": deleted})
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
	// Compteur EXACT en SQL (fini le hack len(MyHighlights(1000)) faux
	// au-delà de 1000) + plafond + statut Plus : un seul appel pour
	// l'UI (compteur « X/50 » et upsell). `limit: -1` = illimité.
	used, limit, plus, err := h.svc.HighlightQuota(r.Context(), userID)
	if err != nil {
		log.Printf("[highlights] quota: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{"count": used, "limit": limit, "plus": plus})
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
