// Package articles — service d'articles (CRUD + paywall + workflow média).
package articles

import (
	"context"
	"encoding/json"
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
	"github.com/qoefi/api/internal/identity"
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
	// errAlreadyPublished protège les articles en ligne : une programmation ne
	// doit jamais retirer un article publié du site en attendant sa date.
	errAlreadyPublished = errors.New("Un article publié ne peut pas être programmé : retirez-le du site (ou partez d'un brouillon) avant de fixer une date.")
)

// ArticleResponse est la forme API d'un article (contenu éventuellement tronqué).
type ArticleResponse struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	Slug  string `json:"slug"`
	// ShortCode est le code court numérique (lien /l/{code} ou /{code} côté
	// tenant). Il permet au front de partager un lien stable même si le slug
	// change, sans deviner la hiérarchie de catégories.
	ShortCode              *string                        `json:"shortCode,omitempty"`
	Content                string                         `json:"content"`
	LiveContent            *string                        `json:"liveContent,omitempty"`
	DraftContent           *string                        `json:"draftContent,omitempty"`
	HasUnpublishedChanges  bool                           `json:"hasUnpublishedChanges"`
	ReviewFeedback         *ArticleReviewFeedbackResponse `json:"reviewFeedback,omitempty"`
	Published              bool                           `json:"published"`
	IsPremium              bool                           `json:"isPremium"`
	Visibility             string                         `json:"visibility"`
	ReadingTime            int                            `json:"readingTime"`
	Status                 string                         `json:"status"`
	ScheduledAt            *string                        `json:"scheduledAt"`
	EmailStatus            *string                        `json:"emailStatus,omitempty"`
	EmailSentAt            *string                        `json:"emailSentAt,omitempty"`
	EmailSentCount         int                            `json:"emailSentCount"`
	EmailResendCount       int                            `json:"emailResendCount"`
	PublisherID            string                         `json:"publisherId"`
	AuthorID               string                         `json:"authorId"`
	CategoryID             *string                        `json:"categoryId"`
	TierID                 *string                        `json:"tierId"`
	SeoTitle               *string                        `json:"seoTitle"`
	SeoDescription         *string                        `json:"seoDescription"`
	ImageUrl               *string                        `json:"imageUrl"`
	CoverAlt               string                         `json:"coverAlt"`
	CoverDecorative        bool                           `json:"coverDecorative"`
	CreatedAt              string                         `json:"createdAt"`
	UpdatedAt              string                         `json:"updatedAt"`
	IsTruncated            bool                           `json:"isTruncated"`
	AccessGranted          bool                           `json:"accessGranted"`
	AllowDownload          bool                           `json:"allowDownload"`
	AllowPublicAnnotations bool                           `json:"allowPublicAnnotations"`
	AllowComments          bool                           `json:"allowComments"`
	ShowOnPersonalProfile  bool                           `json:"showOnPersonalProfile"`
	OriginArticleID        *string                        `json:"originArticleId,omitempty"`
	CanonicalType          string                         `json:"canonicalType"`
	IsAuthorSovereignCopy  bool                           `json:"isAuthorSovereignCopy"`
	IsClaimed              bool                           `json:"isClaimed"`
	CanonicalURL           *string                        `json:"canonicalUrl,omitempty"`
	OriginPublisher        *PublisherInfo                 `json:"originPublisher,omitempty"`
	SovereignCopyID        *string                        `json:"sovereignCopyId,omitempty"`
	CanEdit                bool                           `json:"canEdit"`
	PaywallMeta            *PaywallMeta                   `json:"paywallMeta"`
	Author                 AuthorInfo                     `json:"author"`
	Publisher              *PublisherInfo                 `json:"publisher"`
	Category               *CategoryInfo                  `json:"category"`
	CoAuthors              []AuthorInfo                   `json:"coAuthors"`
	Attributions           []AttributionInfo              `json:"attributions"`
	Views                  int                            `json:"views"`
	ViewsUnique            int                            `json:"viewsUnique"`
	CommentsCount          int                            `json:"commentsCount"`
	LikesCount             int                            `json:"likesCount"`
	RepostsCount           int                            `json:"repostsCount"`
}

// CategoryInfo est la catégorie dénormalisée d'un article.
type CategoryInfo struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Slug string `json:"slug"`
	// ParentSlug permet de reconstituer le chemin hiérarchique
	// /{parent}/{categorie}/{article} sans requête supplémentaire.
	ParentSlug *string `json:"parentSlug,omitempty"`
}

// AuthorInfo est l'auteur dénormalisé.
type AuthorInfo struct {
	ID          string  `json:"id"`
	Name        *string `json:"name"`
	Username    *string `json:"username"`
	LogoURL     *string `json:"logoUrl"`
	IsCertified bool    `json:"isCertified"`
	// Type suit la publication de l'article (MEDIA/PERSONAL), jamais la
	// membership de l'auteur : un membre de média qui publie sur son profil
	// personnel reste PERSONAL.
	Type string `json:"type"`
}

// PublisherInfo est la publication dénormalisée.
type PublisherInfo struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	Slug         string  `json:"slug"`
	Subdomain    *string `json:"subdomain"`
	LogoURL      *string `json:"logoUrl,omitempty"`
	CustomDomain *string `json:"customDomain"`
	Type         string  `json:"type"`
}

// CreateArticleInput est l'entrée de création d'un article.
type CreateArticleInput struct {
	PublisherID            string
	Title                  string
	Slug                   string
	Content                string
	ContentFormat          string
	ImageURL               *string
	CoverAlt               string
	CoverDecorative        bool
	IsPremium              bool
	Visibility             string
	CategoryID             *string
	TierID                 *string
	SeoTitle               *string
	SeoDescription         *string
	ReadingTime            int
	AllowPublicAnnotations *bool
	AllowComments          *bool
	AllowDownload          *bool
	ShowOnPersonalProfile  *bool `json:"showOnPersonalProfile,omitempty"`
	Published              bool
	Status                 string
	// ScheduledAt programme la publication : futur + demande de publication →
	// statut SCHEDULED (publié automatiquement par le scheduled publisher).
	ScheduledAt      *time.Time
	Attributions     []ArticleAttributionInput
	SendEmail        *bool
	EmailSubject     *string
	EmailPreviewText *string
}

// UpdateArticleInput est l'entrée de mise à jour.
type UpdateArticleInput struct {
	Title                  string
	Content                string
	ContentFormat          string
	Slug                   string
	ImageURL               *string
	CoverAlt               *string
	CoverDecorative        *bool
	IsPremium              bool
	CategoryID             *string
	SeoTitle               *string
	SeoDescription         *string
	ReadingTime            int
	AllowPublicAnnotations *bool
	AllowComments          *bool
	AllowDownload          *bool
	ShowOnPersonalProfile  *bool `json:"showOnPersonalProfile,omitempty"`
	Published              bool
	Status                 string
	ActivePublisherID      string
	// ScheduledAt programme la publication ; nil = conserver l'existant.
	ScheduledAt      *time.Time
	Attributions     []ArticleAttributionInput
	SendEmail        *bool
	EmailSubject     *string
	EmailPreviewText *string
}

// TransferArticleInput est l'entrée de transfert d'article entre publications.
type TransferArticleInput struct {
	TargetPublisherID     string  `json:"targetPublisherId"`
	TargetCategoryID      *string `json:"targetCategoryId,omitempty"`
	ShowOnPersonalProfile *bool   `json:"showOnPersonalProfile,omitempty"`
}

type Service struct {
	pool        *pgxpool.Pool
	q           *db.Queries
	rc          *redis.Client
	ac          *asynq.Client
	emailSender EmailSender
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

// memberContext résout l'accès d'un utilisateur à une publication :
// "owner" (personnel) ou membre Média (avec permissions complètes).
type memberContext struct {
	role    string
	isMedia bool
	member  *permissions.MediaMember
}

// resolveMember retourne le contexte d'accès de l'utilisateur sur la publication.
func (s *Service) resolveMember(ctx context.Context, userID, publisherID string) (memberContext, error) {
	if p, ok := middleware.GetPrincipal(ctx); ok && p.Type == middleware.PrincipalTypePublisher {
		if p.PublisherID != nil && *p.PublisherID == publisherID {
			return memberContext{
				role:    "owner",
				isMedia: true,
				member:  &permissions.MediaMember{Role: "owner", Status: "active"},
			}, nil
		}
	}
	if personal, err := s.q.GetUserPersonalPublisher(ctx, userID); err == nil && personal.String == publisherID {
		return memberContext{role: "owner", isMedia: false}, nil
	}
	row, err := s.q.GetMediaMemberContext(ctx, db.GetMediaMemberContextParams{
		PublisherId: publisherID, UserId: toUUID(userID),
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

// GetBySlugAny lit le premier article publié par slug seul (sans publisherId)
// et applique la troncature paywall. Aucun entitlement n'est disponible dans ce
// mode (pas de publication de référence, donc pas d'abonnement résolvable) : il
// est PUBLIC par nature (page autonome /article/[slug] du reader core, unfurl
// OpenGraph, thread de citation). Le contenu premium au-delà du marqueur n'est
// donc JAMAIS transmis au client — le rendu affiche le CTA d'abonnement quand
// `accessGranted` est faux (zéro-fuite, même contrat que tenants/mobile).
// canViewPublication applique la visibilité du profil propriétaire et le
// blocage symétrique à la lecture d'un article. Un article d'un compte privé
// ou bloqué est indistinguable d'un article inexistant (pas de fuite).
func (s *Service) canViewPublisher(ctx context.Context, publisherID, viewerID string) (bool, error) {
	var ownerID string
	err := s.pool.QueryRow(ctx, `
		SELECT COALESCE(u.id::text, '')
		FROM "Publisher" p
		LEFT JOIN "User" u ON u."publisherId" = p.id
		WHERE p.id = $1
		LIMIT 1`, publisherID).Scan(&ownerID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	if ownerID == "" {
		return true, nil
	}

	var allowed bool
	if err := s.pool.QueryRow(ctx, `
		SELECT can_view_profile($1::uuid, $2::uuid)
	`, toUUID(viewerID), toUUID(ownerID)).Scan(&allowed); err != nil {
		return false, err
	}
	return allowed, nil
}

func (s *Service) GetBySlugAny(ctx context.Context, slug string, viewerID string) (ArticleResponse, error) {
	row, err := s.q.GetArticleBySlugAny(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ArticleResponse{}, errNotFound
		}
		return ArticleResponse{}, err
	}
	allowed, err := s.canViewPublisher(ctx, row.PublisherId, viewerID)
	if err != nil {
		return ArticleResponse{}, err
	}
	if !allowed {
		return ArticleResponse{}, errNotFound
	}
	// 🔒 Troncature serveur systématique des articles verrouillés : le passage
	// réservé ne doit jamais franchir la frontière HTTP sans entitlement.
	cut := SliceContentAtPaywall(row.Content, UserEntitlements{}, string(row.Visibility), textPtr(row.TierId))

	// GetArticleBySlugAnyRow a le même shape que GetArticleBySlugRow mais c'est
	// un type distinct → conversion explicite vers le mapping existant.
	pubType := identity.FromPublisherType(string(row.PublisherType))
	authorLogo := textPtr(row.AuthorLogo)
	resp := ArticleResponse{
		ID: row.ID, Title: row.Title, Slug: row.Slug, ShortCode: textPtr(row.ArticleShortCode), Content: cut.Content,
		Published: row.Published, IsPremium: row.IsPremium, Visibility: string(row.Visibility),
		ReadingTime: int(row.ReadingTime), Status: row.Status, PublisherID: row.PublisherId,
		AllowPublicAnnotations: row.AllowPublicAnnotations, AllowComments: row.AllowComments,
		ShowOnPersonalProfile: row.ShowOnPersonalProfile,
		OriginArticleID:       textPtr(row.OriginArticleId),
		CanonicalType:         row.CanonicalType,
		IsAuthorSovereignCopy: row.IsAuthorSovereignCopy,
		IsClaimed:             row.IsClaimed,
		CanonicalURL:          textPtr(row.CanonicalUrl),
		AuthorID:              row.AuthorID, CategoryID: textPtr(row.CategoryId), TierID: textPtr(row.TierId),
		SeoTitle: textPtr(row.SeoTitle), SeoDescription: textPtr(row.SeoDescription),
		CreatedAt:   row.CreatedAt.Time.Format(time.RFC3339),
		UpdatedAt:   row.UpdatedAt.Time.Format(time.RFC3339),
		IsTruncated: cut.IsTruncated, AccessGranted: cut.AccessGranted, PaywallMeta: cut.PaywallMeta,
		Author:       AuthorInfo{ID: row.AuthorID, Name: textPtr(row.AuthorName), Username: textPtr(row.AuthorUsername), LogoURL: authorLogo, Type: pubType},
		Publisher:    &PublisherInfo{ID: row.PublisherId, Name: row.PublisherName, Slug: row.PublisherSlug, Subdomain: textPtr(row.PublisherSubdomain), LogoURL: textPtr(row.PublisherLogo), CustomDomain: textPtr(row.PublisherCustomDomain), Type: pubType},
		CoAuthors:    []AuthorInfo{},
		Attributions: []AttributionInfo{},
	}
	// Enrichissement lecture publique (comme la réponse éditeur) : image de
	// couverture, catégorie, certification et attributions — sinon le drawer
	// lecteur affiche un article sans image ni signature.
	resp.ImageUrl = textPtr(row.ArticleImage)
	resp.CoverAlt = row.ArticleCoverAlt
	resp.CoverDecorative = row.ArticleCoverDecorative
	if row.CategoryID.Valid {
		resp.Category = &CategoryInfo{ID: row.CategoryID.String, Name: row.CategoryName.String, Slug: row.CategorySlug.String, ParentSlug: textPtr(row.CategoryParentSlug)}
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
	if row.OriginArticleId.Valid && row.OriginArticleId.String != "" {
		resp.OriginPublisher = s.fetchOriginPublisher(ctx, row.OriginArticleId.String)
	}
	return resp, nil
}

// GetBySlug lit un article publié et applique la troncature paywall.
func (s *Service) GetBySlug(ctx context.Context, slug, publisherID string, viewerID string, viewerEmail string) (ArticleResponse, error) {
	row, err := s.q.GetArticleBySlug(ctx, db.GetArticleBySlugParams{Slug: slug, PublisherId: publisherID})
	if err != nil {
		// pgx.ErrNoRows → 404 propre (sinon le handler renvoie 500).
		if errors.Is(err, pgx.ErrNoRows) {
			return ArticleResponse{}, errNotFound
		}
		return ArticleResponse{}, err
	}

	allowed, err := s.canViewPublisher(ctx, publisherID, viewerID)
	if err != nil {
		return ArticleResponse{}, err
	}
	if !allowed {
		return ArticleResponse{}, errNotFound
	}

	// Entitlements du lecteur (abonné de la publication).
	ent := UserEntitlements{}
	if viewerID != "" || viewerEmail != "" {
		sub, err := s.q.GetSubscriberEntitlement(ctx, db.GetSubscriberEntitlementParams{
			PublisherId: publisherID, UserId: toUUID(viewerID), Email: viewerEmail,
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

	resp := articleFromSlugRow(row, cut)
	if row.OriginArticleId.Valid && row.OriginArticleId.String != "" {
		resp.OriginPublisher = s.fetchOriginPublisher(ctx, row.OriginArticleId.String)
	}
	return resp, nil
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
		// Aucun repli sur l'owner du média : cela signait l'article par un
		// humain qui n'avait pas agi. Une clé API média doit nommer son
		// auteur (CreatedByUserID) — sinon on refuse explicitement.
		return "", errors.New("création impossible : la clé API utilisée ne désigne aucun auteur (CreatedByUserID manquant)")
	}
	mc, err := s.resolveMember(ctx, userID, in.PublisherID)
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

	shortCode := slug.ExtractTrailingShortCode(in.Slug)
	if shortCode != "" {
		var exists bool
		if err := s.pool.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM "Article" WHERE "shortCode" = $1)`, shortCode,
		).Scan(&exists); err != nil || exists {
			shortCode = s.uniqueShortCode(ctx)
		}
	} else {
		shortCode = s.uniqueShortCode(ctx)
	}

	baseSlug := strings.TrimSpace(in.Slug)
	if baseSlug == "" {
		baseSlug = slug.Slugify(in.Title)
		if baseSlug == "" {
			baseSlug = "article"
		}
	}
	if slug.ExtractTrailingShortCode(baseSlug) == "" {
		baseSlug = baseSlug + "-" + shortCode
	}
	finalSlug := s.uniqueSlug(ctx, in.PublisherID, "", baseSlug)
	categoryID, err := s.resolveCategoryID(ctx, in.PublisherID, in.CategoryID)
	if err != nil {
		return "", err
	}

	// Droit de téléchargement initial = défaut de la publication (opt-out :
	// true par défaut — comportement actuel préservé, l'auteur restreint
	// ensuite par article s'il le veut).
	allowDownload := true
	_ = s.pool.QueryRow(ctx,
		`SELECT COALESCE("allowDownloadDefault", true) FROM "Publisher" WHERE id = $1`,
		in.PublisherID).Scan(&allowDownload)
	if in.AllowDownload != nil {
		allowDownload = *in.AllowDownload
	}
	allowAnnotations := true
	if in.AllowPublicAnnotations != nil {
		allowAnnotations = *in.AllowPublicAnnotations
	}
	allowComments := true
	if in.AllowComments != nil {
		allowComments = *in.AllowComments
	}
	showOnPersonalProfile := true
	if in.ShowOnPersonalProfile != nil {
		showOnPersonalProfile = *in.ShowOnPersonalProfile
	}

	id, err := s.q.CreateArticle(ctx, db.CreateArticleParams{
		Title:                  in.Title,
		Slug:                   finalSlug,
		Content:                NormalizeContent(in.Content, in.ContentFormat),
		Published:              published,
		IsPremium:              in.IsPremium,
		Visibility:             db.ContentVisibility(in.Visibility),
		ReadingTime:            int32(in.ReadingTime),
		AllowPublicAnnotations: allowAnnotations,
		AllowComments:          allowComments,
		AllowDownload:          allowDownload,
		Status:                 status,
		PublisherId:            in.PublisherID,
		AuthorId:               toUUID(userID),
		CategoryId:             textVal(categoryID),
		TierId:                 textVal(in.TierID),
		SeoTitle:               textVal(in.SeoTitle),
		SeoDescription:         textVal(in.SeoDescription),
		ScheduledAt:            timestampPtr(in.ScheduledAt),
		ImageUrl:               imageVal(in.ImageURL),
		CoverAlt:               strings.TrimSpace(in.CoverAlt),
		CoverDecorative:        in.CoverDecorative,
		ShowOnPersonalProfile:  showOnPersonalProfile,
	})
	if err != nil {
		return "", err
	}
	if err := s.assignShortCode(ctx, id, shortCode, shortCode); err != nil {
		return "", err
	}
	_ = s.captureSnapshot(ctx, id, &userID, in.Title, NormalizeContent(in.Content, in.ContentFormat), "INITIAL")
	if published {
		_ = s.captureSnapshot(ctx, id, &userID, in.Title, NormalizeContent(in.Content, in.ContentFormat), "PUBLISHED")
	} else if status == "SUBMITTED" {
		_ = s.captureSnapshot(ctx, id, &userID, in.Title, NormalizeContent(in.Content, in.ContentFormat), "SUBMITTED")
	}
	s.syncAttributions(ctx, id, userID, in.Attributions, showOnPersonalProfile)
	s.queueSearchSync(id, "upsert")
	s.auditMedia(ctx, in.PublisherID, userID, "media.article_created", map[string]any{
		"articleId": id, "title": in.Title,
	})

	// Premier jalon de la chronologie de l'article.
	s.recordEvent(ctx, EventInput{
		ArticleID: id, PublisherID: in.PublisherID, ActorID: userID,
		Type: EventCreated, ToStatus: statusOrDraft(status),
	})

	switch {
	case status == "SUBMITTED":
		s.notifyReviewers(ctx, in.PublisherID, id, userID)
	case published:
		if row, err := s.q.GetArticleByID(ctx, id); err == nil {
			sendEmail := true
			if in.SendEmail != nil {
				sendEmail = *in.SendEmail
			}
			emailSubject := stringPtrVal(in.EmailSubject)
			emailPreviewText := stringPtrVal(in.EmailPreviewText)
			s.emitPublished(ctx, row, sendEmail, emailSubject, emailPreviewText)
			s.recordEvent(ctx, EventInput{
				ArticleID: id, PublisherID: in.PublisherID, ActorID: userID,
				Type: EventPublished, FromStatus: "DRAFT", ToStatus: statusOrDraft(status),
			})
		}
	}
	return id, nil
}

// ListHealth complète la liste créateur avec les champs nécessaires au
// diagnostic éditorial (corps, couverture, SEO). La liste standard reste
// volontairement légère : elle ne doit pas transporter 100 corps d'articles
// vers le dashboard.
func (s *Service) ListHealth(ctx context.Context, userID, publisherID, workspaceType string) ([]ArticleResponse, error) {
	out, err := s.List(ctx, userID, publisherID, workspaceType, 100, 0, "all")
	if err != nil {
		return nil, err
	}
	if s.pool == nil || len(out) == 0 {
		return out, nil
	}

	ids := make([]string, len(out))
	for i := range out {
		ids[i] = out[i].ID
	}
	rows, err := s.pool.Query(ctx,
		`SELECT id, content, "imageUrl", "seoTitle", "seoDescription", "coverAlt", "coverDecorative"
		 FROM "Article" WHERE id = ANY($1::text[])`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type healthFields struct {
		content         string
		imageURL        pgtype.Text
		seoTitle        pgtype.Text
		seoDescription  pgtype.Text
		coverAlt        string
		coverDecorative bool
	}
	byID := make(map[string]healthFields, len(out))
	for rows.Next() {
		var id string
		var f healthFields
		if err := rows.Scan(&id, &f.content, &f.imageURL, &f.seoTitle, &f.seoDescription, &f.coverAlt, &f.coverDecorative); err != nil {
			return nil, err
		}
		byID[id] = f
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	for i := range out {
		if f, ok := byID[out[i].ID]; ok {
			out[i].Content = f.content
			out[i].ImageUrl = textPtr(f.imageURL)
			out[i].SeoTitle = textPtr(f.seoTitle)
			out[i].SeoDescription = textPtr(f.seoDescription)
			out[i].CoverAlt = f.coverAlt
			out[i].CoverDecorative = f.coverDecorative
		}
	}
	return out, nil
}

// List liste les articles d'une publication (RBAC créateur requis, avec catégorie).
// period: "7d" | "30d" | "90d" | "all" (défaut 30d) — filtre ReadingSession pour Vues.
func (s *Service) List(ctx context.Context, userID, publisherID, workspaceType string, limit, offset int, period string) ([]ArticleResponse, error) {
	if _, err := s.resolveMember(ctx, userID, publisherID); err != nil {
		return nil, err
	}
	rows, err := s.q.ListArticlesWithCategory(ctx, db.ListArticlesWithCategoryParams{
		PublisherId: publisherID, Limit: int32(limit), Offset: int32(offset),
		// PERSONAL : la liste inclut les articles co-signés (attribution
		// acceptée + visible), sinon un co-auteur ne retrouve pas l'article
		// qu'il édite. MEDIA : tout le média est déjà couvert par publisherId.
		Column4: workspaceType == "PERSONAL",
		Column5: toUUID(userID),
	})
	if err != nil {
		return nil, err
	}
	out := make([]ArticleResponse, 0, len(rows))
	for _, r := range rows {
		pubType := identity.FromPublisherType(string(r.PublisherType))
		item := ArticleResponse{
			ID: r.ID, Title: r.Title, Slug: r.Slug, Published: r.Published,
			HasUnpublishedChanges: r.HasUnpublishedChanges.Valid && r.HasUnpublishedChanges.Bool,
			IsPremium:             r.IsPremium, Visibility: string(r.Visibility), ReadingTime: int(r.ReadingTime),
			Status: r.Status, PublisherID: r.PublisherId, AuthorID: uuidString(r.AuthorId),
			AllowPublicAnnotations: r.AllowPublicAnnotations,
			AllowComments:          r.AllowComments,
			AllowDownload:          r.AllowDownload,
			ShowOnPersonalProfile:  r.ShowOnPersonalProfile,
			OriginArticleID:        textPtr(r.OriginArticleId),
			CanonicalType:          r.CanonicalType,
			IsAuthorSovereignCopy:  r.IsAuthorSovereignCopy,
			IsClaimed:              r.IsClaimed,
			CanonicalURL:           textPtr(r.CanonicalUrl),
			CanEdit:                true,
			CategoryID:             textPtr(r.CategoryId),
			EmailStatus:            strPtr(r.EmailStatus),
			EmailSentAt:            tsPtr(r.EmailSentAt),
			EmailSentCount:         int(r.EmailSentCount),
			CreatedAt:              r.CreatedAt.Time.Format(time.RFC3339),
			UpdatedAt:              r.UpdatedAt.Time.Format(time.RFC3339),
			AccessGranted:          true,
			Publisher: &PublisherInfo{
				ID:      r.PublisherId,
				Name:    r.PublisherName,
				Slug:    r.PublisherSlug,
				LogoURL: textPtr(r.PublisherLogo),
				Type:    pubType,
			},
			CoAuthors:    []AuthorInfo{},
			Attributions: []AttributionInfo{},
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
		// Agrégats : une panne remonte (jamais des compteurs à 0 qui feraient
		// croire à un article sans lecteur).
		views, uniques, err := s.fetchViewsBatch(ctx, ids, cutoff)
		if err != nil {
			return nil, err
		}
		comments, err := s.fetchCommentsBatch(ctx, ids)
		if err != nil {
			return nil, err
		}
		likes, err := s.fetchLikesBatch(ctx, ids)
		if err != nil {
			return nil, err
		}
		reposts, err := s.fetchRepostsBatch(ctx, ids)
		if err != nil {
			return nil, err
		}
		scheduled := s.fetchScheduledBatch(ctx, ids)
		memberCache := make(map[string]memberContext)
		memberErrCache := make(map[string]bool)
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
			if l, ok := likes[out[i].ID]; ok {
				out[i].LikesCount = l
			}
			if r, ok := reposts[out[i].ID]; ok {
				out[i].RepostsCount = r
			}
			// La liste du studio affiche la date de programmation : sans elle,
			// un article « Programm\u00e9 » ne dit pas quand il partira.
			if at, ok := scheduled[out[i].ID]; ok {
				out[i].ScheduledAt = &at
			}
			if out[i].OriginArticleID != nil && *out[i].OriginArticleID != "" {
				out[i].OriginPublisher = s.fetchOriginPublisher(ctx, *out[i].OriginArticleID)
			}
			if out[i].Publisher != nil && out[i].Publisher.Type == "MEDIA" {
				pid := out[i].PublisherID
				if !memberErrCache[pid] {
					if _, cached := memberCache[pid]; !cached {
						if mc, err := s.resolveMember(ctx, userID, pid); err == nil {
							memberCache[pid] = mc
						} else {
							memberErrCache[pid] = true
						}
					}
				}
				if memberErrCache[pid] {
					out[i].CanEdit = false
				} else if mc, ok := memberCache[pid]; ok {
					out[i].CanEdit = permissions.CanEditMediaArticle(mc.member, out[i].AuthorID, userID)
				}
				if copyRow, err := s.q.GetSovereignCopyByOriginAndAuthor(ctx, db.GetSovereignCopyByOriginAndAuthorParams{
					OriginArticleId: pgtype.Text{String: out[i].ID, Valid: true},
					AuthorId:        toUUID(userID),
				}); err == nil && copyRow.ID != "" {
					copyID := copyRow.ID
					out[i].SovereignCopyID = &copyID
				}
			}
		}
	}
	return out, nil
}

// BulkUpdateInput modifie plusieurs articles en une passe. Tous les champs
// sont optionnels : seuls ceux fournis sont appliqués (jamais le contenu).
type BulkUpdateInput struct {
	IDs                    []string
	IsPremium              *bool
	SetCategory            bool
	CategoryID             *string
	AllowPublicAnnotations *bool
	AllowComments          *bool
	AllowDownload          *bool
	ShowOnPersonalProfile  *bool
	Published              *bool
}

// BulkUpdateResult remonte les succès et les ids en échec (RBAC, catégorie…).
type BulkUpdateResult struct {
	Updated int      `json:"updated"`
	Failed  []string `json:"failed"`
}

// BulkUpdate applique des réglages à plusieurs articles sans toucher au
// contenu. Chaque article repasse par authorizeEdit (jamais de bypass RBAC) ;
// une erreur sur un article n'annule pas les autres, le client reçoit la liste
// des échecs pour rester honnête.
func (s *Service) BulkUpdate(ctx context.Context, userID string, in BulkUpdateInput) (BulkUpdateResult, error) {
	in.IDs = uniqueNonEmpty(in.IDs)
	if len(in.IDs) == 0 {
		return BulkUpdateResult{}, errors.New("aucun article sélectionné")
	}
	if len(in.IDs) > 100 {
		return BulkUpdateResult{}, errors.New("100 articles maximum par modification groupée")
	}
	hasSettings := in.IsPremium != nil || in.SetCategory || in.AllowPublicAnnotations != nil ||
		in.AllowComments != nil || in.AllowDownload != nil || in.ShowOnPersonalProfile != nil
	if !hasSettings && in.Published == nil {
		return BulkUpdateResult{}, errors.New("aucun réglage à appliquer")
	}

	result := BulkUpdateResult{Failed: []string{}}
	for _, id := range in.IDs {
		if err := s.bulkUpdateOne(ctx, id, userID, in, hasSettings); err != nil {
			result.Failed = append(result.Failed, id)
			continue
		}
		result.Updated++
	}
	return result, nil
}

func (s *Service) bulkUpdateOne(ctx context.Context, articleID, userID string, in BulkUpdateInput, hasSettings bool) error {
	row, _, err := s.authorizeEdit(ctx, articleID, userID, "")
	if err != nil {
		return err
	}
	// Le cross-post Média → Personnel décide de la présence de l'article sur le
	// blog personnel de l'auteur : un owner/editor média ne peut pas en décider
	// à sa place, même s'il peut éditer l'article.
	if in.ShowOnPersonalProfile != nil && uuidString(row.AuthorId) != userID {
		return errForbidden
	}
	if hasSettings {
		var categoryID *string
		setArticleCategory := in.SetCategory
		if in.SetCategory {
			resolvedCatID, isPersonal, err := s.resolveCategoryForAuthor(ctx, row.PublisherId, userID, in.CategoryID)
			if err != nil {
				return err
			}
			if isPersonal {
				setArticleCategory = false
				if s.pool != nil {
					_, err = s.pool.Exec(ctx, `
						INSERT INTO "ArticleAttribution" (id, "articleId", "userId", role, "order", "isVisible", "consentStatus", "consentUpdatedAt", "updatedAt", "categoryId")
						VALUES (gen_random_uuid()::text, $1, $2, 'PRIMARY_AUTHOR', 0, true, 'ACCEPTED', now(), now(), $3)
						ON CONFLICT ("articleId", "userId") DO UPDATE SET
						  "categoryId" = $3, "updatedAt" = now()
					`, articleID, toUUID(userID), textVal(resolvedCatID))
					if err != nil {
						return err
					}
				}
			} else {
				categoryID = resolvedCatID
				if s.pool != nil {
					_, _ = s.pool.Exec(ctx, `
						UPDATE "ArticleAttribution" SET "categoryId" = NULL, "updatedAt" = now()
						WHERE "articleId" = $1 AND "userId" = $2
					`, articleID, toUUID(userID))
				}
			}
		}
		if _, err := s.q.UpdateArticleSettings(ctx, db.UpdateArticleSettingsParams{
			IsPremium:              boolVal(in.IsPremium),
			SetCategory:            setArticleCategory,
			CategoryID:             textVal(categoryID),
			AllowPublicAnnotations: boolVal(in.AllowPublicAnnotations),
			AllowComments:          boolVal(in.AllowComments),
			AllowDownload:          boolVal(in.AllowDownload),
			ShowOnPersonalProfile:  boolVal(in.ShowOnPersonalProfile),
			ID:                     articleID,
		}); err != nil {
			return err
		}
		if in.ShowOnPersonalProfile != nil {
			s.syncAttributions(ctx, articleID, uuidString(row.AuthorId), nil, *in.ShowOnPersonalProfile)
		}
		s.queueSearchSync(articleID, "upsert")

		// Modification groupée : le journal média garde la trace de chaque
		// article touché, avec les réglages concernés.
		bulkFields := make([]string, 0, 4)
		if in.IsPremium != nil {
			bulkFields = append(bulkFields, "paywall")
		}
		if in.SetCategory {
			bulkFields = append(bulkFields, "category")
		}
		if in.AllowPublicAnnotations != nil || in.AllowComments != nil || in.AllowDownload != nil {
			bulkFields = append(bulkFields, "options")
		}
		if in.ShowOnPersonalProfile != nil {
			bulkFields = append(bulkFields, "profile")
		}
		if len(bulkFields) > 0 {
			s.auditMedia(ctx, row.PublisherId, userID, "media.article_updated", map[string]any{
				"articleId": articleID, "title": row.Title, "fields": bulkFields, "bulk": true,
			})
		}
	}
	if in.Published != nil {
		if *in.Published {
			return s.SetStatus(ctx, articleID, userID, "PUBLISHED", true, nil)
		}
		return s.Unpublish(ctx, articleID, userID)
	}
	return nil
}

// authorizeEdit applique la garde d'édition (auteur direct, principal média,
// co-auteur, permissions) — UNE implémentation pour Update ET les toggles
// (download…) : jamais deux gardes qui divergent en silence. activePublisherID
// = in.ActivePublisherID côté Update (vide côté toggles : l'appartenance
// média suffit alors, comme avant pour l'auteur direct).
func (s *Service) authorizeEdit(ctx context.Context, articleID, userID, activePublisherID string) (row db.GetArticleByIDRow, mc memberContext, err error) {
	row, err = s.q.GetArticleByID(ctx, articleID)
	if err != nil {
		return row, mc, errNotFound
	}

	// Gate 1 : auteur direct OU clé API média OU publication active du workspace OU co-auteur avec attribution.
	isMediaPrincipal := false
	if p, ok := middleware.GetPrincipal(ctx); ok && p.Type == middleware.PrincipalTypePublisher && p.PublisherID != nil && *p.PublisherID == row.PublisherId {
		isMediaPrincipal = true
	}
	isAuthor := uuidString(row.AuthorId) == userID || isMediaPrincipal
	if !isAuthor && row.PublisherId != activePublisherID {
		var isCoAuthor bool
		_ = s.pool.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1 FROM "ArticleAttribution" aa
				WHERE aa."articleId" = $1 AND aa."userId" = $2 AND aa."consentStatus" IN ('PENDING', 'ACCEPTED')
			)
		`, articleID, toUUID(userID)).Scan(&isCoAuthor)
		if !isCoAuthor {
			return row, mc, errForbidden
		}
	}

	mc, err = s.resolveMember(ctx, userID, row.PublisherId)
	if err != nil {
		if row.PublisherType == db.PublisherTypeMEDIA {
			// Un auteur exclu ou ayant quitté le média ne peut plus altérer l'archive du média.
			// Seuls les co-auteurs externes invités (role <> PRIMARY_AUTHOR) sans appartenance média restent autorisés.
			var isExternalCoAuthor bool
			_ = s.pool.QueryRow(ctx, `
				SELECT EXISTS (
					SELECT 1 FROM "ArticleAttribution" aa
					WHERE aa."articleId" = $1 AND aa."userId" = $2
					  AND aa."consentStatus" IN ('PENDING', 'ACCEPTED')
					  AND aa.role <> 'PRIMARY_AUTHOR'
				)
			`, articleID, toUUID(userID)).Scan(&isExternalCoAuthor)
			if !isExternalCoAuthor {
				return row, mc, errForbidden
			}
		} else if !isAuthor {
			return row, mc, err
		}
	}

	if mc.isMedia {
		if !isMediaPrincipal && !permissions.CanEditMediaArticle(mc.member, uuidString(row.AuthorId), userID) {
			return row, mc, errForbidden
		}
	}
	return row, mc, nil
}

func (s *Service) Update(ctx context.Context, articleID, userID string, in UpdateArticleInput) error {
	if !IsValidContentFormat(in.ContentFormat) {
		return errInvalidContentFormat
	}
	row, mc, err := s.authorizeEdit(ctx, articleID, userID, in.ActivePublisherID)
	if err != nil {
		return err
	}

	// Co-auteur non-membre d'une publication média : il peut éditer et
	// sauvegarder un brouillon, jamais publier, programmer ou soumettre.
	if !mc.isMedia {
		if pub, err := s.q.GetPublisherTypeByID(ctx, row.PublisherId); err == nil &&
			pub.Type == "MEDIA" &&
			(in.Published || in.Status == "SCHEDULED" || in.Status == "SUBMITTED") {
			return errForbidden
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
		switch {
		case effectiveStatus == "SUBMITTED":
			if row.Published {
				effectivePublished = true
			} else {
				effectivePublished = false
			}
		case row.Published:
			// Un rédacteur éditant un article déjà publié ne peut pas changer son état sans permission.
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
		// in.Status == "SCHEDULED" est indispensable : le workflow média a pu
		// réécrire effectiveStatus en DRAFT avant ce bloc, ce qui faisait
		// perdre la programmation à chaque auto-save.
		if in.ScheduledAt.After(time.Now()) &&
			(effectivePublished || effectiveStatus == "PUBLISHED" || in.Status == "SCHEDULED") {
			if mc.isMedia && !mc.can(permissions.PermPublishAny) {
				return errors.New("Vous n'avez pas la permission de programmer une publication.")
			}
			effectiveStatus = "SCHEDULED"
			effectivePublished = false
		}
		scheduledAt = pgtype.Timestamp{Time: *in.ScheduledAt, Valid: true}
	}

	finalSlug := s.uniqueSlug(ctx, row.PublisherId, articleID, in.Slug)
	resolvedCatID, isPersonalCat, err := s.resolveCategoryForAuthor(ctx, row.PublisherId, userID, in.CategoryID)
	if err != nil {
		return err
	}
	categoryID := resolvedCatID
	if isPersonalCat {
		categoryID = textPtr(row.CategoryId)
		if s.pool != nil {
			_, _ = s.pool.Exec(ctx, `
				INSERT INTO "ArticleAttribution" (id, "articleId", "userId", role, "order", "isVisible", "consentStatus", "consentUpdatedAt", "updatedAt", "categoryId")
				VALUES (gen_random_uuid()::text, $1, $2, 'PRIMARY_AUTHOR', 0, true, 'ACCEPTED', now(), now(), $3)
				ON CONFLICT ("articleId", "userId") DO UPDATE SET
				  "categoryId" = $3, "updatedAt" = now()
			`, articleID, toUUID(userID), textVal(resolvedCatID))
		}
	}
	allowAnnotations := row.AllowPublicAnnotations
	if in.AllowPublicAnnotations != nil {
		allowAnnotations = *in.AllowPublicAnnotations
	}
	allowComments := row.AllowComments
	if in.AllowComments != nil {
		allowComments = *in.AllowComments
	}
	allowDownload := row.AllowDownload
	if in.AllowDownload != nil {
		allowDownload = *in.AllowDownload
	}
	showOnPersonalProfile := row.ShowOnPersonalProfile
	if in.ShowOnPersonalProfile != nil {
		showOnPersonalProfile = *in.ShowOnPersonalProfile
	}
	imageURL := in.ImageURL
	if imageURL == nil {
		imageURL = s.fetchArticleImageUrl(ctx, articleID)
	}
	coverAlt := row.CoverAlt
	if in.CoverAlt != nil {
		coverAlt = strings.TrimSpace(*in.CoverAlt)
	}
	coverDecorative := row.CoverDecorative
	if in.CoverDecorative != nil {
		coverDecorative = *in.CoverDecorative
	}
	if coverDecorative {
		coverAlt = ""
	}

	contentToSave := NormalizeContent(in.Content, in.ContentFormat)
	latestSnap, errSnap := s.q.GetLatestArticleSnapshotByArticle(ctx, articleID)
	if errSnap == nil && latestSnap.ActorId.Valid && uuidString(latestSnap.ActorId) != userID {
		baseContent := row.Content
		if row.DraftContent.Valid && row.DraftContent.String != "" {
			baseContent = row.DraftContent.String
		}
		if baseContent != latestSnap.Content || row.Title != latestSnap.Title {
			prevActor := uuidString(latestSnap.ActorId)
			_ = s.captureSnapshot(ctx, articleID, &prevActor, row.Title, baseContent, "AUTHOR_SWITCH")
		}
	}

	// 🛡️ Protection de l'article en ligne :
	// Si l'article est déjà publié et que la requête ne demande PAS la publication directe
	// (ex: auto-save en cours d'édition dans Studio), on ne touche JAMAIS au contenu public en direct.
	// Les modifications sont isolées dans "draftContent".
	// ⚠️ Le critère est `in.Published`, PAS `effectiveStatus` : un auto-save peut
	// conserver status=PUBLISHED tout en demandant published=false ; se fier au
	// statut effectif laissait alors passer les modifications en direct.
	if row.Published && !in.Published {
		normalizedDraft := NormalizeContent(in.Content, in.ContentFormat)
		if _, err := s.q.UpdateArticleDraft(ctx, db.UpdateArticleDraftParams{
			ID:           articleID,
			DraftContent: pgtype.Text{String: normalizedDraft, Valid: true},
		}); err != nil {
			return err
		}

		// Les métadonnées (catégorie, SEO, attribution, image…) doivent tout
		// de même être persistées : sinon un co-auteur qui choisit une
		// catégorie sur un article publié voyait son choix silencieusement
		// perdu. Le CONTENU public reste inchangé (row.Content).
		preservedStatus := effectiveStatus
		if preservedStatus == "" || preservedStatus == "DRAFT" {
			preservedStatus = row.Status
		}
		if preservedStatus == "" {
			preservedStatus = "PUBLISHED"
		}
		// Titre et slug publics sont conservés : leur modification ne
		// s'appliquera qu'à la publication explicite (« Mettre à jour »).
		if _, err := s.q.UpdateArticleFull(ctx, db.UpdateArticleFullParams{
			ID: articleID, Title: row.Title, Content: row.Content, Slug: row.Slug,
			Published: true, Status: preservedStatus,
			IsPremium: in.IsPremium, CategoryId: textVal(categoryID),
			SeoTitle: textVal(in.SeoTitle), SeoDescription: textVal(in.SeoDescription),
			ReadingTime: row.ReadingTime, ScheduledAt: scheduledAt,
			ImageUrl: imageVal(imageURL), CoverAlt: coverAlt, CoverDecorative: coverDecorative,
			AllowPublicAnnotations: allowAnnotations,
			AllowComments:          allowComments, AllowDownload: allowDownload,
			ShowOnPersonalProfile: showOnPersonalProfile,
		}); err != nil {
			return err
		}
		s.syncAttributions(ctx, articleID, uuidString(row.AuthorId), in.Attributions, showOnPersonalProfile)
		s.queueSearchSync(articleID, "upsert")
		if preservedStatus == "SUBMITTED" && row.Status != "SUBMITTED" {
			_ = s.captureSnapshot(ctx, articleID, &userID, in.Title, normalizedDraft, "SUBMITTED")
			s.notifyReviewers(ctx, row.PublisherId, articleID, userID)
			_ = s.q.InsertArticleReviewLog(ctx, db.InsertArticleReviewLogParams{
				ArticleId:   articleID,
				PublisherId: row.PublisherId,
				ReviewerId:  toUUID(userID),
				Action:      "SUBMITTED",
				Comment:     pgtype.Text{String: "", Valid: false},
			})
		}
		return nil
	}

	// Si l'article est publié ET que l'auteur demande explicitement de publier/mettre à jour en ligne :
	// Le nouveau contenu est promu en public, et on purge draftContent.
	if row.Published && in.Published {
		_, _ = s.q.UpdateArticleDraft(ctx, db.UpdateArticleDraftParams{
			ID:           articleID,
			DraftContent: pgtype.Text{Valid: false},
		})
		// Le brouillon vient d'être promu en public : c'est une mise à jour
		// de la version en ligne, pas une nouvelle publication.
		s.recordEvent(ctx, EventInput{
			ArticleID: articleID, PublisherID: row.PublisherId, ActorID: userID,
			Type: EventLiveUpdated, FromStatus: statusOrDraft(row.Status), ToStatus: statusOrDraft(effectiveStatus),
		})
	}

	if _, err := s.q.UpdateArticleFull(ctx, db.UpdateArticleFullParams{
		ID: articleID, Title: in.Title, Content: contentToSave, Slug: finalSlug,
		Published: effectivePublished, Status: effectiveStatus,
		IsPremium: in.IsPremium, CategoryId: textVal(categoryID),
		SeoTitle: textVal(in.SeoTitle), SeoDescription: textVal(in.SeoDescription),
		ReadingTime: int32(in.ReadingTime), ScheduledAt: scheduledAt,
		ImageUrl: imageVal(imageURL), CoverAlt: coverAlt, CoverDecorative: coverDecorative,
		AllowPublicAnnotations: allowAnnotations,
		AllowComments:          allowComments, AllowDownload: allowDownload,
		ShowOnPersonalProfile: showOnPersonalProfile,
	}); err != nil {
		return err
	}
	s.archiveSlugIfPreviouslyPublished(ctx, articleID, row.Slug, finalSlug, row.Published, row.Status)
	s.syncAttributions(ctx, articleID, uuidString(row.AuthorId), in.Attributions, showOnPersonalProfile)
	s.queueSearchSync(articleID, "upsert")

	// Journal média : dire quels champs ont bougé (titre, description SEO,
	// statut…), pas seulement qu'une modification a eu lieu.
	fields := make([]string, 0, 10)
	addField := func(changed bool, key string) {
		if changed {
			fields = append(fields, key)
		}
	}
	contentChanged := strings.TrimSpace(in.Content) != strings.TrimSpace(row.Content) &&
		(!row.DraftContent.Valid || strings.TrimSpace(row.DraftContent.String) != strings.TrimSpace(in.Content))
	addField(row.Title != in.Title, "title")
	addField(row.Slug != finalSlug, "slug")
	addField(contentChanged, "content")
	addField(row.IsPremium != in.IsPremium, "paywall")
	addField(row.Published != effectivePublished || row.Status != effectiveStatus, "status")
	addField(textVal(categoryID) != row.CategoryId, "category")
	addField(textVal(in.SeoTitle) != row.SeoTitle || textVal(in.SeoDescription) != row.SeoDescription, "seo")
	addField(allowComments != row.AllowComments || allowAnnotations != row.AllowPublicAnnotations || allowDownload != row.AllowDownload, "options")
	if len(fields) > 0 {
		s.auditMedia(ctx, row.PublisherId, userID, "media.article_updated", map[string]any{
			"articleId": articleID, "title": in.Title, "fields": fields,
		})
	}
	// Une mise à jour peut aussi changer la visibilité sans passer par les
	// endpoints dédiés : le journal doit le dire explicitement.
	if effectivePublished && !row.Published {
		s.auditMedia(ctx, row.PublisherId, userID, "media.article_published", map[string]any{
			"articleId": articleID, "title": in.Title,
		})
	} else if !effectivePublished && row.Published {
		s.auditMedia(ctx, row.PublisherId, userID, "media.article_unpublished", map[string]any{
			"articleId": articleID, "title": in.Title,
		})
	}

	s.emitArticleLifecycle(queue.TaskArticleUpdated, row, in.Title, in.Slug)

	if row.Published && in.Published && (contentChanged || row.Title != in.Title) {
		_ = s.captureSnapshot(ctx, articleID, &userID, in.Title, contentToSave, "PUBLISHED")
	}

	if effectiveStatus == "SUBMITTED" && row.Status != "SUBMITTED" {
		_ = s.captureSnapshot(ctx, articleID, &userID, in.Title, contentToSave, "SUBMITTED")
		s.notifyReviewers(ctx, row.PublisherId, articleID, userID)
		_ = s.q.InsertArticleReviewLog(ctx, db.InsertArticleReviewLogParams{
			ArticleId:   articleID,
			PublisherId: row.PublisherId,
			ReviewerId:  toUUID(userID),
			Action:      "SUBMITTED",
			Comment:     pgtype.Text{String: "", Valid: false},
		})
		s.recordEvent(ctx, EventInput{
			ArticleID: articleID, PublisherID: row.PublisherId, ActorID: userID,
			Type: EventSubmitted, FromStatus: statusOrDraft(row.Status), ToStatus: "SUBMITTED",
		})
	}

	// Fan-out + événement à la transition draft→publié.
	if effectivePublished && !row.Published {
		_ = s.captureSnapshot(ctx, articleID, &userID, in.Title, contentToSave, "PUBLISHED")
		sendEmail := true
		if in.SendEmail != nil {
			sendEmail = *in.SendEmail
		}
		emailSubject := stringPtrVal(in.EmailSubject)
		emailPreviewText := stringPtrVal(in.EmailPreviewText)
		s.emitPublished(ctx, row, sendEmail, emailSubject, emailPreviewText)
		s.recordEvent(ctx, EventInput{
			ArticleID: articleID, PublisherID: row.PublisherId, ActorID: userID,
			Type: EventPublished, FromStatus: statusOrDraft(row.Status), ToStatus: statusOrDraft(effectiveStatus),
		})
	}
	return nil
}

// Delete supprime un article (RBAC média complet, miroir deleteArticleAction).
func (s *Service) Delete(ctx context.Context, articleID, userID, activePublisherID string) error {
	row, err := s.q.GetArticleByID(ctx, articleID)
	if err != nil {
		return errNotFound
	}

	isMediaPrincipal := false
	if p, ok := middleware.GetPrincipal(ctx); ok && p.Type == middleware.PrincipalTypePublisher && p.PublisherID != nil && *p.PublisherID == row.PublisherId {
		isMediaPrincipal = true
	}

	isAuthor := uuidString(row.AuthorId) == userID || isMediaPrincipal
	if !isAuthor && row.PublisherId != activePublisherID {
		return errForbidden
	}

	mc, err := s.resolveMember(ctx, userID, row.PublisherId)
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
	s.auditMedia(ctx, row.PublisherId, userID, "media.article_deleted", map[string]any{
		"articleId": articleID, "title": row.Title,
	})
	if err := s.q.DeleteArticle(ctx, articleID); err != nil {
		return err
	}
	s.emitArticleLifecycle(queue.TaskArticleDeleted, row, row.Title, row.Slug)
	return nil
}

// uniqueSlug garantit l'unicité du slug dans la publication (fallback shortId).
// resolveCategoryID valide la catégorie demandée (appartenance à la
// publication) ou renvoie la catégorie par défaut « Non classé ».
func (s *Service) resolveCategoryID(ctx context.Context, publisherID string, categoryID *string) (*string, error) {
	catID, _, err := s.resolveCategoryForAuthor(ctx, publisherID, "", categoryID)
	return catID, err
}

// resolveCategoryForAuthor valide la catégorie demandée :
//  1. Soit elle appartient directement à la publication de l'article (ex. Média).
//  2. Soit l'utilisateur est un auteur/co-auteur et la catégorie appartient à son profil personnel
//     (cross-post / attribution) -> isPersonalOverride = true.
//  3. Sinon -> catégorie par défaut de la publication de l'article.
func (s *Service) resolveCategoryForAuthor(ctx context.Context, publisherID, userID string, categoryID *string) (*string, bool, error) {
	if s.q == nil {
		return nil, false, errors.New("base de données non disponible")
	}
	if categoryID != nil && strings.TrimSpace(*categoryID) != "" {
		cat, err := s.q.GetCategoryByID(ctx, *categoryID)
		if err == nil {
			if cat.PublisherId == publisherID {
				id := cat.ID
				return &id, false, nil
			}
			if userID != "" {
				personalPub, pErr := s.q.GetPersonalPublisherForUser(ctx, userID)
				if pErr == nil && cat.PublisherId == personalPub.ID {
					id := cat.ID
					return &id, true, nil
				}
			}
		}
		return nil, false, errors.New("Catégorie introuvable pour cette publication.")
	}
	def, err := s.q.EnsureDefaultCategory(ctx, publisherID)
	if err != nil {
		return nil, false, err
	}
	id := def.ID
	return &id, false, nil
}

// GetByID retourne un article complet pour l'éditeur (RBAC : auteur ou membre).
func (s *Service) GetByID(ctx context.Context, articleID, userID string) (ArticleResponse, error) {
	row, err := s.q.GetArticleByID(ctx, articleID)
	if err != nil {
		return ArticleResponse{}, errNotFound
	}
	if row.AuthorID != userID {
		isMember := false
		if _, err := s.resolveMember(ctx, userID, row.PublisherId); err == nil {
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
	// Calcul précis du droit d'édition (si média, vérifie que l'auteur est toujours membre actif).
	canEdit := row.AuthorID == userID
	if row.PublisherType == db.PublisherTypeMEDIA {
		if mc, err := s.resolveMember(ctx, userID, row.PublisherId); err == nil {
			canEdit = permissions.CanEditMediaArticle(mc.member, row.AuthorID, userID)
		} else {
			canEdit = false
			var isExternalCoAuthor bool
			if s.pool != nil {
				_ = s.pool.QueryRow(ctx, `
					SELECT EXISTS (
						SELECT 1 FROM "ArticleAttribution" aa
						WHERE aa."articleId" = $1 AND aa."userId" = $2
						  AND aa."consentStatus" IN ('PENDING', 'ACCEPTED')
						  AND aa.role <> 'PRIMARY_AUTHOR'
					)
				`, articleID, toUUID(userID)).Scan(&isExternalCoAuthor)
			}
			canEdit = isExternalCoAuthor
		}
	}
	resp.CanEdit = canEdit
	if row.OriginArticleId.Valid && row.OriginArticleId.String != "" {
		resp.OriginPublisher = s.fetchOriginPublisher(ctx, row.OriginArticleId.String)
	}
	if row.PublisherType == db.PublisherTypeMEDIA {
		if copyRow, err := s.q.GetSovereignCopyByOriginAndAuthor(ctx, db.GetSovereignCopyByOriginAndAuthorParams{
			OriginArticleId: pgtype.Text{String: articleID, Valid: true},
			AuthorId:        toUUID(userID),
		}); err == nil {
			resp.SovereignCopyID = &copyRow.ID
		}
	}
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
	// Dernier retour éditorial si présent
	if fb, err := s.q.GetLatestArticleReviewFeedback(ctx, articleID); err == nil {
		resp.ReviewFeedback = &ArticleReviewFeedbackResponse{
			ID:               fb.ID,
			ArticleID:        fb.ArticleId,
			Action:           fb.Action,
			Comment:          textPtr(fb.Comment),
			CreatedAt:        fb.CreatedAt.Time.Format(time.RFC3339),
			ReviewerName:     textPtr(fb.ReviewerName),
			ReviewerUsername: textPtr(fb.ReviewerUsername),
			ReviewerLogo:     textPtr(fb.ReviewerLogo),
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
			PublisherID:    r.PublisherId,
			AuthorID:       uuidString(r.AuthorId),
			AuthorName:     textPtr(r.AuthorName),
			AuthorUsername: textPtr(r.AuthorUsername),
			AuthorLogo:     textPtr(r.AuthorLogo),
			Publisher:      &r.PublisherName,
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
	PublisherID    string  `json:"publisherId"`
	AuthorID       string  `json:"authorId"`
	AuthorName     *string `json:"authorName"`
	AuthorUsername *string `json:"authorUsername"`
	AuthorLogo     *string `json:"authorLogo"`
	Publisher      *string `json:"publisherName"`
	Score          float64 `json:"score"`
}

// EditorCapabilities décrit les capacités d'édition dans le workspace actif.
// articleIDs permet de résoudre les droits d'un co-auteur qui n'est pas
// membre de la publication média : il peut éditer l'article auquel il est
// rattaché, sans pour autant hériter des droits de publication.
func (s *Service) EditorCapabilities(ctx context.Context, userID, publisherID string, articleIDs ...string) (map[string]any, error) {
	pub, err := s.q.GetPublisherTypeByID(ctx, publisherID)
	if err != nil {
		return nil, errNotFound
	}

	if pub.Type != "MEDIA" {
		return map[string]any{
			"isMedia": false, "canPublish": true, "canSubmit": false,
			"canReview": false, "role": nil, "workspaceName": pub.Name,
		}, nil
	}

	if p, ok := middleware.GetPrincipal(ctx); ok && p.Type == middleware.PrincipalTypePublisher {
		if p.PublisherID != nil && *p.PublisherID == publisherID {
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
		PublisherId: publisherID, UserId: toUUID(userID),
	})
	if err != nil {
		if len(articleIDs) > 0 && articleIDs[0] != "" {
			var isCoAuthor bool
			_ = s.pool.QueryRow(ctx, `
				SELECT EXISTS (
					SELECT 1 FROM "ArticleAttribution" aa
					WHERE aa."articleId" = $1 AND aa."userId" = $2
					  AND aa."consentStatus" IN ('PENDING', 'ACCEPTED')
				)
			`, articleIDs[0], toUUID(userID)).Scan(&isCoAuthor)
			if isCoAuthor {
				return map[string]any{
					"isMedia": true, "canPublish": false, "canSubmit": false,
					"canReview": false, "role": "co-author", "workspaceName": pub.Name,
				}, nil
			}
		}
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
	var liveContent *string
	if row.Published {
		live := row.Content
		liveContent = &live
	}
	if row.DraftContent.Valid && row.DraftContent.String != "" {
		draftContent = &row.DraftContent.String
		if row.Published {
			// Pour un article déjà publié, l'éditeur charge le brouillon en cours de travail
			// et expose la version publiée en ligne via liveContent pour la comparaison
			content = row.DraftContent.String
			hasUnpublishedChanges = true
		}
	}

	pubType := identity.FromPublisherType(string(row.PublisherType))
	authorLogo := textPtr(row.AuthorLogo)
	return ArticleResponse{
		ID: row.ID, Title: row.Title, Slug: row.Slug, Content: content,
		DraftContent: draftContent, LiveContent: liveContent, HasUnpublishedChanges: hasUnpublishedChanges,
		Published: row.Published, IsPremium: row.IsPremium, Visibility: string(row.Visibility),
		AllowDownload: row.AllowDownload, AllowPublicAnnotations: row.AllowPublicAnnotations,
		AllowComments:         row.AllowComments,
		ShowOnPersonalProfile: row.ShowOnPersonalProfile,
		OriginArticleID:       textPtr(row.OriginArticleId),
		CanonicalType:         row.CanonicalType,
		IsAuthorSovereignCopy: row.IsAuthorSovereignCopy,
		IsClaimed:             row.IsClaimed,
		CanonicalURL:          textPtr(row.CanonicalUrl),
		CanEdit:               true,
		ReadingTime:           int(row.ReadingTime), Status: row.Status, ScheduledAt: tsPtr(row.ScheduledAt),
		EmailStatus:      strPtr(row.EmailStatus),
		EmailSentAt:      tsPtr(row.EmailSentAt),
		EmailSentCount:   int(row.EmailSentCount),
		EmailResendCount: int(row.EmailResendCount),
		PublisherID:      row.PublisherId,
		AuthorID:         row.AuthorID, CategoryID: textPtr(row.CategoryId), TierID: textPtr(row.TierId),
		SeoTitle: textPtr(row.SeoTitle), SeoDescription: textPtr(row.SeoDescription),
		CoverAlt: row.CoverAlt, CoverDecorative: row.CoverDecorative,
		CreatedAt:     row.CreatedAt.Time.Format(time.RFC3339),
		UpdatedAt:     row.UpdatedAt.Time.Format(time.RFC3339),
		AccessGranted: true,
		Author:        AuthorInfo{ID: row.AuthorID, Name: textPtr(row.AuthorName), Username: textPtr(row.AuthorUsername), LogoURL: authorLogo, Type: pubType},
		Publisher:     &PublisherInfo{ID: row.PublisherId, Name: row.PublisherName, Slug: row.PublisherSlug, Subdomain: textPtr(row.PublisherSubdomain), LogoURL: textPtr(row.PublisherLogo), Type: pubType},
		CoAuthors:     []AuthorInfo{},
		Attributions:  []AttributionInfo{},
	}
}

func articleFromSlugRow(row db.GetArticleBySlugRow, cut PaywallCutResult) ArticleResponse {
	pubType := identity.FromPublisherType(string(row.PublisherType))
	authorLogo := textPtr(row.AuthorLogo)
	resp := ArticleResponse{
		ID: row.ID, Title: row.Title, Slug: row.Slug, ShortCode: textPtr(row.ArticleShortCode), Content: cut.Content,
		Published: row.Published, IsPremium: row.IsPremium, Visibility: string(row.Visibility),
		ReadingTime: int(row.ReadingTime), Status: row.Status, ScheduledAt: tsPtr(row.ScheduledAt),
		AllowPublicAnnotations: row.AllowPublicAnnotations, AllowComments: row.AllowComments,
		ShowOnPersonalProfile: row.ShowOnPersonalProfile,
		OriginArticleID:       textPtr(row.OriginArticleId),
		CanonicalType:         row.CanonicalType,
		IsAuthorSovereignCopy: row.IsAuthorSovereignCopy,
		IsClaimed:             row.IsClaimed,
		CanonicalURL:          textPtr(row.CanonicalUrl),
		PublisherID:           row.PublisherId,
		AuthorID:              row.AuthorID, CategoryID: textPtr(row.CategoryId), TierID: textPtr(row.TierId),
		SeoTitle: textPtr(row.SeoTitle), SeoDescription: textPtr(row.SeoDescription),
		ImageUrl: textPtr(row.ArticleImage), CoverAlt: row.ArticleCoverAlt, CoverDecorative: row.ArticleCoverDecorative,
		CreatedAt:   row.CreatedAt.Time.Format(time.RFC3339),
		UpdatedAt:   row.UpdatedAt.Time.Format(time.RFC3339),
		IsTruncated: cut.IsTruncated, AccessGranted: cut.AccessGranted, PaywallMeta: cut.PaywallMeta,
		Author:       AuthorInfo{ID: row.AuthorID, Name: textPtr(row.AuthorName), Username: textPtr(row.AuthorUsername), LogoURL: authorLogo, Type: pubType},
		Publisher:    &PublisherInfo{ID: row.PublisherId, Name: row.PublisherName, Slug: row.PublisherSlug, Subdomain: textPtr(row.PublisherSubdomain), LogoURL: textPtr(row.PublisherLogo), CustomDomain: textPtr(row.PublisherCustomDomain), Type: pubType},
		CoAuthors:    []AuthorInfo{},
		Attributions: []AttributionInfo{},
	}
	if row.CategoryID.Valid {
		resp.Category = &CategoryInfo{ID: row.CategoryID.String, Name: row.CategoryName.String, Slug: row.CategorySlug.String, ParentSlug: textPtr(row.CategoryParentSlug)}
	}
	return resp
}

func articleFromRow(row db.GetArticleByIDRow, cut PaywallCutResult) ArticleResponse {
	pubType := identity.FromPublisherType(string(row.PublisherType))
	authorLogo := textPtr(row.AuthorLogo)
	resp := ArticleResponse{
		ID: row.ID, Title: row.Title, Slug: row.Slug, ShortCode: textPtr(row.ArticleShortCode), Content: cut.Content,
		Published: row.Published, IsPremium: row.IsPremium, Visibility: string(row.Visibility),
		ReadingTime: int(row.ReadingTime), Status: row.Status, ScheduledAt: tsPtr(row.ScheduledAt),
		AllowDownload: row.AllowDownload, AllowPublicAnnotations: row.AllowPublicAnnotations,
		AllowComments:         row.AllowComments,
		ShowOnPersonalProfile: row.ShowOnPersonalProfile,
		OriginArticleID:       textPtr(row.OriginArticleId),
		CanonicalType:         row.CanonicalType,
		IsAuthorSovereignCopy: row.IsAuthorSovereignCopy,
		IsClaimed:             row.IsClaimed,
		CanonicalURL:          textPtr(row.CanonicalUrl),
		PublisherID:           row.PublisherId,
		AuthorID:              row.AuthorID, CategoryID: textPtr(row.CategoryId), TierID: textPtr(row.TierId),
		SeoTitle: textPtr(row.SeoTitle), SeoDescription: textPtr(row.SeoDescription),
		CoverAlt: row.CoverAlt, CoverDecorative: row.CoverDecorative,
		CreatedAt:   row.CreatedAt.Time.Format(time.RFC3339),
		UpdatedAt:   row.UpdatedAt.Time.Format(time.RFC3339),
		IsTruncated: cut.IsTruncated, AccessGranted: cut.AccessGranted, PaywallMeta: cut.PaywallMeta,
		Author:    AuthorInfo{ID: row.AuthorID, Name: textPtr(row.AuthorName), Username: textPtr(row.AuthorUsername), LogoURL: authorLogo, Type: pubType},
		Publisher: &PublisherInfo{ID: row.PublisherId, Name: row.PublisherName, Slug: row.PublisherSlug, Subdomain: textPtr(row.PublisherSubdomain), Type: pubType},
	}
	// Lecture éditeur : la catégorie (et son parent) sert à composer le lien
	// canonique du tenant, y compris pour les sous-rubriques.
	if row.CategoryId.Valid {
		resp.Category = &CategoryInfo{ID: row.CategoryId.String, Name: row.CategoryName.String, Slug: row.CategorySlug.String, ParentSlug: textPtr(row.CategoryParentSlug)}
	}
	return resp
}

// auditMedia journalise une action éditoriale dans le journal du média
// propriétaire de la publication. Le profil personnel n'a pas de média :
// l'action n'y produit aucune entrée, sans erreur.
func (s *Service) auditMedia(ctx context.Context, publisherID, actorID, action string, metadata map[string]any) {
	if s.pool == nil || publisherID == "" || actorID == "" {
		return
	}
	var mediaID string
	if err := s.pool.QueryRow(ctx, `SELECT id FROM "Media" WHERE "publisherId" = $1 LIMIT 1`, publisherID).Scan(&mediaID); err != nil {
		return
	}
	raw, _ := json.Marshal(metadata)
	_ = s.q.InsertMediaAuditLog(ctx, db.InsertMediaAuditLogParams{
		MediaId: mediaID, ActorId: toUUID(actorID), Action: action, Metadata: string(raw),
	})
}

// TransferPublication déplace un article d'une publication à une autre (Personnel ↔ Média).
func (s *Service) TransferPublisher(ctx context.Context, userID, articleID string, in TransferArticleInput) (ArticleResponse, error) {
	row, err := s.q.GetArticleByID(ctx, articleID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ArticleResponse{}, errNotFound
		}
		return ArticleResponse{}, err
	}

	targetPubID := strings.TrimSpace(in.TargetPublisherID)
	if targetPubID == "" {
		return ArticleResponse{}, errors.New("targetPublisherId requis")
	}
	if targetPubID == "personal" || targetPubID == userID {
		if personal, err := s.q.GetUserPersonalPublisher(ctx, userID); err == nil && personal.Valid && personal.String != "" {
			targetPubID = personal.String
		}
	} else if m, err := s.q.GetMediaWithPublisher(ctx, targetPubID); err == nil && m.PublisherID != "" {
		targetPubID = m.PublisherID
	}

	// Vérifier que l'appelant a le droit sur la source : auteur de l'article, ou
	// membre média autorisé à éditer les articles des autres (owner/editor).
	// Une simple appartenance (writer/viewer) ne suffit pas à déplacer l'article
	// d'un autre auteur.
	isAuthor := row.AuthorID == userID || uuidString(row.AuthorId) == userID
	if !isAuthor {
		srcMC, err := s.resolveMember(ctx, userID, row.PublisherId)
		if err != nil || !srcMC.can(permissions.PermEditAny) {
			return ArticleResponse{}, errForbidden
		}
	}

	// Vérifier la publication cible.
	targetPub, err := s.q.GetPublisherTypeByID(ctx, targetPubID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ArticleResponse{}, errNotFound
		}
		return ArticleResponse{}, err
	}
	// Si la cible est PERSONAL, imposer que le propriétaire de la publication PERSONAL cible soit l'auteur de l'article.
	if targetPub.Type == "PERSONAL" {
		authorPersonal, err := s.q.GetUserPersonalPublisher(ctx, row.AuthorID)
		if err != nil || !authorPersonal.Valid || authorPersonal.String != targetPubID {
			return ArticleResponse{}, errForbidden
		}
	}

	// Vérifier que l'appelant est membre actif de la publication cible avec au moins PermCreateArticles.
	targetMC, err := s.resolveMember(ctx, userID, targetPubID)
	if err != nil || !targetMC.can(permissions.PermCreateArticles) {
		return ArticleResponse{}, errForbidden
	}

	// Souveraineté de l'auteur : si la copie souveraine de cet article vit déjà
	// dans un espace personnel, déplacer l'article média dans ce même espace
	// créerait deux vivants identiques. La copie est le lieu de vie, l'archive
	// reste au média.
	if targetPub.Type == "PERSONAL" && s.pool != nil {
		var copyID string
		err := s.pool.QueryRow(ctx, `
			SELECT id FROM "Article"
			WHERE "originArticleId" = $1 AND "authorId" = $2 AND "isAuthorSovereignCopy" = true
			LIMIT 1
		`, articleID, row.AuthorID).Scan(&copyID)
		switch {
		case err == nil && copyID != "":
			return ArticleResponse{}, errors.New("Cet article possède déjà votre copie souveraine : modifiez cet exemplaire plutôt que de déplacer l'archive du média.")
		case errors.Is(err, pgx.ErrNoRows):
			// Sans copie souveraine, l'article qui entre dans un espace personnel
			// n'est plus une archive de média.
			if _, err := s.pool.Exec(ctx, `
				UPDATE "Article"
				SET "canonicalType" = 'ORIGINAL', "updatedAt" = now()
				WHERE id = $1 AND "canonicalType" = 'MEDIA_ARCHIVE'
			`, articleID); err != nil {
				return ArticleResponse{}, err
			}
		case err != nil:
			return ArticleResponse{}, err
		}
	}

	// Résoudre la catégorie cible (ou assigner la catégorie par défaut « non-classe » si absente ou issue de l'ancienne publication).
	categoryID, err := s.resolveCategoryID(ctx, targetPubID, in.TargetCategoryID)
	if err != nil {
		categoryID, err = s.resolveCategoryID(ctx, targetPubID, nil)
		if err != nil {
			return ArticleResponse{}, err
		}
	}

	// Résoudre le slug unique dans la cible. Si le slug change, archiver l'ancien dans ArticleSlugHistory.
	finalSlug := row.Slug
	if targetPubID != row.PublisherId {
		finalSlug = s.uniqueSlug(ctx, targetPubID, articleID, row.Slug)
		if finalSlug != row.Slug && s.pool != nil {
			_, _ = s.pool.Exec(ctx, `
				INSERT INTO "ArticleSlugHistory" (id, "articleId", slug, "createdAt")
				VALUES (gen_random_uuid()::text, $1, $2, now())
				ON CONFLICT (slug) DO NOTHING
			`, articleID, row.Slug)
		}
	}

	// Résolution du statut : si l'article était PUBLISHED, conserver PUBLISHED si PermPublishAny (ou cible PERSONAL),
	// sinon basculer en revue éditoriale (SUBMITTED, published = false).
	newStatus := row.Status
	newPublished := row.Published
	if row.Published || row.Status == "PUBLISHED" {
		if !targetMC.isMedia || targetMC.can(permissions.PermPublishAny) {
			newPublished = true
			newStatus = "PUBLISHED"
		} else {
			newPublished = false
			newStatus = "SUBMITTED"
		}
	} else if targetMC.isMedia && row.Status == "SCHEDULED" && !targetMC.can(permissions.PermPublishAny) {
		// Une programmation ne doit pas contourner la revue média : sans droit de
		// publication, l'article atterrit en revue et perd sa date de départ.
		newPublished = false
		newStatus = "SUBMITTED"
	} else if !targetMC.isMedia && row.Status == "SUBMITTED" {
		// Le profil personnel n'a pas de revue éditoriale : un brouillon soumis
		// redevient un brouillon classique.
		newStatus = "DRAFT"
	}

	// La date de programmation n'a de sens que tant que l'article reste programmé.
	scheduledAt := row.ScheduledAt
	if newStatus != "SCHEDULED" {
		scheduledAt = pgtype.Timestamp{}
	}

	showOnPersonalProfile := row.ShowOnPersonalProfile
	if in.ShowOnPersonalProfile != nil {
		showOnPersonalProfile = *in.ShowOnPersonalProfile
	}

	if _, err := s.q.TransferArticlePublisher(ctx, db.TransferArticlePublisherParams{
		ID:                    articleID,
		PublisherId:           targetPubID,
		CategoryId:            textVal(categoryID),
		Slug:                  finalSlug,
		Status:                newStatus,
		Published:             newPublished,
		ShowOnPersonalProfile: showOnPersonalProfile,
		ScheduledAt:           scheduledAt,
	}); err != nil {
		return ArticleResponse{}, err
	}

	s.syncAttributions(ctx, articleID, row.AuthorID, nil, showOnPersonalProfile)
	s.queueSearchSync(articleID, "upsert")

	// Le transfert est journalisé dans les deux médias concernés : la source
	// pour savoir ce qui est parti, la cible pour savoir ce qui est arrivé.
	if targetPubID != row.PublisherId {
		meta := map[string]any{
			"articleId": articleID, "title": row.Title,
			"fromPublisherId": row.PublisherId, "toPublisherId": targetPubID,
			"toPublisherName": targetPub.Name,
			"status":          newStatus,
		}
		if srcPub, err := s.q.GetPublisherTypeByID(ctx, row.PublisherId); err == nil {
			meta["fromPublisherName"] = srcPub.Name
		}
		s.auditMedia(ctx, row.PublisherId, userID, "media.article_transferred_out", meta)
		s.auditMedia(ctx, targetPubID, userID, "media.article_transferred_in", meta)
	}

	if newStatus == "SUBMITTED" && row.Status != "SUBMITTED" {
		s.notifyReviewers(ctx, targetPubID, articleID, userID)
		_ = s.q.InsertArticleReviewLog(ctx, db.InsertArticleReviewLogParams{
			ArticleId:   articleID,
			PublisherId: targetPubID,
			ReviewerId:  toUUID(userID),
			Action:      "SUBMITTED",
			Comment:     pgtype.Text{String: "", Valid: false},
		})
	}

	return s.GetByID(ctx, articleID, userID)
}
