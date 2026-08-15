package articles

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

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
}

// RegisterProtected enregistre les routes créateur (auth requise + scopes clé API).
// requireScope est injecté depuis main.go (middleware.RequireAPIScope) pour
// appliquer le moindre privilège : lecture = READ, écriture = WRITE.
func (h *Handler) RegisterProtected(r chi.Router, requireScope func(string) func(http.Handler) http.Handler) {
	r.Route("/v1/articles", func(r chi.Router) {
		r.With(requireScope(middleware.ScopeRead)).Get("/", h.list)
		r.With(requireScope(middleware.ScopeWrite)).Post("/", h.create)
		r.With(requireScope(middleware.ScopeWrite)).Patch("/{id}", h.update)
		r.With(requireScope(middleware.ScopeWrite)).Post("/{id}/publish", h.publish)
		r.With(requireScope(middleware.ScopeWrite)).Delete("/{id}", h.delete)
	})
}

// GET /v1/articles/{slug} — double mode :
//   - clé API (Bearer qoe_live_…) → contrat créateurs : { data: CreatorItem }
//     (contentHtml tronqué), publication résolue depuis la clé, publié uniquement ;
//   - sinon → lecture publique ?publicationId=&viewerEmail= (paywall lecteur).
func (h *Handler) getBySlug(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")

	// Mode créateur : clé API valide → item du contrat créateurs (comme Hono).
	if ctx, ok := middleware.APIKeyContext(h.svc.q, r); ok {
		if scopes, has := middleware.Scopes(ctx); has && !middleware.HasScope(scopes, middleware.ScopeRead) {
			response.Forbidden(w, "Scope READ requis")
			return
		}
		if pid, has := middleware.PublicationID(ctx); has && pid != "" {
			item, err := h.svc.GetCreatorBySlug(ctx, slug, pid)
			if err != nil {
				if errors.Is(err, errNotFound) {
					response.NotFound(w, "Article introuvable")
					return
				}
				log.Printf("[articles] getBySlug (créateur): %v", err)
				response.Internal(w)
				return
			}
			response.OK(w, map[string]any{"data": item})
			return
		}
	}

	// Mode public (lecteurs) : publicationId requis, paywall selon le lecteur.
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
	ContentFormat  string  `json:"contentFormat"`
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
	if !IsValidContentFormat(in.ContentFormat) {
		response.BadRequest(w, "contentFormat invalide (markdown|html)")
		return
	}

	id, err := h.svc.Create(r.Context(), userID, CreateArticleInput{
		PublicationID: in.PublicationID, Title: in.Title, Slug: in.Slug, Content: in.Content,
		ContentFormat: in.ContentFormat,
		IsPremium:     in.IsPremium, Visibility: in.Visibility, CategoryID: in.CategoryID,
		TierID: in.TierID, SeoTitle: in.SeoTitle, SeoDescription: in.SeoDescription,
		ReadingTime: in.ReadingTime, Published: in.Published,
	})
	if err != nil {
		if errors.Is(err, errInvalidContentFormat) {
			response.BadRequest(w, err.Error())
			return
		}
		response.Forbidden(w, err.Error())
		return
	}
	response.Created(w, map[string]string{"id": id})
}

type updateInput struct {
	Title          string  `json:"title"`
	Content        string  `json:"content"`
	ContentFormat  string  `json:"contentFormat"`
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
	if !IsValidContentFormat(in.ContentFormat) {
		response.BadRequest(w, "contentFormat invalide (markdown|html)")
		return
	}
	if err := h.svc.Update(r.Context(), id, userID, UpdateArticleInput{
		Title: in.Title, Content: in.Content, ContentFormat: in.ContentFormat,
		Slug: in.Slug, IsPremium: in.IsPremium,
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

// GET /v1/articles?page=&limit=&category=&published= — contrat créateurs (Hono) :
// enveloppe `{data, pagination}`, articles publiés par défaut, contenu tronqué.
func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())

	// Publication résolue depuis la clé API (contexte) ou le query param
	// `publicationId` (JWT / backward-compat).
	publicationID := ""
	if pid, ok := middleware.PublicationID(r.Context()); ok {
		publicationID = pid
	}
	if publicationID == "" {
		publicationID = r.URL.Query().Get("publicationId")
	}
	if publicationID == "" {
		response.BadRequest(w, "publicationId requis")
		return
	}

	page, limit := ParsePageLimit(r.URL.Query().Get("page"), r.URL.Query().Get("limit"))
	category := r.URL.Query().Get("category")
	published := true
	if v := r.URL.Query().Get("published"); v != "" {
		published = v == "true"
	}

	resp, err := h.svc.ListCreatorArticles(r.Context(), userID, publicationID, page, limit, category, published)
	if err != nil {
		if errors.Is(err, errForbidden) {
			response.Forbidden(w, err.Error())
			return
		}
		log.Printf("[articles] list: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, resp)
}
