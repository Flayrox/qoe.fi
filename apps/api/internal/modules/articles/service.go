// Package articles — service d'articles (CRUD + paywall + workflow média).
package articles

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pgvector/pgvector-go"
	"github.com/qoefi/api/internal/canon"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/permissions"
	"github.com/qoefi/api/internal/queue"
	"github.com/qoefi/api/internal/slug"
	"github.com/redis/go-redis/v9"
)

var (
	errNotFound             = errors.New("article introuvable")
	errForbidden            = errors.New("permission insuffisante")
	errInvalidContentFormat = errors.New("contentFormat invalide (markdown|html)")
)

// ArticleResponse est la forme API d'un article (contenu éventuellement tronqué).
type ArticleResponse struct {
	ID             string            `json:"id"`
	Title          string            `json:"title"`
	Slug           string            `json:"slug"`
	Content               string            `json:"content"`
	DraftContent          *string           `json:"draftContent,omitempty"`
	HasUnpublishedChanges bool              `json:"hasUnpublishedChanges"`
	Published             bool              `json:"published"`
	IsPremium      bool              `json:"isPremium"`
	Visibility     string            `json:"visibility"`
	ReadingTime    int               `json:"readingTime"`
	Status         string            `json:"status"`
	ScheduledAt    *string           `json:"scheduledAt"`
	PublicationID  string            `json:"publicationId"`
	AuthorID       string            `json:"authorId"`
	CategoryID     *string           `json:"categoryId"`
	TierID         *string           `json:"tierId"`
	SeoTitle       *string           `json:"seoTitle"`
	SeoDescription *string           `json:"seoDescription"`
	ImageUrl       *string           `json:"imageUrl"`
	CreatedAt      string            `json:"createdAt"`
	UpdatedAt      string            `json:"updatedAt"`
	IsTruncated    bool              `json:"isTruncated"`
	AccessGranted  bool              `json:"accessGranted"`
	PaywallMeta    *PaywallMeta      `json:"paywallMeta"`
	Author         AuthorInfo        `json:"author"`
	Publication    *PublicationInfo  `json:"publication"`
	Category       *CategoryInfo     `json:"category"`
	CoAuthors      []AuthorInfo      `json:"coAuthors"`
	Attributions   []AttributionInfo `json:"attributions"`
	Views          int               `json:"views"`
	ViewsUnique    int               `json:"viewsUnique"`
	CommentsCount  int               `json:"commentsCount"`
}

// AttributionInfo est une attribution d'article pour l'éditeur (co-auteur).
type AttributionInfo struct {
	User          AuthorInfo `json:"user"`
	Role          string     `json:"role"`
	Order         int        `json:"order"`
	IsVisible     bool       `json:"isVisible"`
	ConsentStatus string     `json:"consentStatus"`
}

// CategoryInfo est la catégorie dénormalisée d'un article.
type CategoryInfo struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Slug string `json:"slug"`
}

// AuthorInfo est l'auteur dénormalisé.
type AuthorInfo struct {
	ID          string  `json:"id"`
	Name        *string `json:"name"`
	Username    *string `json:"username"`
	LogoURL     *string `json:"logoUrl"`
	IsCertified bool    `json:"isCertified"`
}

// PublicationInfo est la publication dénormalisée.
type PublicationInfo struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	Slug         string  `json:"slug"`
	Subdomain    *string `json:"subdomain"`
	LogoURL      *string `json:"logoUrl,omitempty"`
	CustomDomain *string `json:"customDomain"`
}

// CreateArticleInput est l'entrée de création d'un article.
type CreateArticleInput struct {
	PublicationID  string
	Title          string
	Slug           string
	Content        string
	ContentFormat  string
	IsPremium      bool
	Visibility     string
	CategoryID     *string
	TierID         *string
	SeoTitle       *string
	SeoDescription *string
	ReadingTime    int
	Published      bool
	Status         string
	// ScheduledAt programme la publication : futur + demande de publication →
	// statut SCHEDULED (publié automatiquement par le scheduled publisher).
	ScheduledAt  *time.Time
	Attributions []ArticleAttributionInput
}

// UpdateArticleInput est l'entrée de mise à jour.
type UpdateArticleInput struct {
	Title               string
	Content             string
	ContentFormat       string
	Slug                string
	IsPremium           bool
	CategoryID          *string
	SeoTitle            *string
	SeoDescription      *string
	ReadingTime         int
	Published           bool
	Status              string
	ActivePublicationID string
	// ScheduledAt programme la publication ; nil = conserver l'existant.
	ScheduledAt  *time.Time
	Attributions []ArticleAttributionInput
}

type Service struct {
	pool *pgxpool.Pool
	q    *db.Queries
	rc   *redis.Client
	ac   *asynq.Client
}

// CanonicalDocument canonicalise le contenu d'un article (document canonique
// public : blocs + texte plat + offsets). Introuvable → (nil, ErrNotFound).
func (s *Service) CanonicalDocument(ctx context.Context, articleID string) (*canon.Document, error) {
	var content string
	err := s.pool.QueryRow(ctx,
		`SELECT COALESCE("content",'') FROM "Article" WHERE id = $1`, articleID).Scan(&content)
	if err != nil {
		return nil, err
	}
	return canon.Parse(content), nil
}

func NewService(pool *pgxpool.Pool, rc *redis.Client, ac *asynq.Client) *Service {
	return &Service{pool: pool, q: db.New(pool), rc: rc, ac: ac}
}

func toUUID(id string) pgtype.UUID {
	u := pgtype.UUID{}
	_ = u.Scan(id)
	return u
}

func uuidString(u pgtype.UUID) string {
	if !u.Valid {
		return ""
	}
	return fmt.Sprintf("%x-%x-%x-%x-%x", u.Bytes[0:4], u.Bytes[4:6], u.Bytes[6:8], u.Bytes[8:10], u.Bytes[10:16])
}

// memberContext résout l'accès d'un utilisateur à une publication :
// "owner" (personnel) ou membre Média (avec permissions complètes).
type memberContext struct {
	role    string
	isMedia bool
	member  *permissions.MediaMember
}

// resolveMember retourne le contexte d'accès de l'utilisateur sur la publication.
func (s *Service) resolveMember(ctx context.Context, userID, publicationID string) (memberContext, error) {
	if p, ok := middleware.GetPrincipal(ctx); ok && p.Type == middleware.PrincipalTypePublication {
		if p.PublicationID != nil && *p.PublicationID == publicationID {
			return memberContext{
				role:    "owner",
				isMedia: true,
				member:  &permissions.MediaMember{Role: "owner", Status: "active"},
			}, nil
		}
	}
	if personal, err := s.q.GetUserPersonalPublication(ctx, userID); err == nil && personal.String == publicationID {
		return memberContext{role: "owner", isMedia: false}, nil
	}
	row, err := s.q.GetMediaMemberContext(ctx, db.GetMediaMemberContextParams{
		PublicationId: publicationID, UserId: toUUID(userID),
	})
	if err != nil {
		return memberContext{}, errForbidden
	}
	return memberContext{
		role:    row.Role,
		isMedia: true,
		member:  &permissions.MediaMember{Role: row.Role, Permissions: row.Permissions, Status: row.Status},
	}, nil
}

// can vérifie une permission média (toujours vrai pour l'owner personnel).
func (mc memberContext) can(perm string) bool {
	if !mc.isMedia {
		return true
	}
	return permissions.CanMedia(mc.member, perm)
}

// GetBySlugAny lit le premier article publié par slug seul (sans publicationId)
// et applique la troncature paywall. Aucun entitlement n'est disponible dans ce
// mode (pas de publication de référence, donc pas d'abonnement résolvable) : il
// est PUBLIC par nature (page autonome /article/[slug] du reader core, unfurl
// OpenGraph, thread de citation). Le contenu premium au-delà du marqueur n'est
// donc JAMAIS transmis au client — le rendu affiche le CTA d'abonnement quand
// `accessGranted` est faux (zéro-fuite, même contrat que tenants/mobile).
func (s *Service) GetBySlugAny(ctx context.Context, slug string) (ArticleResponse, error) {
	row, err := s.q.GetArticleBySlugAny(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ArticleResponse{}, errNotFound
		}
		return ArticleResponse{}, err
	}
	// 🔒 Troncature serveur systématique des articles verrouillés : le passage
	// réservé ne doit jamais franchir la frontière HTTP sans entitlement.
	cut := SliceContentAtPaywall(row.Content, UserEntitlements{}, string(row.Visibility), textPtr(row.TierId))

	// GetArticleBySlugAnyRow a le même shape que GetArticleBySlugRow mais c'est
	// un type distinct → conversion explicite vers le mapping existant.
	resp := ArticleResponse{
		ID: row.ID, Title: row.Title, Slug: row.Slug, Content: cut.Content,
		Published: row.Published, IsPremium: row.IsPremium, Visibility: string(row.Visibility),
		ReadingTime: int(row.ReadingTime), Status: row.Status, PublicationID: row.PublicationId,
		AuthorID: row.AuthorID, CategoryID: textPtr(row.CategoryId), TierID: textPtr(row.TierId),
		SeoTitle: textPtr(row.SeoTitle), SeoDescription: textPtr(row.SeoDescription),
		CreatedAt:   row.CreatedAt.Time.Format(time.RFC3339),
		UpdatedAt:   row.UpdatedAt.Time.Format(time.RFC3339),
		IsTruncated: cut.IsTruncated, AccessGranted: cut.AccessGranted, PaywallMeta: cut.PaywallMeta,
		Author:      AuthorInfo{ID: row.AuthorID, Name: textPtr(row.AuthorName), Username: textPtr(row.AuthorUsername), LogoURL: textPtr(row.AuthorLogo)},
		Publication: &PublicationInfo{ID: row.PublicationId, Name: row.PublicationName, Slug: row.PublicationSlug, Subdomain: textPtr(row.PublicationSubdomain), LogoURL: textPtr(row.PublicationLogo), CustomDomain: textPtr(row.PublicationCustomDomain)},
		CoAuthors:   []AuthorInfo{},
		Attributions: []AttributionInfo{},
	}
	// Enrichissement lecture publique (comme la réponse éditeur) : image de
	// couverture, catégorie, certification et attributions — sinon le drawer
	// lecteur affiche un article sans image ni signature.
	resp.ImageUrl = textPtr(row.ArticleImage)
	if row.CategoryID.Valid {
		resp.Category = &CategoryInfo{ID: row.CategoryID.String, Name: row.CategoryName.String, Slug: row.CategorySlug.String}
	}
	if cert := s.fetchUserIsCertified(ctx, row.AuthorID); cert != nil {
		resp.Author.IsCertified = *cert
	}
	resp.Attributions = s.fetchAttributions(ctx, row.ID)
	resp.CoAuthors = s.fetchCoAuthors(ctx, row.ID)
	if resp.Attributions == nil {
		resp.Attributions = []AttributionInfo{}
	}
	if resp.CoAuthors == nil {
		resp.CoAuthors = []AuthorInfo{}
	}
	return resp, nil
}

// GetBySlug lit un article publié et applique la troncature paywall.
func (s *Service) GetBySlug(ctx context.Context, slug, publicationID string, viewerID string, viewerEmail string) (ArticleResponse, error) {
	row, err := s.q.GetArticleBySlug(ctx, db.GetArticleBySlugParams{Slug: slug, PublicationId: publicationID})
	if err != nil {
		// pgx.ErrNoRows → 404 propre (sinon le handler renvoie 500).
		if errors.Is(err, pgx.ErrNoRows) {
			return ArticleResponse{}, errNotFound
		}
		return ArticleResponse{}, err
	}

	// Entitlements du lecteur (abonné de la publication).
	ent := UserEntitlements{}
	if viewerID != "" || viewerEmail != "" {
		sub, err := s.q.GetSubscriberEntitlement(ctx, db.GetSubscriberEntitlementParams{
			PublicationId: publicationID, UserId: toUUID(viewerID), Email: viewerEmail,
		})
		if err == nil {
			ent.IsMember = sub.IsActive
			ent.IsPaidSubscriber = sub.IsPremium && sub.IsActive
			if sub.TierId.Valid {
				t := sub.TierId.String
				ent.TierID = &t
			}
		}
	}

	cut := SliceContentAtPaywall(row.Content, ent, string(row.Visibility), textPtr(row.TierId))

	return articleFromSlugRow(row, cut), nil
}

// Create crée un article avec RBAC (personnel owner ou membre média, workflow de revue).
func (s *Service) Create(ctx context.Context, userID string, in CreateArticleInput) (string, error) {
	if !IsValidContentFormat(in.ContentFormat) {
		return "", errInvalidContentFormat
	}
	if userID == "" {
		if p, ok := middleware.GetPrincipal(ctx); ok && p.CreatedByUserID != nil && *p.CreatedByUserID != "" {
			userID = *p.CreatedByUserID
		}
	}
	if userID == "" {
		var ownerID string
		_ = s.pool.QueryRow(ctx, `
			SELECT mm."userId"::text
			FROM "MediaMember" mm
			JOIN "Media" md ON md.id = mm."mediaId"
			WHERE md."publicationId" = $1 AND mm.role = 'owner' AND mm.status = 'active'
			LIMIT 1`, in.PublicationID).Scan(&ownerID)
		if ownerID != "" {
			userID = ownerID
		}
	}
	mc, err := s.resolveMember(ctx, userID, in.PublicationID)
	if err != nil {
		return "", err
	}
	if in.Visibility == "" {
		in.Visibility = VisPublic
	}

	status := in.Status
	if status == "" {
		status = "DRAFT"
	}
	published := in.Published

	if mc.isMedia {
		if !mc.can(permissions.PermCreateArticles) {
			return "", errors.New("Vous n'avez pas la permission de créer des articles dans ce Média.")
		}
		switch status {
		case "SUBMITTED":
			if published {
				return "", errors.New("Impossible de soumettre un article déjà publié.")
			}
			published = false
		case "PUBLISHED":
			if !mc.can(permissions.PermPublishAny) {
				return "", errors.New("Vous n'avez pas la permission de publier. Utilisez « Soumettre pour revue ».")
			}
			published = true
		default:
			if published && !mc.can(permissions.PermPublishAny) {
				return "", errors.New("Vous n'avez pas la permission de publier. Utilisez « Soumettre pour revue ».")
			}
		}
	}

	// Programmation : une demande de publication avec une date future devient
	// SCHEDULED (le worker scheduled_publisher bascule à l'échéance). Une date
	// passée publie immédiatement. Un média doit avoir la permission de publier
	// pour programmer (c'est une publication différée).
	if in.ScheduledAt != nil && !in.ScheduledAt.IsZero() && in.ScheduledAt.After(time.Now()) &&
		(published || status == "PUBLISHED") {
		if mc.isMedia && !mc.can(permissions.PermPublishAny) {
			return "", errors.New("Vous n'avez pas la permission de programmer une publication.")
		}
		status = "SCHEDULED"
		published = false
	}

	finalSlug := s.uniqueSlug(ctx, in.PublicationID, "", in.Slug)

	id, err := s.q.CreateArticle(ctx, db.CreateArticleParams{
		Title:                  in.Title,
		Slug:                   finalSlug,
		Content:                NormalizeContent(in.Content, in.ContentFormat),
		Published:              published,
		IsPremium:              in.IsPremium,
		Visibility:             db.ContentVisibility(in.Visibility),
		ReadingTime:            int32(in.ReadingTime),
		AllowPublicAnnotations: true,
		AllowComments:          true,
		Status:                 status,
		PublicationId:          in.PublicationID,
		AuthorId:               toUUID(userID),
		CategoryId:             textVal(in.CategoryID),
		TierId:                 textVal(in.TierID),
		SeoTitle:               textVal(in.SeoTitle),
		SeoDescription:         textVal(in.SeoDescription),
		ScheduledAt:            timestampPtr(in.ScheduledAt),
	})
	if err != nil {
		return "", err
	}
	s.syncAttributions(ctx, id, userID, in.Attributions)
	s.queueSearchSync(id, "upsert")

	switch {
	case status == "SUBMITTED":
		s.notifyReviewers(ctx, in.PublicationID, id, userID)
	case published:
		if row, err := s.q.GetArticleByID(ctx, id); err == nil {
			s.emitPublished(ctx, row)
		}
	}
	return id, nil
}

// List liste les articles d'une publication (RBAC créateur requis, avec catégorie).
// period: "7d" | "30d" | "90d" | "all" (défaut 30d) — filtre ReadingSession pour Vues.
func (s *Service) List(ctx context.Context, userID, publicationID string, limit, offset int, period string) ([]ArticleResponse, error) {
	if _, err := s.resolveMember(ctx, userID, publicationID); err != nil {
		return nil, err
	}
	rows, err := s.q.ListArticlesWithCategory(ctx, db.ListArticlesWithCategoryParams{
		PublicationId: publicationID, Limit: int32(limit), Offset: int32(offset),
	})
	if err != nil {
		return nil, err
	}
	out := make([]ArticleResponse, 0, len(rows))
	for _, r := range rows {
		item := ArticleResponse{
			ID: r.ID, Title: r.Title, Slug: r.Slug, Published: r.Published,
			IsPremium: r.IsPremium, Visibility: string(r.Visibility), ReadingTime: int(r.ReadingTime),
			Status: r.Status, PublicationID: r.PublicationId,
			CategoryID:    textPtr(r.CategoryId),
			CreatedAt:     r.CreatedAt.Time.Format(time.RFC3339),
			UpdatedAt:     r.UpdatedAt.Time.Format(time.RFC3339),
			AccessGranted: true,
			CoAuthors:     []AuthorInfo{},
			Attributions:  []AttributionInfo{},
		}
		if r.CategoryName.Valid {
			item.Category = &CategoryInfo{ID: r.CategoryID.String, Name: r.CategoryName.String, Slug: r.CategorySlug.String}
		}
		out = append(out, item)
	}
	// Enrichit Vues / Vues uniques / Comments par lot (une seule requête par type)
	if s.pool != nil && len(out) > 0 {
		ids := make([]string, len(out))
		for i, a := range out {
			ids[i] = a.ID
		}
		cutoff := periodCutoff(period)
		views, uniques := s.fetchViewsBatch(ctx, ids, cutoff)
		comments := s.fetchCommentsBatch(ctx, ids)
		for i := range out {
			if v, ok := views[out[i].ID]; ok {
				out[i].Views = v
			}
			if u, ok := uniques[out[i].ID]; ok {
				out[i].ViewsUnique = u
			}
			if c, ok := comments[out[i].ID]; ok {
				out[i].CommentsCount = c
			}
		}
	}
	return out, nil
}

// Update met à jour un article avec RBAC + workflow média (miroir saveArticleAction).
func (s *Service) Update(ctx context.Context, articleID, userID string, in UpdateArticleInput) error {
	if !IsValidContentFormat(in.ContentFormat) {
		return errInvalidContentFormat
	}
	row, err := s.q.GetArticleByID(ctx, articleID)
	if err != nil {
		return errNotFound
	}

	// Gate 1 : auteur direct OU clé API média OU publication active du workspace OU co-auteur avec attribution.
	isMediaPrincipal := false
	if p, ok := middleware.GetPrincipal(ctx); ok && p.Type == middleware.PrincipalTypePublication && p.PublicationID != nil && *p.PublicationID == row.PublicationId {
		isMediaPrincipal = true
	}
	isAuthor := uuidString(row.AuthorId) == userID || isMediaPrincipal
	if !isAuthor && row.PublicationId != in.ActivePublicationID {
		var isCoAuthor bool
		_ = s.pool.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1 FROM "ArticleAttribution" aa
				WHERE aa."articleId" = $1 AND aa."userId" = $2 AND aa."consentStatus" IN ('PENDING', 'ACCEPTED')
			)
		`, articleID, toUUID(userID)).Scan(&isCoAuthor)
		if !isCoAuthor {
			return errForbidden
		}
	}

	mc, err := s.resolveMember(ctx, userID, row.PublicationId)
	if err != nil && !isAuthor {
		// Si l'utilisateur est co-auteur hors média, on autorise l'édition sans appartenance média
		var isCoAuthor bool
		_ = s.pool.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1 FROM "ArticleAttribution" aa
				WHERE aa."articleId" = $1 AND aa."userId" = $2 AND aa."consentStatus" IN ('PENDING', 'ACCEPTED')
			)
		`, articleID, toUUID(userID)).Scan(&isCoAuthor)
		if !isCoAuthor {
			return err
		}
	}

	// Workflow média : état effectif de publication.
	effectivePublished := in.Published
	effectiveStatus := in.Status
	if effectiveStatus == "" {
		effectiveStatus = row.Status
	}
	if effectiveStatus == "" {
		effectiveStatus = "DRAFT"
	}

	if mc.isMedia {
		if !isMediaPrincipal && !permissions.CanEditMediaArticle(mc.member, uuidString(row.AuthorId), userID) {
			return errForbidden
		}
		switch {
		case effectiveStatus == "SUBMITTED":
			if row.Published {
				return errors.New("Impossible de soumettre un article déjà publié.")
			}
			effectivePublished = false
		case row.Published:
			// Un rédacteur éditant un article déjà publié ne peut pas changer son état.
			effectivePublished = true
			effectiveStatus = row.Status
			if effectiveStatus == "" {
				effectiveStatus = "PUBLISHED"
			}
		case effectiveStatus == "PUBLISHED" || in.Published:
			if !mc.can(permissions.PermPublishAny) {
				return errors.New("Vous n'avez pas la permission de publier. Utilisez « Soumettre pour revue ».")
			}
			effectivePublished = true
			effectiveStatus = "PUBLISHED"
		default:
			effectivePublished = false
			effectiveStatus = "DRAFT"
		}
	}

	// Programmation à la mise à jour : future + publication demandée → SCHEDULED.
	scheduledAt := row.ScheduledAt
	if in.ScheduledAt != nil && !in.ScheduledAt.IsZero() {
		if in.ScheduledAt.After(time.Now()) && (effectivePublished || effectiveStatus == "PUBLISHED") {
			if mc.isMedia && !mc.can(permissions.PermPublishAny) {
				return errors.New("Vous n'avez pas la permission de programmer une publication.")
			}
			effectiveStatus = "SCHEDULED"
			effectivePublished = false
		}
		scheduledAt = pgtype.Timestamp{Time: *in.ScheduledAt, Valid: true}
	}

	finalSlug := s.uniqueSlug(ctx, row.PublicationId, articleID, in.Slug)

	// 🛡️ Protection de l'article en ligne :
	// Si l'article est déjà publié et que la requête ne demande PAS la publication directe
	// (ex: auto-save en cours d'édition dans Studio), on ne touche JAMAIS au contenu public en direct.
	// Les modifications sont isolées dans "draftContent".
	if row.Published && !in.Published && effectiveStatus != "PUBLISHED" {
		normalizedDraft := NormalizeContent(in.Content, in.ContentFormat)
		if _, err := s.q.UpdateArticleDraft(ctx, db.UpdateArticleDraftParams{
			ID:           articleID,
			DraftContent: pgtype.Text{String: normalizedDraft, Valid: true},
		}); err != nil {
			return err
		}
		s.syncAttributions(ctx, articleID, uuidString(row.AuthorId), in.Attributions)
		return nil
	}

	// Si l'article est publié ET que l'auteur demande explicitement de publier/mettre à jour en ligne :
	// Le nouveau contenu est promu en public, et on purge draftContent.
	contentToSave := NormalizeContent(in.Content, in.ContentFormat)
	if row.Published && in.Published {
		_, _ = s.q.UpdateArticleDraft(ctx, db.UpdateArticleDraftParams{
			ID:           articleID,
			DraftContent: pgtype.Text{Valid: false},
		})
	}

	if _, err := s.q.UpdateArticleFull(ctx, db.UpdateArticleFullParams{
		ID: articleID, Title: in.Title, Content: contentToSave, Slug: finalSlug,
		Published: effectivePublished, Status: effectiveStatus,
		IsPremium: in.IsPremium, CategoryId: textVal(in.CategoryID),
		SeoTitle: textVal(in.SeoTitle), SeoDescription: textVal(in.SeoDescription),
		ReadingTime: int32(in.ReadingTime), ScheduledAt: scheduledAt,
	}); err != nil {
		return err
	}
	s.syncAttributions(ctx, articleID, uuidString(row.AuthorId), in.Attributions)
	s.queueSearchSync(articleID, "upsert")
	s.emitArticleLifecycle(queue.TaskArticleUpdated, row, in.Title, in.Slug)

	// Fan-out + événement à la transition draft→publié.
	if effectivePublished && !row.Published {
		s.emitPublished(ctx, row)
	}
	return nil
}

// SetStatus met à jour l'état (DRAFT/SUBMITTED/PUBLISHED). scheduledAt nil =
// conserver la date existante ; un temps non nul (futur) → statut SCHEDULED.
func (s *Service) SetStatus(ctx context.Context, articleID, userID, status string, published bool, scheduledAt *time.Time) error {
	row, err := s.q.GetArticleByID(ctx, articleID)
	if err != nil {
		return errNotFound
	}
	mc, err := s.resolveMember(ctx, userID, row.PublicationId)
	if err != nil {
		return err
	}
	if (published || status == "SCHEDULED") && !mc.can(permissions.PermPublishAny) {
		return errForbidden
	}
	if status == "SCHEDULED" && (scheduledAt == nil || !scheduledAt.After(time.Now())) {
		return errors.New("Une programmation nécessite une date future.")
	}
	newScheduledAt := row.ScheduledAt
	if scheduledAt != nil && !scheduledAt.IsZero() {
		newScheduledAt = pgtype.Timestamp{Time: *scheduledAt, Valid: true}
	}
	if _, err := s.q.SetArticleStatus(ctx, db.SetArticleStatusParams{
		ID: articleID, Status: status, Published: published, ScheduledAt: newScheduledAt,
	}); err != nil {
		return err
	}
	if published {
		_, _ = s.q.PublishArticleDraft(ctx, articleID)
	}
	s.queueSearchSync(articleID, "upsert")
	if published {
		s.emitPublished(ctx, row)
	}
	return nil
}

// Schedule programme (ou annule) la publication d'un article : date future →
// statut SCHEDULED ; nil → retour au brouillon (la programmation est levée).
func (s *Service) Schedule(ctx context.Context, articleID, userID string, scheduledAt *time.Time) error {
	row, err := s.q.GetArticleByID(ctx, articleID)
	if err != nil {
		return errNotFound
	}
	mc, err := s.resolveMember(ctx, userID, row.PublicationId)
	if err != nil {
		return err
	}
	if scheduledAt == nil {
		// Annulation : retour au brouillon, plus de date.
		status := row.Status
		if status == "SCHEDULED" {
			status = "DRAFT"
		}
		if _, err := s.q.SetArticleStatus(ctx, db.SetArticleStatusParams{
			ID: articleID, Status: status, Published: false,
		}); err != nil {
			return err
		}
		s.queueSearchSync(articleID, "upsert")
		return nil
	}
	if !scheduledAt.After(time.Now()) {
		return errors.New("La date de programmation doit être dans le futur.")
	}
	if !mc.can(permissions.PermPublishAny) {
		return errForbidden
	}
	if _, err := s.q.SetArticleStatus(ctx, db.SetArticleStatusParams{
		ID: articleID, Status: "SCHEDULED", Published: false,
		ScheduledAt: pgtype.Timestamp{Time: *scheduledAt, Valid: true},
	}); err != nil {
		return err
	}
	s.queueSearchSync(articleID, "upsert")
	return nil
}

// queueSearchSync enqueue un job de sync Meilisearch.
func (s *Service) queueSearchSync(articleID string, action string) {
	if s.ac == nil {
		return
	}
	_ = queue.PublishSearchSync(s.ac, queue.SearchSyncPayload{ArticleID: articleID, Action: action})
}

// emitPublished enqueue l'événement article.published dans asynq, plus le
// job d'embedding sémantique (jina-embeddings-v3) si le service est branché.
func (s *Service) emitPublished(ctx context.Context, row db.GetArticleByIDRow) {
	if s.ac == nil {
		return
	}
	_ = queue.PublishArticleEmbedding(s.ac, queue.EmbeddingPayload{ArticleID: row.ID})
	_ = queue.PublishArticlePublished(s.ac, queue.ArticlePublishedPayload{
		EventID:       "article_published_" + row.ID,
		PublicationID: row.PublicationId,
		ArticleID:     row.ID,
		AuthorID:      row.AuthorID,
		Title:         row.Title,
		Slug:          row.Slug,
		Visibility:    string(row.Visibility),
		PublishedAt:   time.Now().UTC().Format(time.RFC3339),
	})
}

// Delete supprime un article (RBAC média complet, miroir deleteArticleAction).
func (s *Service) Delete(ctx context.Context, articleID, userID, activePublicationID string) error {
	row, err := s.q.GetArticleByID(ctx, articleID)
	if err != nil {
		return errNotFound
	}

	isMediaPrincipal := false
	if p, ok := middleware.GetPrincipal(ctx); ok && p.Type == middleware.PrincipalTypePublication && p.PublicationID != nil && *p.PublicationID == row.PublicationId {
		isMediaPrincipal = true
	}

	isAuthor := uuidString(row.AuthorId) == userID || isMediaPrincipal
	if !isAuthor && row.PublicationId != activePublicationID {
		return errForbidden
	}

	mc, err := s.resolveMember(ctx, userID, row.PublicationId)
	if err != nil {
		return err
	}
	if mc.isMedia && !isMediaPrincipal {
		if !mc.can(permissions.PermDeleteAny) {
			if !isAuthor || !mc.can(permissions.PermEditOwn) {
				return errForbidden
			}
		}
	}
	if err := s.q.DeleteArticle(ctx, articleID); err != nil {
		return err
	}
	s.emitArticleLifecycle(queue.TaskArticleDeleted, row, row.Title, row.Slug)
	return nil
}

// uniqueSlug garantit l'unicité du slug dans la publication (fallback shortId).
func (s *Service) uniqueSlug(ctx context.Context, publicationID, articleID, base string) string {
	final := base
	if final == "" {
		final = "article-" + slug.ShortID(8)
	}
	exists, err := s.q.CheckArticleSlugExists(ctx, db.CheckArticleSlugExistsParams{
		PublicationId: publicationID, Slug: final, ID: articleID,
	})
	if err == nil && exists {
		final = final + "-" + slug.ShortID(4)
	}
	return final
}

// notifyReviewers notifie les approbateurs (media:review) d'une soumission — best-effort.
func (s *Service) notifyReviewers(ctx context.Context, publicationID, articleID, senderID string) {
	_ = s.q.InsertMediaArticleSubmittedFanout(ctx, db.InsertMediaArticleSubmittedFanoutParams{
		PublicationID: publicationID,
		ArticleID:     pgtype.Text{String: articleID, Valid: true},
		SenderID:      toUUID(senderID),
	})
}

// GetByID retourne un article complet pour l'éditeur (RBAC : auteur ou membre).
func (s *Service) GetByID(ctx context.Context, articleID, userID string) (ArticleResponse, error) {
	row, err := s.q.GetArticleByID(ctx, articleID)
	if err != nil {
		return ArticleResponse{}, errNotFound
	}
	if row.AuthorID != userID {
		isMember := false
		if _, err := s.resolveMember(ctx, userID, row.PublicationId); err == nil {
			isMember = true
		}
		if !isMember {
			var isCollab bool
			_ = s.pool.QueryRow(ctx, `
				SELECT EXISTS (
					SELECT 1 FROM "ArticleAttribution" aa
					WHERE aa."articleId" = $1 AND aa."userId" = $2 AND aa."consentStatus" IN ('PENDING', 'ACCEPTED')
					UNION
					SELECT 1 FROM "CollaborationRequest" cr
					WHERE cr."articleId" = $1 AND cr."inviteeId" = $2 AND cr.status IN ('PENDING', 'ACCEPTED')
				)
			`, articleID, toUUID(userID)).Scan(&isCollab)
			if !isCollab {
				return ArticleResponse{}, errForbidden
			}
		}
	}
	resp := s.articleResponseFromIDRow(row)
	// Enrichit pour l'éditeur : imageUrl, isCertified, attributions, coAuthors (toujours tableaux, jamais null)
	if img := s.fetchArticleImageUrl(ctx, articleID); img != nil {
		resp.ImageUrl = img
	}
	if cert := s.fetchUserIsCertified(ctx, row.AuthorID); cert != nil {
		resp.Author.IsCertified = *cert
	}
	resp.Attributions = s.fetchAttributions(ctx, articleID)
	resp.CoAuthors = s.fetchCoAuthors(ctx, articleID)
	if resp.Attributions == nil {
		resp.Attributions = []AttributionInfo{}
	}
	if resp.CoAuthors == nil {
		resp.CoAuthors = []AuthorInfo{}
	}
	// Catégorie embarquée si présente
	if row.CategoryId.Valid {
		if cat := s.fetchCategory(ctx, row.CategoryId.String); cat != nil {
			resp.Category = cat
		}
	}
	return resp, nil
}

func (s *Service) fetchArticleImageUrl(ctx context.Context, articleID string) *string {
	if s.pool == nil {
		return nil
	}
	var v pgtype.Text
	if err := s.pool.QueryRow(ctx, `SELECT "imageUrl" FROM "Article" WHERE id=$1`, articleID).Scan(&v); err != nil || !v.Valid {
		return nil
	}
	return &v.String
}

func (s *Service) fetchUserIsCertified(ctx context.Context, userID string) *bool {
	if s.pool == nil {
		return nil
	}
	var v bool
	if err := s.pool.QueryRow(ctx, `SELECT "isCertified" FROM "User" WHERE id=$1`, userID).Scan(&v); err != nil {
		return nil
	}
	return &v
}

func (s *Service) fetchCategory(ctx context.Context, categoryID string) *CategoryInfo {
	if s.pool == nil {
		return nil
	}
	var id, name, slug string
	if err := s.pool.QueryRow(ctx, `SELECT id, name, slug FROM "Category" WHERE id=$1`, categoryID).Scan(&id, &name, &slug); err != nil {
		return nil
	}
	return &CategoryInfo{ID: id, Name: name, Slug: slug}
}

func (s *Service) fetchAttributions(ctx context.Context, articleID string) []AttributionInfo {
	if s.pool == nil {
		return []AttributionInfo{}
	}
	rows, err := s.pool.Query(ctx, `
		SELECT aa.role, aa."order", aa."isVisible", aa."consentStatus",
		       u.id::text, u.name, u.username, u."logoUrl", u."isCertified"
		FROM "ArticleAttribution" aa
		JOIN "User" u ON u.id = aa."userId"
		WHERE aa."articleId"=$1
		ORDER BY aa."order" ASC`, articleID)
	if err != nil {
		return []AttributionInfo{}
	}
	defer rows.Close()
	out := []AttributionInfo{}
	for rows.Next() {
		var role string
		var order int32
		var isVisible bool
		var consentStatus string
		var uid string
		var name, username, logoUrl pgtype.Text
		var isCertified bool
		if err := rows.Scan(&role, &order, &isVisible, &consentStatus, &uid, &name, &username, &logoUrl, &isCertified); err != nil {
			continue
		}
		out = append(out, AttributionInfo{
			User: AuthorInfo{
				ID: uid, Name: textPtr(name), Username: textPtr(username), LogoURL: textPtr(logoUrl), IsCertified: isCertified,
			},
			Role: role, Order: int(order), IsVisible: isVisible, ConsentStatus: consentStatus,
		})
	}
	return out
}

func (s *Service) fetchCoAuthors(ctx context.Context, articleID string) []AuthorInfo {
	if s.pool == nil {
		return []AuthorInfo{}
	}
	rows, err := s.pool.Query(ctx, `
		SELECT u.id::text, u.name, u.username, u."logoUrl", u."isCertified"
		FROM "_CoAuthors" ca
		JOIN "User" u ON u.id = ca."B"
		WHERE ca."A"=$1`, articleID)
	if err != nil {
		return []AuthorInfo{}
	}
	defer rows.Close()
	out := []AuthorInfo{}
	for rows.Next() {
		var uid string
		var name, username, logoUrl pgtype.Text
		var isCertified bool
		if err := rows.Scan(&uid, &name, &username, &logoUrl, &isCertified); err != nil {
			continue
		}
		out = append(out, AuthorInfo{ID: uid, Name: textPtr(name), Username: textPtr(username), LogoURL: textPtr(logoUrl), IsCertified: isCertified})
	}
	// Enrichit avec les co-auteurs issus de ArticleAttribution
	attrRows, err := s.pool.Query(ctx, `
		SELECT u.id::text, u.name, u.username, u."logoUrl", u."isCertified"
		FROM "ArticleAttribution" aa
		JOIN "User" u ON u.id = aa."userId"
		WHERE aa."articleId"=$1 AND aa.role='CO_AUTHOR' AND aa."consentStatus"='ACCEPTED'`, articleID)
	if err == nil {
		defer attrRows.Close()
		seen := make(map[string]bool)
		for _, a := range out {
			seen[a.ID] = true
		}
		for attrRows.Next() {
			var uid string
			var name, username, logoUrl pgtype.Text
			var isCertified bool
			if err := attrRows.Scan(&uid, &name, &username, &logoUrl, &isCertified); err == nil && !seen[uid] {
				seen[uid] = true
				out = append(out, AuthorInfo{ID: uid, Name: textPtr(name), Username: textPtr(username), LogoURL: textPtr(logoUrl), IsCertified: isCertified})
			}
		}
	}
	return out
}

func (s *Service) syncAttributions(ctx context.Context, articleID, authorID string, attributions []ArticleAttributionInput) {
	if s.pool == nil {
		return
	}
	// Toujours s'assurer que l'auteur principal a son attribution PRIMARY_AUTHOR ACCEPTED
	_, _ = s.pool.Exec(ctx, `
		INSERT INTO "ArticleAttribution" (id, "articleId", "userId", role, "order", "isVisible", "consentStatus", "consentUpdatedAt", "updatedAt")
		VALUES (gen_random_uuid()::text, $1, $2, 'PRIMARY_AUTHOR', 0, true, 'ACCEPTED', now(), now())
		ON CONFLICT ("articleId", "userId") DO UPDATE SET
		  role = 'PRIMARY_AUTHOR', "order" = 0, "isVisible" = true, "consentStatus" = 'ACCEPTED', "updatedAt" = now()
	`, articleID, toUUID(authorID))

	if len(attributions) == 0 {
		return
	}

	for _, attr := range attributions {
		if attr.UserID == "" || attr.UserID == authorID {
			continue
		}
		role := attr.Role
		if role == "" {
			role = "CO_AUTHOR"
		}
		order := attr.Order
		if order <= 0 {
			order = 1
		}

		// Vérifie si une attribution existe déjà
		var existingConsent pgtype.Text
		err := s.pool.QueryRow(ctx, `
			SELECT "consentStatus" FROM "ArticleAttribution"
			WHERE "articleId" = $1 AND "userId" = $2
		`, articleID, toUUID(attr.UserID)).Scan(&existingConsent)

		if errors.Is(err, pgx.ErrNoRows) {
			// Nouveau contributeur : insertion avec statut PENDING
			_, _ = s.pool.Exec(ctx, `
				INSERT INTO "ArticleAttribution" (id, "articleId", "userId", role, "order", "isVisible", "consentStatus", "consentUpdatedAt", "updatedAt")
				VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, 'PENDING', now(), now())
				ON CONFLICT ("articleId", "userId") DO NOTHING
			`, articleID, toUUID(attr.UserID), role, order, attr.IsVisible)

			// Création de la demande de collaboration
			_, _ = s.pool.Exec(ctx, `
				INSERT INTO "CollaborationRequest" (id, "articleId", "inviterId", "inviteeId", status, "requestedRole", "requestedOrder", "showOnPublicProfile", "createdAt", "updatedAt")
				VALUES (gen_random_uuid()::text, $1, $2, $3, 'PENDING', $4, $5, $6, now(), now())
				ON CONFLICT ("articleId", "inviteeId") DO UPDATE SET
				  status = 'PENDING', "requestedRole" = $4, "requestedOrder" = $5, "showOnPublicProfile" = $6, "updatedAt" = now()
			`, articleID, toUUID(authorID), toUUID(attr.UserID), role, order, attr.IsVisible)

			// Émission de la notification in-app garantie
			_ = s.q.InsertArticleContributorNotification(ctx, db.InsertArticleContributorNotificationParams{
				Column1: toUUID(attr.UserID),
				Column2: toUUID(authorID),
				Column3: db.NotificationTypeARTICLECONTRIBUTORINVITED,
				Column4: articleID,
			})
		} else if err == nil {
			// Contributeur existant : mise à jour du rôle, de l'ordre et de la visibilité
			_, _ = s.pool.Exec(ctx, `
				UPDATE "ArticleAttribution"
				SET role = $3, "order" = $4, "isVisible" = $5, "updatedAt" = now()
				WHERE "articleId" = $1 AND "userId" = $2
			`, articleID, toUUID(attr.UserID), role, order, attr.IsVisible)
		}
	}
}

func periodCutoff(period string) *time.Time {
	var d time.Duration
	switch period {
	case "7d":
		d = 7 * 24 * time.Hour
	case "30d":
		d = 30 * 24 * time.Hour
	case "90d":
		d = 90 * 24 * time.Hour
	case "all":
		return nil
	default:
		d = 30 * 24 * time.Hour
	}
	t := time.Now().Add(-d)
	return &t
}

func (s *Service) fetchViewsBatch(ctx context.Context, ids []string, cutoff *time.Time) (map[string]int, map[string]int) {
	views := map[string]int{}
	uniques := map[string]int{}
	if s.pool == nil || len(ids) == 0 {
		return views, uniques
	}
	// Views totaux
	q := `SELECT "articleId", COUNT(*)::int FROM "ReadingSession" WHERE "articleId" = ANY($1)`
	args := []interface{}{ids}
	if cutoff != nil {
		q += ` AND "createdAt" >= $2`
		args = append(args, *cutoff)
	}
	q += ` GROUP BY "articleId"`
	rows, err := s.pool.Query(ctx, q, args...)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var id string
			var c int
			if err := rows.Scan(&id, &c); err == nil {
				views[id] = c
			}
		}
	}
	// Uniques (distinct userId non null)
	q2 := `SELECT "articleId", COUNT(DISTINCT "userId")::int FROM "ReadingSession" WHERE "articleId" = ANY($1) AND "userId" IS NOT NULL`
	args2 := []interface{}{ids}
	if cutoff != nil {
		q2 += ` AND "createdAt" >= $2`
		args2 = append(args2, *cutoff)
	}
	q2 += ` GROUP BY "articleId"`
	rows2, err := s.pool.Query(ctx, q2, args2...)
	if err == nil {
		defer rows2.Close()
		for rows2.Next() {
			var id string
			var c int
			if err := rows2.Scan(&id, &c); err == nil {
				uniques[id] = c
			}
		}
	}
	return views, uniques
}

func (s *Service) fetchCommentsBatch(ctx context.Context, ids []string) map[string]int {
	m := map[string]int{}
	if s.pool == nil || len(ids) == 0 {
		return m
	}
	rows, err := s.pool.Query(ctx, `SELECT "articleId", COUNT(*)::int FROM "ArticleComment" WHERE "articleId" = ANY($1) GROUP BY "articleId"`, ids)
	if err != nil {
		return m
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var c int
		if err := rows.Scan(&id, &c); err == nil {
			m[id] = c
		}
	}
	return m
}

// Review approuve ou rejette un article soumis (RBAC media:review).
func (s *Service) Review(ctx context.Context, articleID, userID string, approve bool) error {
	row, err := s.q.GetArticleByID(ctx, articleID)
	if err != nil {
		return errNotFound
	}
	if row.Status != "SUBMITTED" {
		return errors.New("Cet article n'est pas en attente de revue.")
	}
	mc, err := s.resolveMember(ctx, userID, row.PublicationId)
	if err != nil {
		return err
	}
	if !mc.isMedia || !mc.can(permissions.PermReview) {
		return errors.New("Vous n'avez pas la permission de revoir cet article.")
	}

	status := "DRAFT"
	published := false
	if approve {
		status = "PUBLISHED"
		published = true
	}
	if _, err := s.q.SetArticleStatus(ctx, db.SetArticleStatusParams{
		ID: articleID, Status: status, Published: published,
	}); err != nil {
		return err
	}
	s.queueSearchSync(articleID, "upsert")
	if approve {
		s.emitPublished(ctx, row)
	}
	return nil
}

// SimilarArticles retourne les articles publiés les plus proches sémantiquement
// de l'article donné (cosine similarity via l'index HNSW pgvector).
// S'il n'y a pas encore de vecteur, la liste est vide (le worker d'embedding
// n'a pas encore indexé) plutôt qu'une erreur.
func (s *Service) SimilarArticles(ctx context.Context, articleID string, limit int) ([]SimilarArticle, error) {
	// Vérifie l'existence de l'article ET lit son vecteur (texte, NULL-safe).
	embedText, err := s.q.GetArticleEmbeddingText(ctx, articleID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errNotFound
		}
		return nil, err
	}
	if embedText == "" {
		// Pas encore indexé par le worker d'embedding → liste vide, pas d'erreur.
		return []SimilarArticle{}, nil
	}

	var source pgvector.Vector
	if err := source.Parse(embedText); err != nil {
		return nil, fmt.Errorf("parse embedding %s: %w", articleID, err)
	}

	if limit <= 0 || limit > 20 {
		limit = 6
	}
	rows, err := s.q.FindSimilarArticles(ctx, db.FindSimilarArticlesParams{
		Column1: source, ID: articleID, Limit: int32(limit),
	})
	if err != nil {
		return nil, err
	}
	out := make([]SimilarArticle, 0, len(rows))
	for _, r := range rows {
		out = append(out, SimilarArticle{
			ID:             r.ID,
			Title:          r.Title,
			Slug:           r.Slug,
			IsPremium:      r.IsPremium,
			ReadingTime:    int(r.ReadingTime),
			CreatedAt:      r.CreatedAt.Time.Format(time.RFC3339),
			PublicationID:  r.PublicationId,
			AuthorID:       uuidString(r.AuthorId),
			AuthorName:     textPtr(r.AuthorName),
			AuthorUsername: textPtr(r.AuthorUsername),
			AuthorLogo:     textPtr(r.AuthorLogo),
			Publication:    &r.PublicationName,
			Score:          r.Score,
		})
	}
	return out, nil
}

// SimilarArticle est un article recommandé sémantiquement (léger, pour cartes).
type SimilarArticle struct {
	ID             string  `json:"id"`
	Title          string  `json:"title"`
	Slug           string  `json:"slug"`
	IsPremium      bool    `json:"isPremium"`
	ReadingTime    int     `json:"readingTime"`
	CreatedAt      string  `json:"createdAt"`
	PublicationID  string  `json:"publicationId"`
	AuthorID       string  `json:"authorId"`
	AuthorName     *string `json:"authorName"`
	AuthorUsername *string `json:"authorUsername"`
	AuthorLogo     *string `json:"authorLogo"`
	Publication    *string `json:"publicationName"`
	Score          float64 `json:"score"`
}

// EditorCapabilities décrit les capacités d'édition dans le workspace actif.
func (s *Service) EditorCapabilities(ctx context.Context, userID, publicationID string) (map[string]any, error) {
	pub, err := s.q.GetPublicationTypeByID(ctx, publicationID)
	if err != nil {
		return nil, errNotFound
	}

	if pub.Type != "MEDIA" {
		return map[string]any{
			"isMedia": false, "canPublish": true, "canSubmit": false,
			"canReview": false, "role": nil, "workspaceName": pub.Name,
		}, nil
	}

	if p, ok := middleware.GetPrincipal(ctx); ok && p.Type == middleware.PrincipalTypePublication {
		if p.PublicationID != nil && *p.PublicationID == publicationID {
			return map[string]any{
				"isMedia":       true,
				"canPublish":    true,
				"canSubmit":     false,
				"canReview":     true,
				"role":          "owner",
				"workspaceName": pub.Name,
			}, nil
		}
	}

	row, err := s.q.GetMediaMemberContext(ctx, db.GetMediaMemberContextParams{
		PublicationId: publicationID, UserId: toUUID(userID),
	})
	if err != nil {
		return nil, errForbidden
	}
	m := &permissions.MediaMember{Role: row.Role, Permissions: row.Permissions, Status: row.Status}
	canPublish := permissions.CanMedia(m, permissions.PermPublishAny)
	canReview := permissions.CanMedia(m, permissions.PermReview)
	canCreate := permissions.CanMedia(m, permissions.PermCreateArticles)

	return map[string]any{
		"isMedia":       true,
		"canPublish":    canPublish,
		"canSubmit":     canCreate && !canPublish,
		"canReview":     canReview,
		"role":          row.Role,
		"workspaceName": pub.Name,
	}, nil
}

// articleResponseFromIDRow construit la réponse éditeur (contenu complet).
func (s *Service) articleResponseFromIDRow(row db.GetArticleByIDRow) ArticleResponse {
	content := row.Content
	hasUnpublishedChanges := false
	var draftContent *string
	if row.DraftContent.Valid && row.DraftContent.String != "" {
		draftContent = &row.DraftContent.String
		if row.Published {
			// Pour un article déjà publié, l'éditeur charge le brouillon en cours de travail
			content = row.DraftContent.String
			hasUnpublishedChanges = true
		}
	}

	return ArticleResponse{
		ID: row.ID, Title: row.Title, Slug: row.Slug, Content: content,
		DraftContent: draftContent, HasUnpublishedChanges: hasUnpublishedChanges,
		Published: row.Published, IsPremium: row.IsPremium, Visibility: string(row.Visibility),
		ReadingTime: int(row.ReadingTime), Status: row.Status, ScheduledAt: tsPtr(row.ScheduledAt),
		PublicationID: row.PublicationId,
		AuthorID:      row.AuthorID, CategoryID: textPtr(row.CategoryId), TierID: textPtr(row.TierId),
		SeoTitle: textPtr(row.SeoTitle), SeoDescription: textPtr(row.SeoDescription),
		CreatedAt:     row.CreatedAt.Time.Format(time.RFC3339),
		UpdatedAt:     row.UpdatedAt.Time.Format(time.RFC3339),
		AccessGranted: true,
		Author:        AuthorInfo{ID: row.AuthorID, Name: textPtr(row.AuthorName), Username: textPtr(row.AuthorUsername), LogoURL: textPtr(row.AuthorLogo)},
		Publication:   &PublicationInfo{ID: row.PublicationId, Name: row.PublicationName, Slug: row.PublicationSlug, Subdomain: textPtr(row.PublicationSubdomain)},
		CoAuthors:     []AuthorInfo{},
		Attributions:  []AttributionInfo{},
	}
}

func articleFromSlugRow(row db.GetArticleBySlugRow, cut PaywallCutResult) ArticleResponse {
	resp := ArticleResponse{
		ID: row.ID, Title: row.Title, Slug: row.Slug, Content: cut.Content,
		Published: row.Published, IsPremium: row.IsPremium, Visibility: string(row.Visibility),
		ReadingTime: int(row.ReadingTime), Status: row.Status, ScheduledAt: tsPtr(row.ScheduledAt),
		PublicationID: row.PublicationId,
		AuthorID:      row.AuthorID, CategoryID: textPtr(row.CategoryId), TierID: textPtr(row.TierId),
		SeoTitle: textPtr(row.SeoTitle), SeoDescription: textPtr(row.SeoDescription),
		ImageUrl:    textPtr(row.ArticleImage),
		CreatedAt:   row.CreatedAt.Time.Format(time.RFC3339),
		UpdatedAt:   row.UpdatedAt.Time.Format(time.RFC3339),
		IsTruncated: cut.IsTruncated, AccessGranted: cut.AccessGranted, PaywallMeta: cut.PaywallMeta,
		Author:      AuthorInfo{ID: row.AuthorID, Name: textPtr(row.AuthorName), Username: textPtr(row.AuthorUsername), LogoURL: textPtr(row.AuthorLogo)},
		Publication: &PublicationInfo{ID: row.PublicationId, Name: row.PublicationName, Slug: row.PublicationSlug, Subdomain: textPtr(row.PublicationSubdomain), LogoURL: textPtr(row.PublicationLogo), CustomDomain: textPtr(row.PublicationCustomDomain)},
		CoAuthors:   []AuthorInfo{},
		Attributions: []AttributionInfo{},
	}
	if row.CategoryID.Valid {
		resp.Category = &CategoryInfo{ID: row.CategoryID.String, Name: row.CategoryName.String, Slug: row.CategorySlug.String}
	}
	return resp
}

func articleFromRow(row db.GetArticleByIDRow, cut PaywallCutResult) ArticleResponse {
	return ArticleResponse{
		ID: row.ID, Title: row.Title, Slug: row.Slug, Content: cut.Content,
		Published: row.Published, IsPremium: row.IsPremium, Visibility: string(row.Visibility),
		ReadingTime: int(row.ReadingTime), Status: row.Status, ScheduledAt: tsPtr(row.ScheduledAt),
		PublicationID: row.PublicationId,
		AuthorID:      row.AuthorID, CategoryID: textPtr(row.CategoryId), TierID: textPtr(row.TierId),
		SeoTitle: textPtr(row.SeoTitle), SeoDescription: textPtr(row.SeoDescription),
		CreatedAt:   row.CreatedAt.Time.Format(time.RFC3339),
		UpdatedAt:   row.UpdatedAt.Time.Format(time.RFC3339),
		IsTruncated: cut.IsTruncated, AccessGranted: cut.AccessGranted, PaywallMeta: cut.PaywallMeta,
		Author:      AuthorInfo{ID: row.AuthorID, Name: textPtr(row.AuthorName), Username: textPtr(row.AuthorUsername), LogoURL: textPtr(row.AuthorLogo)},
		Publication: &PublicationInfo{ID: row.PublicationId, Name: row.PublicationName, Slug: row.PublicationSlug, Subdomain: textPtr(row.PublicationSubdomain)},
	}
}

// ListCreatorArticles liste les articles d'une publication au format du contrat
// créateurs (enveloppe `{data, pagination}`, contenu tronqué `contentHtml`,
// catégorie embarquée). Filtres : `published` (défaut true) et `category` (slug).
func (s *Service) ListCreatorArticles(ctx context.Context, userID, publicationID string, page, limit int, categorySlug string, publishedOnly bool) (CreatorListResponse, error) {
	if _, err := s.resolveMember(ctx, userID, publicationID); err != nil {
		return CreatorListResponse{}, err
	}

	var pub pgtype.Bool
	if publishedOnly {
		pub = pgtype.Bool{Bool: true, Valid: true}
	}
	var cat pgtype.Text
	if categorySlug != "" {
		cat = pgtype.Text{String: categorySlug, Valid: true}
	}
	offset := PageToOffset(page, limit)

	rows, err := s.q.ListCreatorArticles(ctx, db.ListCreatorArticlesParams{
		PublicationId: publicationID,
		Published:     pub,
		CategorySlug:  cat,
		Offset:        int32(offset),
		Limit:         int32(limit),
	})
	if err != nil {
		return CreatorListResponse{}, err
	}
	total, err := s.q.CountCreatorArticles(ctx, db.CountCreatorArticlesParams{
		PublicationId: publicationID,
		Published:     pub,
		CategorySlug:  cat,
	})
	if err != nil {
		return CreatorListResponse{}, err
	}

	items := make([]CreatorItem, 0, len(rows))
	for _, r := range rows {
		// Troncature zéro-fuite : jamais de contenu payant au-delà du marqueur.
		cut := SliceContentAtPaywall(r.Content, UserEntitlements{}, string(r.Visibility), textPtr(r.TierId))
		ar := ArticleResponse{
			ID: r.ID, Title: r.Title, Slug: r.Slug,
			Content:     cut.Content,
			IsTruncated: cut.IsTruncated,
			Visibility:  string(r.Visibility),
			ReadingTime: int(r.ReadingTime),
			IsPremium:   r.IsPremium,
			CreatedAt:   r.CreatedAt.Time.Format(time.RFC3339),
			UpdatedAt:   r.UpdatedAt.Time.Format(time.RFC3339),
			PaywallMeta: cut.PaywallMeta,
		}
		items = append(items, ToCreatorItem(ar, creatorCategoryFromRow(r)))
	}
	return ToCreatorList(items, int(total), page, limit), nil
}

// GetCreatorBySlug lit un article PUBLIÉ de la publication du créateur (contrat
// créateurs, clé API) : item `contentHtml` tronqué + catégorie embarquée.
func (s *Service) GetCreatorBySlug(ctx context.Context, slug, publicationID string) (CreatorItem, error) {
	row, err := s.q.GetCreatorArticleBySlug(ctx, db.GetCreatorArticleBySlugParams{Slug: slug, PublicationId: publicationID})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return CreatorItem{}, errNotFound
		}
		return CreatorItem{}, err
	}

	cut := SliceContentAtPaywall(row.Content, UserEntitlements{}, string(row.Visibility), textPtr(row.TierId))
	ar := ArticleResponse{
		ID: row.ID, Title: row.Title, Slug: row.Slug,
		Content:     cut.Content,
		IsTruncated: cut.IsTruncated,
		Visibility:  string(row.Visibility),
		ReadingTime: int(row.ReadingTime),
		IsPremium:   row.IsPremium,
		CreatedAt:   row.CreatedAt.Time.Format(time.RFC3339),
		UpdatedAt:   row.UpdatedAt.Time.Format(time.RFC3339),
		PaywallMeta: cut.PaywallMeta,
	}

	var cat *CreatorCategory
	if row.CategoryID.Valid {
		cat = &CreatorCategory{
			ID:          row.CategoryID.String,
			Name:        row.CategoryName.String,
			Slug:        row.CategorySlug.String,
			Description: textPtr(row.CategoryDescription),
		}
	}
	return ToCreatorItem(ar, cat), nil
}

// creatorCategoryFromRow construit la catégorie embarquée d'un item créateur
// (nil si l'article n'a pas de catégorie).
func creatorCategoryFromRow(r db.ListCreatorArticlesRow) *CreatorCategory {
	if !r.CategoryID.Valid {
		return nil
	}
	return &CreatorCategory{
		ID:          r.CategoryID.String,
		Name:        r.CategoryName.String,
		Slug:        r.CategorySlug.String,
		Description: textPtr(r.CategoryDescription),
	}
}

// emitArticleLifecycle enqueue un événement article.{updated,deleted} pour les
// webhooks abonnés (le worker dispatche vers les URLs HMAC-signées).
func (s *Service) emitArticleLifecycle(taskType string, row db.GetArticleByIDRow, title, slug string) {
	if s.ac == nil {
		return
	}
	if title == "" {
		title = row.Title
	}
	if slug == "" {
		slug = row.Slug
	}
	_ = queue.PublishArticleLifecycle(s.ac, taskType, queue.ArticlePublishedPayload{
		EventID:       "article_" + strings.TrimPrefix(taskType, "article.") + "_" + row.ID,
		PublicationID: row.PublicationId,
		ArticleID:     row.ID,
		AuthorID:      row.AuthorID,
		Title:         title,
		Slug:          slug,
		Visibility:    string(row.Visibility),
		PublishedAt:   time.Now().UTC().Format(time.RFC3339),
	})
}

func textPtr(t pgtype.Text) *string {
	if !t.Valid {
		return nil
	}
	v := t.String
	return &v
}

func textVal(p *string) pgtype.Text {
	if p == nil || *p == "" {
		return pgtype.Text{}
	}
	return pgtype.Text{String: *p, Valid: true}
}

// tsPtr convertit un timestamp SQL en string RFC3339 (nil si absent).
func tsPtr(t pgtype.Timestamp) *string {
	if !t.Valid {
		return nil
	}
	v := t.Time.UTC().Format(time.RFC3339)
	return &v
}

func timestampPtr(t *time.Time) pgtype.Timestamp {
	if t == nil || t.IsZero() {
		return pgtype.Timestamp{}
	}
	return pgtype.Timestamp{Time: *t, Valid: true}
}
