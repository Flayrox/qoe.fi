package articles

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
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

// SetSecurityGuard attache le garde de sécurité temps réel (nil-safe).
func (h *Handler) SetSecurityGuard(g *secguard.Guard) *Handler {
	h.sec = g
	return h
}

// enforceContentWrite délègue au Guard si présent, ou applique la validation
// standard en écrivant la réponse d'erreur HTTP si le Guard est nil.
func (h *Handler) enforceContentWrite(w http.ResponseWriter, r *http.Request, userID, scope, text string, prof trust.Profile, validate func(trust.Tier) error) bool {
	if h.sec != nil {
		return h.sec.EnforceContentWrite(r.Context(), w, userID, scope, text, prof, validate)
	}
	if validate != nil {
		if err := validate(trust.TierStandard); err != nil {
			if !secguard.WriteRejection(w, err) {
				response.BadRequest(w, err.Error())
			}
			return false
		}
	}
	return true
}

// RegisterPublic enregistre la lecture publique (auth optionnelle) — hors auth.
func (h *Handler) RegisterPublic(r chi.Router) {
	r.Get("/v1/articles/{slug}", h.getBySlug)
	r.Get("/v1/articles/{id}/comments", h.listComments)
	r.Get("/v1/articles/{id}/similar", h.similar)
	// Document canonique (blocs + texte plat + offsets) — base des ancres.
	r.Get("/v1/articles/{id}/document", h.document)
}

// GET /v1/articles/{id}/document — document canonique public de l'article.
// Les surlignages (GET /v1/articles/{id}/highlights) portent des offsets
// (canonicalStart/canonicalEnd) dans le texte canonique servi ici.
func (h *Handler) document(w http.ResponseWriter, r *http.Request) {
	articleID := chi.URLParam(r, "id")
	doc, err := h.svc.CanonicalDocument(r.Context(), articleID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.NotFound(w, "Article introuvable")
			return
		}
		log.Printf("[articles] document: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, doc)
}

// RegisterProtected enregistre les routes créateur (auth requise + scopes clé API).
// requireScope est injecté depuis main.go (middleware.RequireAPIScope) pour
// appliquer le moindre privilège : lecture = READ, écriture = WRITE.
//
// IMPORTANT : les routes sont enregistrées en siblings directs (pas via
// r.Route("/v1/articles", …)). En chi, un sous-arbre monté a une priorité
// inférieure à une route paramétrée enregistrée au niveau parent — le param
// public GET /v1/articles/{slug} masquerait /by-id/{id} et /capabilities.
// (Vérifié par TestRoutePriority_* : statique > param dans l'arbre.)
func (h *Handler) RegisterProtected(r chi.Router, requireScope func(string) func(http.Handler) http.Handler) {
	r.With(requireScope(middleware.ScopeRead)).Get("/v1/articles", h.list)
	r.With(requireScope(middleware.ScopeRead)).Get("/v1/articles/", h.list)
	r.With(requireScope(middleware.ScopeWrite)).Post("/v1/articles", h.create)
	r.With(requireScope(middleware.ScopeWrite)).Post("/v1/articles/", h.create)
	r.With(requireScope(middleware.ScopeRead)).Get("/v1/articles/by-id/{id}", h.getByID)
	r.With(requireScope(middleware.ScopeRead)).Get("/v1/articles/capabilities", h.capabilities)
	r.With(requireScope(middleware.ScopeWrite)).Patch("/v1/articles/bulk", h.bulkUpdate)
	r.With(requireScope(middleware.ScopeWrite)).Patch("/v1/articles/{id}", h.update)
	// Droit de téléchargement (hors-ligne/file d'écoute) : l'auteur choisit.
	r.With(requireScope(middleware.ScopeWrite)).Patch("/v1/articles/{id}/download", h.setAllowDownload)
	// Hors-ligne (fiche Plus P1) : pack à mettre en cache + file d'écoute.
	// Auth requise dans tous les cas (pas de hors-ligne anonyme).
	r.With(requireScope(middleware.ScopeRead)).Get("/v1/articles/{id}/offline-pack", h.offlinePack)
	r.With(requireScope(middleware.ScopeRead)).Get("/v1/me/listen-later", h.listListenLater)
	r.With(requireScope(middleware.ScopeWrite)).Post("/v1/me/listen-later", h.addListenLater)
	r.With(requireScope(middleware.ScopeWrite)).Delete("/v1/me/listen-later/{articleId}", h.removeListenLater)
	r.With(requireScope(middleware.ScopeWrite)).Post("/v1/articles/{id}/publish", h.publish)
	r.With(requireScope(middleware.ScopeWrite)).Post("/v1/articles/{id}/unpublish", h.unpublish)
	r.With(requireScope(middleware.ScopeWrite)).Post("/v1/articles/{id}/schedule", h.schedule)
	r.With(requireScope(middleware.ScopeWrite)).Post("/v1/articles/{id}/review", h.review)
	r.With(requireScope(middleware.ScopeWrite)).Post("/v1/articles/{id}/transfer", h.transfer)
	r.With(requireScope(middleware.ScopeWrite)).Post("/v1/articles/{id}/fork-personal", h.forkPersonal)
	r.With(requireScope(middleware.ScopeWrite)).Post("/v1/articles/{id}/submit-revision", h.submitRevision)
	r.With(requireScope(middleware.ScopeRead)).Get("/v1/articles/{id}/snapshots", h.listSnapshots)
	r.With(requireScope(middleware.ScopeWrite)).Post("/v1/articles/{id}/snapshots/{snapshotId}/restore", h.restoreSnapshot)
	r.With(requireScope(middleware.ScopeWrite)).Post("/v1/articles/{id}/send-email", h.sendEmail)
	r.With(requireScope(middleware.ScopeWrite)).Post("/v1/articles/{id}/test-email", h.testEmail)
	r.With(requireScope(middleware.ScopeWrite)).Post("/v1/articles/{id}/discard-draft", h.discardDraft)
	r.With(requireScope(middleware.ScopeRead)).Get("/v1/articles/{id}/review-feedback", h.getReviewFeedback)
	// Chronologie de publication (publication, dépublication, programmation…).
	r.With(requireScope(middleware.ScopeRead)).Get("/v1/articles/{id}/events", h.events)
	r.With(requireScope(middleware.ScopeWrite)).Delete("/v1/articles/{id}", h.delete)
	r.With(requireScope(middleware.ScopeWrite)).Post("/v1/articles/{id}/comments", h.createComment)
	r.With(requireScope(middleware.ScopeWrite)).Delete("/v1/articles/comments/{commentId}", h.deleteComment)
}

// GET /v1/articles/{slug} — double mode :
//   - clé API (Bearer qoe_live_…) → contrat créateurs : { data: CreatorItem }
//     (contentHtml tronqué), publication résolue depuis la clé, publié uniquement ;
//   - sinon → lecture publique ?publisherId=&viewerEmail= (paywall lecteur).
func (h *Handler) getBySlug(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")

	// Mode créateur : clé API valide → item du contrat créateurs (comme Hono).
	if ctx, ok := middleware.APIKeyContext(h.svc.q, r); ok {
		if scopes, has := middleware.Scopes(ctx); has && !middleware.HasScope(scopes, middleware.ScopeRead) {
			response.Forbidden(w, "Scope READ requis")
			return
		}
		if pid, has := middleware.PublisherID(ctx); has && pid != "" {
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
			w.Header().Set("Cache-Control", "public, max-age=60, s-maxage=120, stale-while-revalidate=600")
			response.OK(w, map[string]any{"data": item})
			return
		}
	}

	publisherID := r.URL.Query().Get("publisherId")
	viewerID, _ := middleware.UserID(r.Context())

	// Mode slug seul (page autonome /article/[slug] du reader core) : premier
	// article publié par slug, contenu complet — parité findFirstBySlug Prisma.
	if publisherID == "" {
		article, err := h.svc.GetBySlugAny(r.Context(), slug, viewerID)
		if err != nil {
			if errors.Is(err, errNotFound) {
				response.NotFound(w, "Article introuvable")
				return
			}
			log.Printf("[articles] getBySlugAny: %v", err)
			response.Internal(w)
			return
		}
		response.OK(w, article)
		return
	}

	viewerEmail := r.URL.Query().Get("viewerEmail")

	article, err := h.svc.GetBySlug(r.Context(), slug, publisherID, viewerID, viewerEmail)
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

type ArticleAttributionInput struct {
	UserID    string `json:"userId"`
	Role      string `json:"role"`
	Order     int32  `json:"order"`
	IsVisible bool   `json:"isVisible"`
}

type createInput struct {
	PublisherID          string                    `json:"publisherId"`
	Title                  string                    `json:"title"`
	Slug                   string                    `json:"slug"`
	Content                string                    `json:"content"`
	ContentFormat          string                    `json:"contentFormat"`
	ImageURL               *string                   `json:"imageUrl"`
	IsPremium              bool                      `json:"isPremium"`
	Visibility             string                    `json:"visibility"`
	CategoryID             *string                   `json:"categoryId"`
	TierID                 *string                   `json:"tierId"`
	SeoTitle               *string                   `json:"seoTitle"`
	SeoDescription         *string                   `json:"seoDescription"`
	ReadingTime            int                       `json:"readingTime"`
	AllowPublicAnnotations *bool                     `json:"allowPublicAnnotations"`
	AllowComments          *bool                     `json:"allowComments"`
	AllowDownload          *bool                     `json:"allowDownload"`
	ShowOnPersonalProfile  *bool                     `json:"showOnPersonalProfile"`
	Published              bool                      `json:"published"`
	Status                 string                    `json:"status"`
	ScheduledAt            string                    `json:"scheduledAt"`
	Attributions           []ArticleAttributionInput `json:"attributions"`
	SendEmail              *bool                     `json:"sendEmail"`
	EmailSubject           *string                   `json:"emailSubject"`
	EmailPreviewText       *string                   `json:"emailPreviewText"`
}

func validateArticlePayload(title, content string, imageURL *string) func(trust.Tier) error {
	return func(tier trust.Tier) error {
		if err := antispam.ValidateArticle(title, content, tier); err != nil {
			return err
		}
		if imageURL != nil {
			if err := antispam.ValidateSafeURL(*imageURL); err != nil {
				return err
			}
		}
		return nil
	}
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	var in createInput
	if !response.DecodeJSON(w, r, &in) {
		return
	}
	if in.PublisherID == "" || in.Title == "" {
		response.BadRequest(w, "publisherId et title requis")
		return
	}
	if !IsValidContentFormat(in.ContentFormat) {
		response.BadRequest(w, "contentFormat invalide (markdown|html)")
		return
	}

	prof := h.sec.EvaluateRequest(r.Context(), r, userID)
	if !h.sec.EnforceRateLimit(r.Context(), w, r, "articles-create", userID, prof.Tier, secguard.QuotasArticlesCreate) {
		return
	}
	// Empreinte vide : pas de SimHash sur les articles longs à la création,
	// tout en conservant le gel éventuel, l'hygiène XSS/tailles et l'URL sûre.
	if !h.enforceContentWrite(w, r, userID, "articles-create", "", prof, validateArticlePayload(in.Title, in.Content, in.ImageURL)) {
		return
	}

	scheduledAt, err := parseScheduledAt(in.ScheduledAt)
	if err != nil {
		response.BadRequest(w, err.Error())
		return
	}
	if h.svc == nil {
		response.Internal(w)
		return
	}
	id, err := h.svc.Create(r.Context(), userID, CreateArticleInput{
		PublisherID: in.PublisherID, Title: in.Title, Slug: in.Slug, Content: in.Content,
		ContentFormat: in.ContentFormat,
		IsPremium:     in.IsPremium, Visibility: in.Visibility, CategoryID: in.CategoryID,
		TierID: in.TierID, SeoTitle: in.SeoTitle, SeoDescription: in.SeoDescription,
		ImageURL:               in.ImageURL,
		AllowPublicAnnotations: in.AllowPublicAnnotations, AllowComments: in.AllowComments,
		AllowDownload:         in.AllowDownload,
		ShowOnPersonalProfile: in.ShowOnPersonalProfile,
		ReadingTime:           in.ReadingTime, Published: in.Published, Status: in.Status,
		ScheduledAt:      scheduledAt,
		Attributions:     in.Attributions,
		SendEmail:        in.SendEmail,
		EmailSubject:     in.EmailSubject,
		EmailPreviewText: in.EmailPreviewText,
	})
	if err != nil {
		response.Forbidden(w, err.Error())
		return
	}
	if in.Published || strings.EqualFold(in.Status, "PUBLISHED") {
		h.sec.InvalidateTrust(r.Context(), userID)
	}
	article, err := h.svc.GetByID(r.Context(), id, userID)
	if err != nil {
		response.Created(w, map[string]string{"id": id})
		return
	}
	response.Created(w, article)
}

// GET /v1/articles?page=&limit=&category=&published= — contrat créateurs (Hono) :
// enveloppe `{data, pagination}`, articles publiés par défaut, contenu tronqué.
func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())

	// Publication résolue depuis la clé API (contexte) ou le query param
	// `publisherId` (JWT / backward-compat). La présence d'une publication
	// en contexte est le marqueur du mode clé API (CombinedAuth l'injecte).
	publisherID := ""
	apiKeyMode := false
	if pid, ok := middleware.PublisherID(r.Context()); ok {
		publisherID = pid
		apiKeyMode = true
	}
	if publisherID == "" {
		publisherID = r.URL.Query().Get("publisherId")
	}
	if publisherID == "" {
		response.BadRequest(w, "publisherId requis")
		return
	}

	// Mode clé API : contrat créateurs paginé `{data, pagination}` (consommateurs
	// médias/créateurs publics, contenu tronqué, publié uniquement par défaut).
	if apiKeyMode {
		page, limit := ParsePageLimit(r.URL.Query().Get("page"), r.URL.Query().Get("limit"))
		category := r.URL.Query().Get("category")
		published := true
		if v := r.URL.Query().Get("published"); v != "" {
			published = v == "true"
		}

		resp, err := h.svc.ListCreatorArticles(r.Context(), userID, publisherID, page, limit, category, published)
		if err != nil {
			response.Forbidden(w, err.Error())
			return
		}
		w.Header().Set("Cache-Control", "public, max-age=60, s-maxage=120, stale-while-revalidate=600")
		response.OK(w, resp)
		return
	}

	// Mode dashboard (session JWT) : liste complète des articles — brouillons
	// inclus, plus récents d'abord — en tableau brut. Parité avec le type
	// Prisma attendu par les server actions du studio (@qoe/api-client).
	period := r.URL.Query().Get("period")
	if period == "" {
		period = "30d"
	}
	workspaceType := r.URL.Query().Get("workspaceType")
	articles, err := h.svc.List(r.Context(), userID, publisherID, workspaceType, 100, 0, period)
	if err != nil {
		response.Forbidden(w, err.Error())
		return
	}
	response.OK(w, articles)
}

type bulkUpdateInput struct {
	IDs                    []string `json:"ids"`
	IsPremium              *bool    `json:"isPremium"`
	SetCategory            bool     `json:"setCategory"`
	CategoryID             *string  `json:"categoryId"`
	AllowPublicAnnotations *bool    `json:"allowPublicAnnotations"`
	AllowComments          *bool    `json:"allowComments"`
	AllowDownload          *bool    `json:"allowDownload"`
	ShowOnPersonalProfile  *bool    `json:"showOnPersonalProfile"`
	Published              *bool    `json:"published"`
}

// PATCH /v1/articles/bulk — réglages et publication en masse, sans contenu.
// Route statique déclarée avant /{id} : en chi, statique > param.
func (h *Handler) bulkUpdate(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	var in bulkUpdateInput
	if !response.DecodeJSON(w, r, &in) {
		return
	}
	prof := h.sec.EvaluateRequest(r.Context(), r, userID)
	if !h.sec.EnforceRateLimit(r.Context(), w, r, "articles-edit", userID, prof.Tier, secguard.QuotasArticlesEdit) {
		return
	}
	if h.svc == nil {
		response.Internal(w)
		return
	}
	result, err := h.svc.BulkUpdate(r.Context(), userID, BulkUpdateInput{
		IDs: in.IDs, IsPremium: in.IsPremium, SetCategory: in.SetCategory,
		CategoryID: in.CategoryID, AllowPublicAnnotations: in.AllowPublicAnnotations,
		AllowComments: in.AllowComments, AllowDownload: in.AllowDownload,
		ShowOnPersonalProfile: in.ShowOnPersonalProfile,
		Published:             in.Published,
	})
	if err != nil {
		response.BadRequest(w, err.Error())
		return
	}
	response.OK(w, result)
}

type updateInput struct {
	Title                  string                    `json:"title"`
	Content                string                    `json:"content"`
	ContentFormat          string                    `json:"contentFormat"`
	Slug                   string                    `json:"slug"`
	ImageURL               *string                   `json:"imageUrl"`
	IsPremium              bool                      `json:"isPremium"`
	CategoryID             *string                   `json:"categoryId"`
	SeoTitle               *string                   `json:"seoTitle"`
	SeoDescription         *string                   `json:"seoDescription"`
	ReadingTime            int                       `json:"readingTime"`
	AllowPublicAnnotations *bool                     `json:"allowPublicAnnotations"`
	AllowComments          *bool                     `json:"allowComments"`
	AllowDownload          *bool                     `json:"allowDownload"`
	ShowOnPersonalProfile  *bool                     `json:"showOnPersonalProfile"`
	Published              bool                      `json:"published"`
	Status                 string                    `json:"status"`
	ActivePublisherID    string                    `json:"activePublisherId"`
	ScheduledAt            string                    `json:"scheduledAt"`
	Attributions           []ArticleAttributionInput `json:"attributions"`
	SendEmail              *bool                     `json:"sendEmail"`
	EmailSubject           *string                   `json:"emailSubject"`
	EmailPreviewText       *string                   `json:"emailPreviewText"`
}

func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")
	var in updateInput
	if !response.DecodeJSON(w, r, &in) {
		return
	}
	if !IsValidContentFormat(in.ContentFormat) {
		response.BadRequest(w, "contentFormat invalide (markdown|html)")
		return
	}
	prof := h.sec.EvaluateRequest(r.Context(), r, userID)
	if !h.sec.EnforceRateLimit(r.Context(), w, r, "articles-edit", userID, prof.Tier, secguard.QuotasArticlesEdit) {
		return
	}
	// Aucun SimHash sur update pour ne jamais bloquer les auto-sauvegardes
	// ni les Ctrl+S répétés sur un même article.
	if !h.enforceContentWrite(w, r, userID, "articles-edit", "", prof, validateArticlePayload(in.Title, in.Content, in.ImageURL)) {
		return
	}
	scheduledAt, err := parseScheduledAt(in.ScheduledAt)
	if err != nil {
		response.BadRequest(w, err.Error())
		return
	}
	if h.svc == nil {
		response.Internal(w)
		return
	}
	if err := h.svc.Update(r.Context(), id, userID, UpdateArticleInput{
		Title: in.Title, Content: in.Content, ContentFormat: in.ContentFormat, Slug: in.Slug, IsPremium: in.IsPremium,
		ImageURL: in.ImageURL, CategoryID: in.CategoryID, SeoTitle: in.SeoTitle, SeoDescription: in.SeoDescription,
		AllowPublicAnnotations: in.AllowPublicAnnotations, AllowComments: in.AllowComments,
		AllowDownload:         in.AllowDownload,
		ShowOnPersonalProfile: in.ShowOnPersonalProfile,
		ReadingTime:           in.ReadingTime, Published: in.Published, Status: in.Status,
		ActivePublisherID: in.ActivePublisherID, ScheduledAt: scheduledAt,
		Attributions: in.Attributions,
		SendEmail:    in.SendEmail, EmailSubject: in.EmailSubject, EmailPreviewText: in.EmailPreviewText,
	}); err != nil {
		response.BadRequest(w, err.Error())
		return
	}
	if in.Published || strings.EqualFold(in.Status, "PUBLISHED") {
		h.sec.InvalidateTrust(r.Context(), userID)
	}
	article, err := h.svc.GetByID(r.Context(), id, userID)
	if err != nil {
		response.OK(w, map[string]bool{"updated": true})
		return
	}
	response.OK(w, article)
}

// GET /v1/articles/{id}/events — historique de publication, le plus récent
// d'abord. Même visibilité que l'édition : auteur, média autorisé, co-auteur.
func (h *Handler) events(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")
	limit := int32(middleware.ClampLimit(r.URL.Query().Get("limit"), 100, 200))

	eventsList, err := h.svc.ListEvents(r.Context(), id, userID, limit)
	if err != nil {
		if errors.Is(err, errNotFound) {
			response.NotFound(w, "Article introuvable")
			return
		}
		if errors.Is(err, errForbidden) {
			response.Forbidden(w, "Accès refusé à cet article.")
			return
		}
		log.Printf("[articles] events: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, eventsList)
}

func (h *Handler) publish(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")
	if err := h.svc.SetStatus(r.Context(), id, userID, "PUBLISHED", true, nil); err != nil {
		response.BadRequest(w, err.Error())
		return
	}
	h.sec.InvalidateTrust(r.Context(), userID)
	response.OK(w, map[string]bool{"published": true})
}

type sendEmailInput struct {
	Subject       string `json:"subject"`
	PreviewText   string `json:"previewText"`
	IsMajorUpdate bool   `json:"isMajorUpdate"`
}

// POST /v1/articles/{id}/send-email — déclenche l'envoi newsletter aux abonnés.
func (h *Handler) sendEmail(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	articleID := chi.URLParam(r, "id")
	var in sendEmailInput
	_ = json.NewDecoder(r.Body).Decode(&in)

	if err := h.svc.SendArticleEmail(r.Context(), articleID, userID, in.Subject, in.PreviewText, in.IsMajorUpdate); err != nil {
		if errors.Is(err, errNotFound) {
			response.NotFound(w, "Article introuvable")
			return
		}
		if errors.Is(err, errForbidden) {
			response.Forbidden(w, "Permission insuffisante")
			return
		}
		if errors.Is(err, ErrCooldownActive) {
			response.ErrorCode(w, http.StatusTooManyRequests, "cooldown_active", err.Error())
			return
		}
		if errors.Is(err, ErrArticleAlreadySent) {
			response.ErrorCode(w, http.StatusConflict, "already_sent", err.Error())
			return
		}
		response.BadRequest(w, err.Error())
		return
	}
	response.OK(w, map[string]any{"ok": true})
}

// POST /v1/articles/{id}/test-email — envoie un email de test à l'adresse de l'utilisateur connecté.
func (h *Handler) testEmail(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	articleID := chi.URLParam(r, "id")

	if err := h.svc.SendArticleTestEmail(r.Context(), articleID, userID); err != nil {
		if errors.Is(err, errNotFound) {
			response.NotFound(w, "Article introuvable")
			return
		}
		if errors.Is(err, errForbidden) {
			response.Forbidden(w, "Permission insuffisante")
			return
		}
		log.Printf("[articles] testEmail error: %v", err)
		response.BadRequest(w, err.Error())
		return
	}
	response.OK(w, map[string]any{"ok": true, "message": "Email test envoyé"})
}

// POST /v1/articles/{id}/unpublish — repasse un article en brouillon privé
// (published=false, status=DRAFT) et efface la programmation. Même garde
// d'édition que Update (auteur, média autorisé ou co-auteur).
func (h *Handler) unpublish(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")
	if err := h.svc.Unpublish(r.Context(), id, userID); err != nil {
		if errors.Is(err, errNotFound) {
			response.NotFound(w, "Article introuvable")
			return
		}
		if errors.Is(err, errForbidden) {
			response.Forbidden(w, "Accès refusé à cet article.")
			return
		}
		response.BadRequest(w, err.Error())
		return
	}
	response.OK(w, map[string]bool{"published": false})
}

// POST /v1/articles/{id}/schedule — programme (date future) ou annule
// (scheduledAt null) la publication d'un article. RBAC : peut publier.
func (h *Handler) schedule(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")
	var in struct {
		ScheduledAt *string `json:"scheduledAt"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	var scheduledAt *time.Time
	if in.ScheduledAt != nil && *in.ScheduledAt != "" {
		t, err := time.Parse(time.RFC3339, *in.ScheduledAt)
		if err != nil {
			response.BadRequest(w, "scheduledAt invalide (format RFC3339 attendu)")
			return
		}
		scheduledAt = &t
	}
	if err := h.svc.Schedule(r.Context(), id, userID, scheduledAt); err != nil {
		response.BadRequest(w, err.Error())
		return
	}
	response.OK(w, map[string]any{"scheduled": scheduledAt != nil, "scheduledAt": in.ScheduledAt})
}

// PATCH /v1/articles/{id}/download — droit de téléchargement (hors-ligne,
// file d'écoute). Body : { "allowDownload": bool }. Même garde que
// l'édition (auteur/média/co-auteur) : 404 si inexistant ou interdit (pas
// de fuite d'existence — un interdit ressemble à un inexistant).
func (h *Handler) setAllowDownload(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")
	var in struct {
		AllowDownload *bool `json:"allowDownload"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.AllowDownload == nil {
		response.BadRequest(w, "JSON invalide (allowDownload requis)")
		return
	}
	allow, err := h.svc.SetAllowDownload(r.Context(), id, userID, *in.AllowDownload)
	if err != nil {
		// Inexistant ou interdit : même 404 (pas de fuite d'existence) ;
		// le reste (panne) remonte en 500, jamais masqué en 404.
		if errors.Is(err, errNotFound) || errors.Is(err, errForbidden) {
			response.NotFound(w, "Article introuvable.")
			return
		}
		log.Printf("[articles] download toggle %s: %v", id, err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{"id": id, "allowDownload": allow})
}

// GET /v1/articles/{id}/offline-pack — pack à mettre en cache (Plus).
// 403 + code OFFLINE_PACK_REQUIRES_PLUS (pas Plus), OFFLINE_NOT_DOWNLOADABLE
// (droit auteur), OFFLINE_NOT_PUBLISHED. Le contenu respecte le paywall
// (coupé comme à l'écran si non abonné).
func (h *Handler) offlinePack(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")
	var email string
	if claims := middleware.Claims(r.Context()); claims != nil {
		email, _ = claims["email"].(string)
	}
	pack, err := h.svc.OfflinePack(r.Context(), id, userID, email)
	if err != nil {
		switch {
		case errors.Is(err, ErrOfflinePlusRequired):
			response.ErrorCode(w, http.StatusForbidden, "OFFLINE_PACK_REQUIRES_PLUS", err.Error())
			return
		case errors.Is(err, ErrOfflineNotDownloadable):
			response.ErrorCode(w, http.StatusForbidden, "OFFLINE_NOT_DOWNLOADABLE", err.Error())
			return
		case errors.Is(err, ErrOfflineForbidden):
			response.ErrorCode(w, http.StatusForbidden, "OFFLINE_NOT_AVAILABLE", err.Error())
			return
		}
		if errors.Is(err, errNotFound) {
			response.NotFound(w, "Article introuvable.")
			return
		}
		log.Printf("[articles] offline pack %s: %v", id, err)
		response.Internal(w)
		return
	}
	response.OK(w, pack)
}

// GET /v1/me/listen-later — file d'écoute ordonnée.
func (h *Handler) listListenLater(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	items, err := h.svc.ListListenLater(r.Context(), userID)
	if err != nil {
		log.Printf("[articles] listen-later list: %v", err)
		response.Internal(w)
		return
	}
	if items == nil {
		items = []ListenItem{}
	}
	response.OK(w, map[string]any{"items": items})
}

// POST /v1/me/listen-later { articleId } — ajout en fin de file (idempotent).
// Vérifie le droit de téléchargement (jamais de contenu interdit dans la
// file) mais PAS le palier (ajouter à sa file est gratuit).
func (h *Handler) addListenLater(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	var in struct {
		ArticleID string `json:"articleId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.ArticleID == "" {
		response.BadRequest(w, "JSON invalide (articleId requis)")
		return
	}
	id, err := h.svc.AddListenLater(r.Context(), userID, in.ArticleID)
	if err != nil {
		if errors.Is(err, ErrOfflineForbidden) {
			response.ErrorCode(w, http.StatusForbidden, "OFFLINE_NOT_DOWNLOADABLE", err.Error())
			return
		}
		if errors.Is(err, errNotFound) {
			response.NotFound(w, "Article introuvable.")
			return
		}
		log.Printf("[articles] listen-later add: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{"id": id})
}

// DELETE /v1/me/listen-later/{articleId} — retrait (idempotent).
func (h *Handler) removeListenLater(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	if err := h.svc.RemoveListenLater(r.Context(), userID, chi.URLParam(r, "articleId")); err != nil {
		log.Printf("[articles] listen-later remove: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]bool{"removed": true})
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")
	activePublisherID := r.URL.Query().Get("activePublisherId")
	if err := h.svc.Delete(r.Context(), id, userID, activePublisherID); err != nil {
		response.BadRequest(w, err.Error())
		return
	}
	response.OK(w, map[string]bool{"deleted": true})
}

// GET /v1/articles/by-id/{id} — lecture éditeur (contenu complet, RBAC).
func (h *Handler) getByID(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")
	article, err := h.svc.GetByID(r.Context(), id, userID)
	if err != nil {
		if errors.Is(err, errNotFound) {
			response.NotFound(w, "Article introuvable")
			return
		}
		if errors.Is(err, errForbidden) {
			response.Forbidden(w, "Vous n'êtes pas autorisé à accéder à cet article.")
			return
		}
		response.Internal(w)
		return
	}
	response.OK(w, article)
}

// POST /v1/articles/{id}/review — approuve/rejette une soumission (media:review).
func (h *Handler) review(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")
	var in struct {
		Approve bool   `json:"approve"`
		Comment string `json:"comment"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if err := h.svc.Review(r.Context(), id, userID, in.Approve, in.Comment); err != nil {
		if errors.Is(err, errNotFound) {
			response.NotFound(w, "Article introuvable")
			return
		}
		response.Forbidden(w, err.Error())
		return
	}
	article, err := h.svc.GetByID(r.Context(), id, userID)
	if err != nil {
		response.OK(w, map[string]bool{"success": true})
		return
	}
	response.OK(w, article)
}

// POST /v1/articles/{id}/transfer — transfère un article vers une autre publication (Personnel ↔ Média).
func (h *Handler) transfer(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")
	var in TransferArticleInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}
	if in.TargetPublisherID == "" {
		response.BadRequest(w, "targetPublisherId requis")
		return
	}
	article, err := h.svc.TransferPublisher(r.Context(), userID, id, in)
	if err != nil {
		if errors.Is(err, errNotFound) {
			response.NotFound(w, "Article ou publication cible introuvable")
			return
		}
		if errors.Is(err, errForbidden) {
			response.Forbidden(w, "Vous n'avez pas la permission de transférer cet article vers cette publication.")
			return
		}
		response.BadRequest(w, err.Error())
		return
	}
	response.OK(w, article)
}

type forkPersonalInput struct {
	SnapshotID *string `json:"snapshotId,omitempty"`
}

// POST /v1/articles/{id}/fork-personal — crée ou récupère l'exemplaire personnel souverain d'un essai média.
func (h *Handler) forkPersonal(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")
	var in forkPersonalInput
	if r.Body != nil && r.ContentLength != 0 {
		if !response.DecodeJSON(w, r, &in) {
			return
		}
	}
	prof := h.sec.EvaluateRequest(r.Context(), r, userID)
	if !h.sec.EnforceRateLimit(r.Context(), w, r, "articles-create", userID, prof.Tier, secguard.QuotasArticlesCreate) {
		return
	}
	if h.svc == nil {
		response.Internal(w)
		return
	}
	var snapID string
	if in.SnapshotID != nil {
		snapID = *in.SnapshotID
	}
	copyID, alreadyExisted, err := h.svc.ForkToPersonal(r.Context(), id, userID, snapID)
	if err != nil {
		if errors.Is(err, errNotFound) {
			response.NotFound(w, "Article introuvable")
			return
		}
		if errors.Is(err, errForbidden) {
			response.Forbidden(w, "Seul l'auteur ou un co-auteur peut dupliquer cet essai vers son espace personnel.")
			return
		}
		response.BadRequest(w, err.Error())
		return
	}
	response.OK(w, map[string]any{
		"id":             copyID,
		"alreadyExisted": alreadyExisted,
	})
}

// GET /v1/articles/{id}/snapshots — liste l'historique des versions textuelles d'un article.
func (h *Handler) listSnapshots(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")
	items, err := h.svc.ListSnapshots(r.Context(), id, userID)
	if err != nil {
		if errors.Is(err, errNotFound) {
			response.NotFound(w, "Article introuvable")
			return
		}
		if errors.Is(err, errForbidden) {
			response.Forbidden(w, "Accès refusé aux versions de cet article")
			return
		}
		response.BadRequest(w, err.Error())
		return
	}
	response.OK(w, items)
}

// POST /v1/articles/{id}/snapshots/{snapshotId}/restore — restaure une version textuelle antérieure.
func (h *Handler) restoreSnapshot(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")
	snapshotID := chi.URLParam(r, "snapshotId")
	prof := h.sec.EvaluateRequest(r.Context(), r, userID)
	if !h.sec.EnforceRateLimit(r.Context(), w, r, "articles-edit", userID, prof.Tier, secguard.QuotasArticlesEdit) {
		return
	}
	if h.svc == nil {
		response.Internal(w)
		return
	}
	if err := h.svc.RestoreSnapshot(r.Context(), id, snapshotID, userID); err != nil {
		if errors.Is(err, errNotFound) {
			response.NotFound(w, "Article ou version introuvable")
			return
		}
		if errors.Is(err, errForbidden) {
			response.Forbidden(w, "Vous n'avez pas la permission de restaurer cette version")
			return
		}
		response.BadRequest(w, err.Error())
		return
	}
	response.OK(w, map[string]bool{"success": true})
}

// POST /v1/articles/{id}/submit-revision — propose les modifications de l'essai personnel à l'article média d'origine.
func (h *Handler) submitRevision(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")
	originID, err := h.svc.SubmitRevisionToOrigin(r.Context(), id, userID)
	if err != nil {
		if errors.Is(err, errNotFound) {
			response.NotFound(w, "Article introuvable")
			return
		}
		if errors.Is(err, errForbidden) {
			response.Forbidden(w, err.Error())
			return
		}
		response.BadRequest(w, err.Error())
		return
	}
	response.OK(w, map[string]any{
		"originArticleId": originID,
		"status":          "SUBMITTED",
	})
}

// POST /v1/articles/{id}/discard-draft — abandonne le brouillon non publié.
func (h *Handler) discardDraft(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")
	if err := h.svc.DiscardDraft(r.Context(), id, userID); err != nil {
		if errors.Is(err, errNotFound) {
			response.NotFound(w, "Article introuvable")
			return
		}
		response.Forbidden(w, err.Error())
		return
	}
	article, err := h.svc.GetByID(r.Context(), id, userID)
	if err != nil {
		response.OK(w, map[string]bool{"success": true})
		return
	}
	response.OK(w, article)
}

// GET /v1/articles/{id}/review-feedback — récupère le dernier retour de révision.
func (h *Handler) getReviewFeedback(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	id := chi.URLParam(r, "id")
	fb, err := h.svc.GetLatestReviewFeedback(r.Context(), id, userID)
	if err != nil {
		if errors.Is(err, errNotFound) {
			response.NotFound(w, "Article introuvable")
			return
		}
		response.Forbidden(w, err.Error())
		return
	}
	if fb == nil {
		response.OK(w, map[string]any{"feedback": nil})
		return
	}
	response.OK(w, fb)
}

// GET /v1/articles/capabilities?publisherId= — capacités d'édition.
func (h *Handler) capabilities(w http.ResponseWriter, r *http.Request) {
	userID, _ := middleware.UserID(r.Context())
	publisherID := r.URL.Query().Get("publisherId")
	if publisherID == "" {
		response.BadRequest(w, "publisherId requis")
		return
	}
	articleID := r.URL.Query().Get("articleId")
	caps, err := h.svc.EditorCapabilities(r.Context(), userID, publisherID, articleID)
	if err != nil {
		if errors.Is(err, errForbidden) {
			response.Forbidden(w, "Accès refusé à cette publication.")
			return
		}
		response.NotFound(w, "Publisher introuvable")
		return
	}
	response.OK(w, caps)
}

// GET /v1/articles/{id}/similar — recommandations sémantiques (pgvector).
// Public, comme la lecture d'article. Vide tant que le worker d'embedding
// n'a pas indexé (liste vide ≠ erreur).
func (h *Handler) similar(w http.ResponseWriter, r *http.Request) {
	articleID := chi.URLParam(r, "id")
	limit := middleware.ClampLimit(r.URL.Query().Get("limit"), 6, 20)
	items, err := h.svc.SimilarArticles(r.Context(), articleID, limit)
	if err != nil {
		if errors.Is(err, errNotFound) {
			response.NotFound(w, "Article introuvable")
			return
		}
		log.Printf("[articles] similar: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, map[string]any{"items": items})
}

// GET /v1/articles/{id}/comments — liste publique des commentaires.
func (h *Handler) listComments(w http.ResponseWriter, r *http.Request) {
	articleID := chi.URLParam(r, "id")
	viewerID, _ := middleware.UserID(r.Context())
	comments, err := h.svc.ListComments(r.Context(), articleID, viewerID)
	if err != nil {
		log.Printf("[articles] listComments: %v", err)
		response.Internal(w)
		return
	}
	response.OK(w, comments)
}

// parseScheduledAt convertit une date RFC3339 optionnelle (vide → nil).
func parseScheduledAt(raw string) (*time.Time, error) {
	if raw == "" {
		return nil, nil
	}
	t, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		return nil, errors.New("scheduledAt invalide (format RFC3339 attendu)")
	}
	return &t, nil
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
	if !response.DecodeJSON(w, r, &in) {
		return
	}
	if in.Content == "" {
		response.BadRequest(w, "content requis")
		return
	}
	prof := h.sec.EvaluateRequest(r.Context(), r, userID)
	if !h.sec.EnforceRateLimit(r.Context(), w, r, "comments", userID, prof.Tier, secguard.QuotasComments) {
		return
	}
	if !h.enforceContentWrite(w, r, userID, "comments", in.Content, prof, func(tier trust.Tier) error {
		return antispam.ValidateComment(in.Content, tier)
	}) {
		return
	}
	if h.svc == nil {
		response.Internal(w)
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
	h.sec.ObserveCommentTarget(r.Context(), articleID)
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
