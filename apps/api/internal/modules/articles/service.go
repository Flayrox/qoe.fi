// Package articles — service d'articles (CRUD + paywall + workflow média).
package articles

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
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
	"github.com/qoefi/api/internal/subscriptions"
	"github.com/redis/go-redis/v9"
)

var (
	errNotFound             = errors.New("article introuvable")
	errForbidden            = errors.New("permission insuffisante")
	errInvalidContentFormat = errors.New("contentFormat invalide (markdown|html)")
	// errAlreadyPublished protège les articles en ligne : une programmation ne
	// doit jamais retirer un article publié du site en attendant sa date.
	errAlreadyPublished = errors.New("Un article publié ne peut pas être programmé : retirez-le du site (ou partez d'un brouillon) avant de fixer une date.")

	ErrCooldownActive     = errors.New("un email a déjà été envoyé pour cette publication il y a moins de 2 heures")
	ErrArticleAlreadySent = errors.New("cet article a déjà été envoyé par email ou un envoi est déjà en cours")
	ErrArticleNotEligible = errors.New("l'article doit être publié pour être envoyé par email")
)

type ArticleSnapshotItem struct {
	ID            string  `json:"id"`
	ArticleID     string  `json:"articleId"`
	ActorID       *string `json:"actorId,omitempty"`
	ActorName     *string `json:"actorName,omitempty"`
	ActorUsername *string `json:"actorUsername,omitempty"`
	ActorAvatar   *string `json:"actorAvatar,omitempty"`
	Title         string  `json:"title"`
	Content       string  `json:"content"`
	WordCount     int     `json:"wordCount"`
	Reason        string  `json:"reason"`
	CreatedAt     string  `json:"createdAt"`
}

// ArticleResponse est la forme API d'un article (contenu éventuellement tronqué).
type ArticleResponse struct {
	ID                     string                         `json:"id"`
	Title                  string                         `json:"title"`
	Slug                   string                         `json:"slug"`
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

// AttributionInfo est une attribution d'article pour l'éditeur (co-auteur).
type AttributionInfo struct {
	User          AuthorInfo `json:"user"`
	Role          string     `json:"role"`
	Order         int        `json:"order"`
	IsVisible     bool       `json:"isVisible"`
	ConsentStatus string     `json:"consentStatus"`
}

// ArticleReviewFeedbackResponse représente le dernier retour éditorial sur l'article.
type ArticleReviewFeedbackResponse struct {
	ID               string  `json:"id"`
	ArticleID        string  `json:"articleId"`
	Action           string  `json:"action"`
	Comment          *string `json:"comment,omitempty"`
	CreatedAt        string  `json:"createdAt"`
	ReviewerName     *string `json:"reviewerName,omitempty"`
	ReviewerUsername *string `json:"reviewerUsername,omitempty"`
	ReviewerLogo     *string `json:"reviewerLogo,omitempty"`
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

type EmailSender func(ctx context.Context, to, subject, html, unsubURL, fromName string) error

type Service struct {
	pool        *pgxpool.Pool
	q           *db.Queries
	rc          *redis.Client
	ac          *asynq.Client
	emailSender EmailSender
}

func (s *Service) SetEmailSender(sender EmailSender) {
	s.emailSender = sender
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
		ID: row.ID, Title: row.Title, Slug: row.Slug, Content: cut.Content,
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
		var ownerID string
		_ = s.pool.QueryRow(ctx, `
			SELECT mm."userId"::text
			FROM "MediaMember" mm
			JOIN "Media" md ON md.id = mm."mediaId"
			WHERE md."publisherId" = $1 AND mm.role = 'owner' AND mm.status = 'active'
			LIMIT 1`, in.PublisherID).Scan(&ownerID)
		if ownerID != "" {
			userID = ownerID
		}
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
		ShowOnPersonalProfile:  showOnPersonalProfile,
	})
	if err != nil {
		return "", err
	}
	if _, err := s.pool.Exec(ctx,
		`UPDATE "Article" SET "shortCode" = $2 WHERE id = $1 AND "shortCode" IS NULL`,
		id, shortCode); err != nil {
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
		views, uniques := s.fetchViewsBatch(ctx, ids, cutoff)
		comments := s.fetchCommentsBatch(ctx, ids)
		likes := s.fetchLikesBatch(ctx, ids)
		reposts := s.fetchRepostsBatch(ctx, ids)
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

// Update met à jour un article avec RBAC + workflow média (miroir saveArticleAction).
// SetAllowDownload bascule le droit de téléchargement d'un article
// (hors-ligne et file d'écoute vérifient). Même garde qu'Update
// (authorizeEdit) : seul qui peut éditer peut restreindre.
func (s *Service) SetAllowDownload(ctx context.Context, articleID, userID string, allow bool) (bool, error) {
	if _, _, err := s.authorizeEdit(ctx, articleID, userID, ""); err != nil {
		return false, err
	}
	row, err := s.q.SetArticleAllowDownload(ctx, db.SetArticleAllowDownloadParams{
		ID:            articleID,
		AllowDownload: allow,
	})
	if err != nil {
		return false, err
	}
	return row.AllowDownload, nil
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
		if in.SetCategory {
			categoryID, err = s.resolveCategoryID(ctx, row.PublisherId, in.CategoryID)
			if err != nil {
				return err
			}
		}
		if _, err := s.q.UpdateArticleSettings(ctx, db.UpdateArticleSettingsParams{
			IsPremium:              boolVal(in.IsPremium),
			SetCategory:            in.SetCategory,
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

func uniqueNonEmpty(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	out := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	return out
}

// ErrOfflineForbidden : pack ou file refusés. Toujours WRAPPÉE dans une
// sentinelle précise (le handler mappe en 403 + code stable — le front
// branche sur code, jamais sur libellé).
var ErrOfflineForbidden = errors.New("hors-ligne indisponible")

// Causes précises (wrappent ErrOfflineForbidden — errors.Is reste vrai) :
var (
	// ErrOfflinePlusRequired : pas de Plus (ni octroi ni studio).
	ErrOfflinePlusRequired = fmt.Errorf("%w : Plus requis", ErrOfflineForbidden)
	// ErrOfflineNotDownloadable : droit auteur refusé.
	ErrOfflineNotDownloadable = fmt.Errorf("%w : téléchargement refusé par l'auteur", ErrOfflineForbidden)
	// ErrOfflineNotPublished : brouillon (jamais de brouillon hors-ligne).
	ErrOfflineNotPublished = fmt.Errorf("%w : non publié", ErrOfflineForbidden)
)

// OfflinePack est un article prêt à mettre en cache (hors-ligne/TTS) :
// contenu coupé au paywall comme la lecture (jamais de contournement),
// droits constatés. Versionnée (v1) pour les évolutions de format.
type OfflinePack struct {
	Version      string `json:"version"`
	ID           string `json:"id"`
	Title        string `json:"title"`
	Slug         string `json:"slug"`
	Content      string `json:"content"`
	ReadingTime  int    `json:"readingTime"`
	AuthorName   string `json:"authorName"`
	PublisherID  string `json:"publisherId"`
	Publisher    string `json:"publisher"`
	PublishedAt  string `json:"publishedAt"`
	Downloadable bool   `json:"downloadable"`
}

// OfflinePack assemble le pack (auth + Plus + publié + droit auteur +
// paywall). Authentifié requis (userID non vide) — le hors-ligne anonyme
// n'existe pas (pas de cache sans compte à qui le rattacher).
func (s *Service) OfflinePack(ctx context.Context, articleID, userID, viewerEmail string) (OfflinePack, error) {
	if userID == "" {
		return OfflinePack{}, fmt.Errorf("%w : compte requis", ErrOfflineForbidden)
	}
	if !subscriptions.HasPlus(ctx, s.pool, userID, time.Now()) {
		return OfflinePack{}, ErrOfflinePlusRequired
	}
	row, err := s.q.GetArticleOfflinePack(ctx, articleID)
	if err != nil {
		return OfflinePack{}, errNotFound
	}
	if !row.Published {
		return OfflinePack{}, ErrOfflineNotPublished
	}
	if !row.AllowDownload {
		return OfflinePack{}, ErrOfflineNotDownloadable
	}
	// Paywall contenu : mêmes entitlements que la lecture (le hors-ligne ne
	// contourne jamais — un premium non acheté sort coupé, comme à l'écran).
	ent := UserEntitlements{}
	sub, err := s.q.GetSubscriberEntitlement(ctx, db.GetSubscriberEntitlementParams{
		PublisherId: row.PublisherId, UserId: toUUID(userID), Email: viewerEmail,
	})
	if err == nil {
		ent.IsMember = sub.IsActive
		ent.IsPaidSubscriber = sub.IsPremium && sub.IsActive
		if sub.TierId.Valid {
			t := sub.TierId.String
			ent.TierID = &t
		}
	}
	cut := SliceContentAtPaywall(row.Content, ent, string(row.Visibility), textPtr(row.TierId))
	content := cut.Content
	var publishedAt string
	if row.CreatedAt.Valid {
		publishedAt = row.CreatedAt.Time.UTC().Format(time.RFC3339)
	}
	return OfflinePack{
		Version: "v1", ID: row.ID, Title: row.Title, Slug: row.Slug, Content: content,
		ReadingTime: int(row.ReadingTime), AuthorName: row.AuthorName.String,
		PublisherID: row.PublisherId, Publisher: row.PublisherName,
		PublishedAt: publishedAt, Downloadable: true,
	}, nil
}

// ListenItem est une entrée de file d'écoute (métadonnées pour le player).
type ListenItem struct {
	ID        string `json:"id"`
	ArticleID string `json:"articleId"`
	Title     string `json:"title"`
	Position  int    `json:"position"`
	CreatedAt string `json:"createdAt"`
}

// AddListenLater ajoute un article en fin de file (idempotent : deux fois =
// no-op). Vérifie le droit de téléchargement (la file sert le hors-ligne
// et le TTS — jamais de contenu interdit dedans) mais PAS le palier Plus
// (ajouter à sa file est gratuit — c'est le TÉLÉCHARGEMENT qui est Plus).
func (s *Service) AddListenLater(ctx context.Context, userID, articleID string) (string, error) {
	if userID == "" {
		return "", errForbidden
	}
	row, err := s.q.GetArticleOfflinePack(ctx, articleID)
	if err != nil {
		return "", errNotFound
	}
	if !row.Published || !row.AllowDownload {
		return "", ErrOfflineNotDownloadable
	}
	id, err := s.q.AddListenLater(ctx, db.AddListenLaterParams{
		UserID: toUUID(userID), ArticleID: articleID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Conflit (déjà en file) : no-op, retourne l'existant.
			var existing string
			if err2 := s.pool.QueryRow(ctx,
				`SELECT id FROM "ListenLater" WHERE "userId" = $1 AND "articleId" = $2`,
				toUUID(userID), articleID).Scan(&existing); err2 != nil {
				return "", err
			}
			return existing, nil
		}
		return "", err
	}
	return id, nil
}

// ListListenLater renvoie la file ordonnée (avec titres pour le player).
func (s *Service) ListListenLater(ctx context.Context, userID string) ([]ListenItem, error) {
	rows, err := s.q.ListListenLater(ctx, toUUID(userID))
	if err != nil {
		return nil, err
	}
	items := make([]ListenItem, 0, len(rows))
	for _, r := range rows {
		var title string
		var createdAt pgtype.Timestamp
		_ = s.pool.QueryRow(ctx,
			`SELECT title, "createdAt" FROM "Article" WHERE id = $1`, r.ArticleId).Scan(&title, &createdAt)
		at := ""
		if createdAt.Valid {
			at = createdAt.Time.UTC().Format(time.RFC3339)
		}
		items = append(items, ListenItem{
			ID: r.ID, ArticleID: r.ArticleId, Title: title,
			Position: int(r.Position), CreatedAt: at,
		})
	}
	return items, nil
}

// RemoveListenLater retire un article de la file (inexistant = no-op, pas
// d'erreur — idempotent comme l'ajout).
func (s *Service) RemoveListenLater(ctx context.Context, userID, articleID string) error {
	_, err := s.q.RemoveListenLater(ctx, db.RemoveListenLaterParams{
		UserID: toUUID(userID), ArticleID: articleID,
	})
	return err
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
	categoryID, err := s.resolveCategoryID(ctx, row.PublisherId, in.CategoryID)
	if err != nil {
		return err
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
			ImageUrl: imageVal(imageURL), AllowPublicAnnotations: allowAnnotations,
			AllowComments: allowComments, AllowDownload: allowDownload,
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
		ImageUrl: imageVal(imageURL), AllowPublicAnnotations: allowAnnotations,
		AllowComments: allowComments, AllowDownload: allowDownload,
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

// SetStatus met à jour l'état (DRAFT/SUBMITTED/PUBLISHED). scheduledAt nil =
// conserver la date existante ; un temps non nul (futur) → statut SCHEDULED.
func (s *Service) SetStatus(ctx context.Context, articleID, userID, status string, published bool, scheduledAt *time.Time) error {
	row, err := s.q.GetArticleByID(ctx, articleID)
	if err != nil {
		return errNotFound
	}
	mc, err := s.resolveMember(ctx, userID, row.PublisherId)
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
		publishedContent := row.Content
		if row.DraftContent.Valid && row.DraftContent.String != "" {
			publishedContent = row.DraftContent.String
		}
		_ = s.captureSnapshot(ctx, articleID, &userID, row.Title, publishedContent, "PUBLISHED")
	} else if status == "SUBMITTED" && row.Status != "SUBMITTED" {
		submittedContent := row.Content
		if row.DraftContent.Valid && row.DraftContent.String != "" {
			submittedContent = row.DraftContent.String
		}
		_ = s.captureSnapshot(ctx, articleID, &userID, row.Title, submittedContent, "SUBMITTED")
	}
	s.queueSearchSync(articleID, "upsert")
	if published {
		s.emitPublished(ctx, row, true, "", "")
		s.recordEvent(ctx, EventInput{
			ArticleID: articleID, PublisherID: row.PublisherId, ActorID: userID,
			Type: EventPublished, FromStatus: statusOrDraft(row.Status), ToStatus: statusOrDraft(status),
		})
	} else if status == "SCHEDULED" && scheduledAt != nil {
		s.recordEvent(ctx, EventInput{
			ArticleID: articleID, PublisherID: row.PublisherId, ActorID: userID,
			Type: EventScheduled, FromStatus: statusOrDraft(row.Status), ToStatus: "SCHEDULED", ScheduledAt: scheduledAt,
		})
	}
	switch {
	case published && !row.Published:
		s.auditMedia(ctx, row.PublisherId, userID, "media.article_published", map[string]any{
			"articleId": articleID, "title": row.Title,
		})
	case status == "SCHEDULED":
		meta := map[string]any{"articleId": articleID, "title": row.Title}
		if scheduledAt != nil {
			meta["scheduledAt"] = scheduledAt.Format(time.RFC3339)
		}
		s.auditMedia(ctx, row.PublisherId, userID, "media.article_scheduled", meta)
	}
	return nil
}

// Unpublish remet un article en ligne en brouillon privé et efface toute
// programmation. Distinct de Update (qui isole les modifications dans
// draftContent) et de Schedule (qui ne touche pas aux articles publiés).
func (s *Service) Unpublish(ctx context.Context, articleID, userID string) error {
	row, mc, err := s.authorizeEdit(ctx, articleID, userID, "")
	if err != nil {
		return err
	}
	// Dépublier est un acte de publication : un co-auteur sans droit de
	// publication ne doit pas pouvoir retirer un article en ligne. Un
	// co-auteur non-membre d'une publication média n'a pas de memberContext
	// (isMedia=false) : on le rejette explicitement.
	if row.Published {
		if pub, err := s.q.GetPublisherTypeByID(ctx, row.PublisherId); err == nil &&
			pub.Type == "MEDIA" && !mc.isMedia {
			return errForbidden
		}
		if !mc.can(permissions.PermPublishAny) {
			return errForbidden
		}
	}
	if _, err := s.q.SetArticleStatus(ctx, db.SetArticleStatusParams{
		ID: articleID, Status: "DRAFT", Published: false,
		ScheduledAt: pgtype.Timestamp{Valid: false},
	}); err != nil {
		return err
	}
	if row.Published {
		s.queueSearchSync(articleID, "upsert")
		s.recordEvent(ctx, EventInput{
			ArticleID: articleID, PublisherID: row.PublisherId, ActorID: userID,
			Type: EventUnpublished, FromStatus: statusOrDraft(row.Status), ToStatus: "DRAFT",
		})
		s.auditMedia(ctx, row.PublisherId, userID, "media.article_unpublished", map[string]any{
			"articleId": articleID, "title": row.Title,
		})
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
	mc, err := s.resolveMember(ctx, userID, row.PublisherId)
	if err != nil {
		return err
	}
	if scheduledAt == nil {
		// Annulation : uniquement pour un article réellement programmé. Sans
		// cette garde, appeler l'annulation sur un article publié (ou même un
		// brouillon) le forçait à `published = false` : le site perdait
		// silencieusement un article en ligne.
		if row.Status != "SCHEDULED" {
			return nil
		}
		status := "DRAFT"
		if _, err := s.q.SetArticleStatus(ctx, db.SetArticleStatusParams{
			ID: articleID, Status: status, Published: false,
			ScheduledAt: pgtype.Timestamp{Valid: false},
		}); err != nil {
			return err
		}
		s.queueSearchSync(articleID, "upsert")
		s.recordEvent(ctx, EventInput{
			ArticleID: articleID, PublisherID: row.PublisherId, ActorID: userID,
			Type: EventScheduleCancelled, FromStatus: statusOrDraft(row.Status), ToStatus: statusOrDraft(status),
		})
		s.auditMedia(ctx, row.PublisherId, userID, "media.article_schedule_cancelled", map[string]any{
			"articleId": articleID, "title": row.Title,
		})
		return nil
	}
	if !scheduledAt.After(time.Now()) {
		return errors.New("La date de programmation doit être dans le futur.")
	}
	// Programmer un article EN LIGNE le retirerait du site jusqu'à la date
	// choisie (`published = false`), alors que « reporter » ne signifie jamais
	// « dépublier ». Aucune mise à jour programmée n'existe : on refuse, et
	// l'article reste en ligne.
	if row.Published {
		return errAlreadyPublished
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
	// Une date déjà programmée qui change est un report, pas une première
	// programmation : la chronologie doit le dire.
	wasScheduled := row.Status == "SCHEDULED" && row.ScheduledAt.Valid
	eventType := EventScheduled
	if wasScheduled {
		eventType = EventRescheduled
	}
	s.recordEvent(ctx, EventInput{
		ArticleID: articleID, PublisherID: row.PublisherId, ActorID: userID,
		Type: eventType, FromStatus: statusOrDraft(row.Status), ToStatus: "SCHEDULED",
		ScheduledAt: scheduledAt,
	})
	s.auditMedia(ctx, row.PublisherId, userID, "media.article_scheduled", map[string]any{
		"articleId": articleID, "title": row.Title, "scheduledAt": scheduledAt.Format(time.RFC3339),
		"rescheduled": wasScheduled,
	})
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
func (s *Service) emitPublished(ctx context.Context, row db.GetArticleByIDRow, sendEmail bool, emailSubject, emailPreviewText string) {
	if s.ac == nil {
		return
	}
	_ = queue.PublishArticleEmbedding(s.ac, queue.EmbeddingPayload{ArticleID: row.ID})
	_ = queue.PublishArticlePublished(s.ac, queue.ArticlePublishedPayload{
		EventID:          "article_published_" + row.ID,
		PublisherID:      row.PublisherId,
		ArticleID:        row.ID,
		AuthorID:         row.AuthorID,
		Title:            row.Title,
		Slug:             row.Slug,
		Visibility:       string(row.Visibility),
		PublishedAt:      time.Now().UTC().Format(time.RFC3339),
		SendEmail:        sendEmail,
		EmailSubject:     emailSubject,
		EmailPreviewText: emailPreviewText,
	})
}

// SendArticleEmail déclenche l'envoi manuel par email d'un article déjà publié (Branch D ou Branch B).
func (s *Service) SendArticleEmail(ctx context.Context, articleID, userID, subject, previewText string, isMajorUpdate bool) error {
	row, err := s.q.GetArticleByID(ctx, articleID)
	if err != nil {
		return errNotFound
	}
	mc, err := s.resolveMember(ctx, userID, row.PublisherId)
	if err != nil {
		return errForbidden
	}
	if !mc.can(permissions.PermPublishAny) && mc.role != "owner" {
		return errForbidden
	}
	if !row.Published || row.Status != "PUBLISHED" {
		return ErrArticleNotEligible
	}

	// Cooldown 2h par publication
	cooldownAt, err := s.q.CheckPublisherEmailCooldown(ctx, row.PublisherId)
	if err == nil && cooldownAt.Valid {
		return ErrCooldownActive
	}

	if subject == "" {
		subject = row.Title
	}

	if isMajorUpdate {
		if s.pool != nil {
			if !subscriptions.HasPro(ctx, s.pool, row.PublisherId, time.Now()) {
				return errors.New("l'envoi d'une mise à jour majeure par email est réservé aux publishers PRO")
			}
		}
		if !strings.HasPrefix(subject, "[Mise à jour]") && !strings.HasPrefix(subject, "[Update]") {
			subject = "[Mise à jour] " + subject
		}
		if _, err := s.q.TryLockArticleForMajorUpdate(ctx, db.TryLockArticleForMajorUpdateParams{
			Subject:     subject,
			PreviewText: previewText,
			ID:          articleID,
		}); err != nil {
			return ErrArticleAlreadySent
		}
		_ = s.q.InsertArticleReleaseMajorUpdateDeliveries(ctx, db.InsertArticleReleaseMajorUpdateDeliveriesParams{
			ArticleId:   articleID,
			PublisherId: row.PublisherId,
		})
	} else {
		if _, err := s.q.TryLockArticleForEmailRelease(ctx, db.TryLockArticleForEmailReleaseParams{
			Subject:     subject,
			PreviewText: previewText,
			ID:          articleID,
		}); err != nil {
			return ErrArticleAlreadySent
		}
		_ = s.q.InsertArticleReleaseDeliveries(ctx, db.InsertArticleReleaseDeliveriesParams{
			ArticleId:   articleID,
			PublisherId: row.PublisherId,
		})
	}

	if s.ac != nil {
		_ = queue.PublishArticleRelease(s.ac, queue.ArticleReleasePayload{ArticleID: articleID}, 0)
	}
	return nil
}

// SendArticleTestEmail envoie un email d'aperçu de l'article à l'adresse de l'utilisateur connecté.
func (s *Service) SendArticleTestEmail(ctx context.Context, articleID, userID string) error {
	row, err := s.q.GetArticleByID(ctx, articleID)
	if err != nil {
		return errNotFound
	}
	if _, err := s.resolveMember(ctx, userID, row.PublisherId); err != nil {
		return errForbidden
	}

	if s.pool == nil {
		return errors.New("base de données non disponible")
	}
	var userEmail string
	err = s.pool.QueryRow(ctx, `SELECT COALESCE(email, '') FROM "User" WHERE id = $1`, toUUID(userID)).Scan(&userEmail)
	if err != nil || strings.TrimSpace(userEmail) == "" {
		return errors.New("adresse email utilisateur introuvable")
	}

	if s.emailSender == nil {
		return errors.New("fournisseur d'email non configuré")
	}

	info := db.GetArticleReleaseInfoRow{
		ID:               row.ID,
		Title:            row.Title,
		Slug:             row.Slug,
		Visibility:       row.Visibility,
		IsPremium:        row.IsPremium,
		Content:          row.Content,
		PublisherId:      row.PublisherId,
		EmailSubject:     pgtype.Text{String: "[TEST] " + row.Title, Valid: true},
		EmailPreviewText: pgtype.Text{String: "Aperçu test — " + row.Title, Valid: true},
		PublisherName:    row.PublisherName,
		Subdomain:        row.PublisherSubdomain,
	}
	link := "https://qoe.fi/p/" + row.Slug
	rendered := BuildArticleReleaseEmail(info, link, userEmail)
	testSubject := "[TEST] " + row.Title
	return s.emailSender(ctx, userEmail, testSubject, rendered.HTML, rendered.ListUnsubscribe, rendered.FromName)
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
	if categoryID != nil && strings.TrimSpace(*categoryID) != "" {
		cat, err := s.q.GetCategoryByID(ctx, *categoryID)
		if err != nil || cat.PublisherId != publisherID {
			return nil, errors.New("Catégorie introuvable pour cette publication.")
		}
		id := cat.ID
		return &id, nil
	}
	def, err := s.q.EnsureDefaultCategory(ctx, publisherID)
	if err != nil {
		return nil, err
	}
	id := def.ID
	return &id, nil
}

// imageVal distingue « champ absent » (nil = conserver) de « chaîne vide »
// (= retirer l'image) pour les mises à jour.
func imageVal(value *string) pgtype.Text {
	if value == nil || strings.TrimSpace(*value) == "" {
		return pgtype.Text{}
	}
	return pgtype.Text{String: *value, Valid: true}
}

func (s *Service) uniqueSlug(ctx context.Context, publisherID, articleID, base string) string {
	final := base
	if final == "" {
		final = "article-" + slug.ShortID(8)
	}
	exists, err := s.q.CheckArticleSlugExists(ctx, db.CheckArticleSlugExistsParams{
		PublisherId: publisherID, Slug: final, ID: articleID,
	})
	if err == nil && exists {
		final = final + "-" + slug.ShortID(4)
	}
	return final
}

func (s *Service) uniqueShortCode(ctx context.Context) string {
	for i := 0; i < 20; i++ {
		code := slug.ShortNumericCode()
		var exists bool
		if err := s.pool.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM "Article" WHERE "shortCode" = $1)`, code,
		).Scan(&exists); err == nil && !exists {
			return code
		}
	}
	return slug.ShortNumericCode()
}

func (s *Service) archiveSlugIfPreviouslyPublished(ctx context.Context, articleID, oldSlug, newSlug string, currentlyPublished bool, currentStatus string) {
	if oldSlug == "" || newSlug == "" || oldSlug == newSlug {
		return
	}
	wasPublished := currentlyPublished || currentStatus == "PUBLISHED"
	if !wasPublished {
		_ = s.pool.QueryRow(ctx, `
			SELECT EXISTS(
				SELECT 1 FROM "ArticleSnapshot"
				WHERE "articleId" = $1 AND reason = 'PUBLISHED'
			)`, articleID).Scan(&wasPublished)
	}
	if !wasPublished {
		return
	}
	_, _ = s.pool.Exec(ctx, `
		INSERT INTO "ArticleSlugHistory" (id, "articleId", slug, "createdAt")
		VALUES (gen_random_uuid()::text, $1, $2, now())
		ON CONFLICT (slug) DO NOTHING`,
		articleID, oldSlug)
}

// ShortCodeResolution contient les informations de redirection canonique pour GET /v1/articles/short/{code}.
type ShortCodeResolution struct {
	ID                 string  `json:"id"`
	Slug               string  `json:"slug"`
	ShortCode          string  `json:"shortCode"`
	OwnerSlug          string  `json:"ownerSlug"`
	CategorySlug       *string `json:"categorySlug"`
	ParentCategorySlug *string `json:"parentCategorySlug"`
	Subdomain          *string `json:"subdomain"`
	CustomDomain       *string `json:"customDomain"`
}

// GetByShortCode résout un article publié par son code court numérique pour redirection canonique.
func (s *Service) GetByShortCode(ctx context.Context, code string) (*ShortCodeResolution, error) {
	code = strings.TrimSpace(code)
	if slug.ExtractTrailingShortCode(code) == "" {
		return nil, pgx.ErrNoRows
	}
	var out ShortCodeResolution
	err := s.pool.QueryRow(ctx, `
		SELECT a.id, a.slug, a."shortCode", p.slug,
		       c.slug, cp.slug, p.subdomain, p."customDomain"
		FROM "Article" a
		JOIN "Publisher" p ON p.id = a."publisherId"
		LEFT JOIN "Category" c ON c.id = a."categoryId"
		LEFT JOIN "Category" cp ON cp.id = c."parentId"
		WHERE a."shortCode" = $1
		  AND a.published = true
		  AND a.status = 'PUBLISHED'
		  AND (a."isClaimed" = true OR a."isAuthorSovereignCopy" = false)
		LIMIT 1`, code).Scan(
		&out.ID, &out.Slug, &out.ShortCode, &out.OwnerSlug,
		&out.CategorySlug, &out.ParentCategorySlug, &out.Subdomain, &out.CustomDomain,
	)
	if err != nil {
		return nil, err
	}
	return &out, nil
}

// notifyReviewers notifie les approbateurs (media:review) d'une soumission — best-effort.
func (s *Service) notifyReviewers(ctx context.Context, publisherID, articleID, senderID string) {
	_ = s.q.InsertMediaArticleSubmittedFanout(ctx, db.InsertMediaArticleSubmittedFanoutParams{
		PublisherID: publisherID,
		ArticleID:   pgtype.Text{String: articleID, Valid: true},
		SenderID:    toUUID(senderID),
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

func (s *Service) syncAttributions(ctx context.Context, articleID, authorID string, attributions []ArticleAttributionInput, showOnPersonalProfile ...bool) {
	if s.pool == nil {
		return
	}
	primaryVisible := true
	if len(showOnPersonalProfile) > 0 {
		primaryVisible = showOnPersonalProfile[0]
	}
	// Toujours s'assurer que l'auteur principal a son attribution PRIMARY_AUTHOR ACCEPTED,
	// avec isVisible synchronisé avec showOnPersonalProfile.
	_, _ = s.pool.Exec(ctx, `
		INSERT INTO "ArticleAttribution" (id, "articleId", "userId", role, "order", "isVisible", "consentStatus", "consentUpdatedAt", "updatedAt")
		VALUES (gen_random_uuid()::text, $1, $2, 'PRIMARY_AUTHOR', 0, $3, 'ACCEPTED', now(), now())
		ON CONFLICT ("articleId", "userId") DO UPDATE SET
		  role = 'PRIMARY_AUTHOR', "order" = 0, "isVisible" = $3, "consentStatus" = 'ACCEPTED', "updatedAt" = now()
	`, articleID, toUUID(authorID), primaryVisible)

	newUsers := make(map[string]bool)
	for _, attr := range attributions {
		if attr.UserID != "" && attr.UserID != authorID {
			newUsers[attr.UserID] = true
		}
	}

	// Détecter les attributions supprimées / révoquées
	existingRows, err := s.pool.Query(ctx, `
		SELECT "userId"::text, "consentStatus"
		FROM "ArticleAttribution"
		WHERE "articleId" = $1 AND "userId" != $2
	`, articleID, toUUID(authorID))
	if err == nil {
		type existingContr struct {
			userID string
			status string
		}
		var toRevoke []existingContr
		var toDelete []string
		for existingRows.Next() {
			var uID, status string
			if scanErr := existingRows.Scan(&uID, &status); scanErr == nil {
				if !newUsers[uID] {
					if status == "ACCEPTED" {
						toRevoke = append(toRevoke, existingContr{userID: uID, status: status})
					} else if status == "PENDING" {
						toDelete = append(toDelete, uID)
					}
				}
			}
		}
		existingRows.Close()

		if len(toRevoke) > 0 {
			articleRow, _ := s.q.GetArticleByID(ctx, articleID)
			for _, r := range toRevoke {
				if articleRow.ID != "" {
					_ = s.captureSnapshot(ctx, articleID, &r.userID, articleRow.Title, articleRow.Content, "BEFORE_REVOCATION")
				}
				_, _ = s.pool.Exec(ctx, `
					UPDATE "ArticleAttribution"
					SET "consentStatus" = 'REVOKED', "isVisible" = false, "updatedAt" = now()
					WHERE "articleId" = $1 AND "userId" = $2
				`, articleID, toUUID(r.userID))
			}
		}
		for _, dID := range toDelete {
			_, _ = s.pool.Exec(ctx, `DELETE FROM "ArticleAttribution" WHERE "articleId" = $1 AND "userId" = $2`, articleID, toUUID(dID))
			_, _ = s.pool.Exec(ctx, `DELETE FROM "CollaborationRequest" WHERE "articleId" = $1 AND "inviteeId" = $2`, articleID, toUUID(dID))
		}
	}

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
	return s.fetchArticleCountBatch(ctx, ids, `SELECT "articleId", COUNT(*)::int FROM "ArticleComment" WHERE "articleId" = ANY($1) GROUP BY "articleId"`)
}

func (s *Service) fetchLikesBatch(ctx context.Context, ids []string) map[string]int {
	return s.fetchArticleCountBatch(ctx, ids, `SELECT "articleId", COUNT(*)::int FROM "ContentFeedback" WHERE "articleId" = ANY($1) AND "type" = 'LIKE' GROUP BY "articleId"`)
}

func (s *Service) fetchRepostsBatch(ctx context.Context, ids []string) map[string]int {
	return s.fetchArticleCountBatch(ctx, ids, `SELECT "quotedArticleId", COUNT(*)::int FROM "Post" WHERE "quotedArticleId" = ANY($1) GROUP BY "quotedArticleId"`)
}

// fetchScheduledBatch rend la date de programmation (RFC 3339, UTC) des
// articles concern\u00e9s. Une seule requ\u00eate par page, et rien du tout quand
// aucun article n'est programm\u00e9 : la colonne n'est pas dans le SELECT de
// ListArticlesWithCategory (sqlc), on l'enrichit ici sans r\u00e9g\u00e9n\u00e9rer le code.
func (s *Service) fetchScheduledBatch(ctx context.Context, ids []string) map[string]string {
	m := map[string]string{}
	if s.pool == nil || len(ids) == 0 {
		return m
	}
	rows, err := s.pool.Query(ctx,
		`SELECT id, "scheduledAt" FROM "Article"
		 WHERE id = ANY($1) AND "scheduledAt" IS NOT NULL`, ids)
	if err != nil {
		return m
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var at pgtype.Timestamp
		if err := rows.Scan(&id, &at); err == nil && at.Valid {
			m[id] = at.Time.UTC().Format(time.RFC3339)
		}
	}
	return m
}

func (s *Service) fetchArticleCountBatch(ctx context.Context, ids []string, query string) map[string]int {
	m := map[string]int{}
	if s.pool == nil || len(ids) == 0 {
		return m
	}
	rows, err := s.pool.Query(ctx, query, ids)
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
func (s *Service) Review(ctx context.Context, articleID, userID string, approve bool, comment string) error {
	row, err := s.q.GetArticleByID(ctx, articleID)
	if err != nil {
		return errNotFound
	}
	if row.Status != "SUBMITTED" {
		return errors.New("Cet article n'est pas en attente de revue.")
	}
	mc, err := s.resolveMember(ctx, userID, row.PublisherId)
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
		if row.DraftContent.Valid && row.DraftContent.String != "" {
			if _, err := s.q.PublishArticleDraft(ctx, articleID); err != nil {
				return err
			}
		}
	} else if row.Published {
		// Rejet des modifications sur un article déjà en ligne : l'article reste publié
		// pour les lecteurs, le brouillon est maintenu pour retouches par l'auteur.
		published = true
		status = "DRAFT"
	}

	if _, err := s.q.SetArticleStatus(ctx, db.SetArticleStatusParams{
		ID: articleID, Status: status, Published: published,
	}); err != nil {
		return err
	}

	action := "REJECTED"
	notifType := db.NotificationTypeMEDIAARTICLEREJECTED
	if approve {
		action = "APPROVED"
		notifType = db.NotificationTypeMEDIAARTICLEAPPROVED
	}

	_ = s.q.InsertArticleReviewLog(ctx, db.InsertArticleReviewLogParams{
		ArticleId:   articleID,
		PublisherId: row.PublisherId,
		ReviewerId:  toUUID(userID),
		Action:      action,
		Comment:     pgtype.Text{String: comment, Valid: comment != ""},
	})

	meta := map[string]any{
		"articleId":    articleID,
		"articleTitle": row.Title,
	}
	if comment != "" {
		meta["comment"] = comment
	}
	metaBytes, _ := json.Marshal(meta)
	_ = s.q.InsertArticleReviewNotification(ctx, db.InsertArticleReviewNotificationParams{
		RecipientID: toUUID(row.AuthorID),
		SenderID:    toUUID(userID),
		Type:        notifType,
		ArticleID:   pgtype.Text{String: articleID, Valid: true},
		PublisherID: pgtype.Text{String: row.PublisherId, Valid: true},
		Metadata:    metaBytes,
	})

	// Journal média : l'approbation et le rejet sont des actes éditoriaux que
	// l'équipe doit pouvoir relire, avec le commentaire éventuel.
	auditAction := "media.article_rejected"
	if approve {
		auditAction = "media.article_approved"
	}
	auditMeta := map[string]any{"articleId": articleID, "title": row.Title}
	if comment != "" {
		auditMeta["comment"] = comment
	}
	s.auditMedia(ctx, row.PublisherId, userID, auditAction, auditMeta)

	s.queueSearchSync(articleID, "upsert")
	if approve && !row.Published {
		s.emitPublished(ctx, row, true, "", "")
	}
	eventType := EventRejected
	if approve {
		eventType = EventApproved
	}
	s.recordEvent(ctx, EventInput{
		ArticleID: articleID, PublisherID: row.PublisherId, ActorID: userID,
		Type: eventType, FromStatus: "SUBMITTED", ToStatus: statusOrDraft(status),
	})
	return nil
}

// DiscardDraft abandonne le brouillon en cours pour revenir à la version publiée en ligne.
func (s *Service) DiscardDraft(ctx context.Context, articleID, userID string) error {
	row, _, err := s.authorizeEdit(ctx, articleID, userID, "")
	if err != nil {
		return err
	}
	if !row.DraftContent.Valid || row.DraftContent.String == "" {
		return nil
	}
	if _, err := s.q.DiscardArticleDraft(ctx, articleID); err != nil {
		return err
	}
	s.auditMedia(ctx, row.PublisherId, userID, "media.article_draft_discarded", map[string]any{
		"articleId": articleID, "title": row.Title,
	})
	if row.Published && row.Status == "SUBMITTED" {
		_, _ = s.q.SetArticleStatus(ctx, db.SetArticleStatusParams{
			ID: articleID, Status: "PUBLISHED", Published: true,
		})
	}
	_ = s.q.InsertArticleReviewLog(ctx, db.InsertArticleReviewLogParams{
		ArticleId:   articleID,
		PublisherId: row.PublisherId,
		ReviewerId:  toUUID(userID),
		Action:      "WITHDRAWN",
		Comment:     pgtype.Text{String: "Brouillon abandonné", Valid: true},
	})
	return nil
}

// GetLatestReviewFeedback retourne le dernier feedback éditorial d'un article.
func (s *Service) GetLatestReviewFeedback(ctx context.Context, articleID, userID string) (*ArticleReviewFeedbackResponse, error) {
	row, err := s.q.GetArticleByID(ctx, articleID)
	if err != nil {
		return nil, errNotFound
	}
	if row.AuthorID != userID {
		if _, err := s.resolveMember(ctx, userID, row.PublisherId); err != nil {
			return nil, errForbidden
		}
	}
	fb, err := s.q.GetLatestArticleReviewFeedback(ctx, articleID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &ArticleReviewFeedbackResponse{
		ID:               fb.ID,
		ArticleID:        fb.ArticleId,
		Action:           fb.Action,
		Comment:          textPtr(fb.Comment),
		CreatedAt:        fb.CreatedAt.Time.Format(time.RFC3339),
		ReviewerName:     textPtr(fb.ReviewerName),
		ReviewerUsername: textPtr(fb.ReviewerUsername),
		ReviewerLogo:     textPtr(fb.ReviewerLogo),
	}, nil
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
		ID: row.ID, Title: row.Title, Slug: row.Slug, Content: cut.Content,
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
		ImageUrl:    textPtr(row.ArticleImage),
		CreatedAt:   row.CreatedAt.Time.Format(time.RFC3339),
		UpdatedAt:   row.UpdatedAt.Time.Format(time.RFC3339),
		IsTruncated: cut.IsTruncated, AccessGranted: cut.AccessGranted, PaywallMeta: cut.PaywallMeta,
		Author:       AuthorInfo{ID: row.AuthorID, Name: textPtr(row.AuthorName), Username: textPtr(row.AuthorUsername), LogoURL: authorLogo, Type: pubType},
		Publisher:    &PublisherInfo{ID: row.PublisherId, Name: row.PublisherName, Slug: row.PublisherSlug, Subdomain: textPtr(row.PublisherSubdomain), LogoURL: textPtr(row.PublisherLogo), CustomDomain: textPtr(row.PublisherCustomDomain), Type: pubType},
		CoAuthors:    []AuthorInfo{},
		Attributions: []AttributionInfo{},
	}
	if row.CategoryID.Valid {
		resp.Category = &CategoryInfo{ID: row.CategoryID.String, Name: row.CategoryName.String, Slug: row.CategorySlug.String}
	}
	return resp
}

func articleFromRow(row db.GetArticleByIDRow, cut PaywallCutResult) ArticleResponse {
	pubType := identity.FromPublisherType(string(row.PublisherType))
	authorLogo := textPtr(row.AuthorLogo)
	resp := ArticleResponse{
		ID: row.ID, Title: row.Title, Slug: row.Slug, Content: cut.Content,
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
		CreatedAt:   row.CreatedAt.Time.Format(time.RFC3339),
		UpdatedAt:   row.UpdatedAt.Time.Format(time.RFC3339),
		IsTruncated: cut.IsTruncated, AccessGranted: cut.AccessGranted, PaywallMeta: cut.PaywallMeta,
		Author:    AuthorInfo{ID: row.AuthorID, Name: textPtr(row.AuthorName), Username: textPtr(row.AuthorUsername), LogoURL: authorLogo, Type: pubType},
		Publisher: &PublisherInfo{ID: row.PublisherId, Name: row.PublisherName, Slug: row.PublisherSlug, Subdomain: textPtr(row.PublisherSubdomain), Type: pubType},
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

// ListCreatorArticles liste les articles d'une publication au format du contrat
// créateurs (enveloppe `{data, pagination}`, contenu tronqué `contentHtml`,
// catégorie embarquée). Filtres : `published` (défaut true) et `category` (slug).
func (s *Service) ListCreatorArticles(ctx context.Context, userID, publisherID string, page, limit int, categorySlug string, publishedOnly bool) (CreatorListResponse, error) {
	if _, err := s.resolveMember(ctx, userID, publisherID); err != nil {
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
		PublisherId:  publisherID,
		Published:    pub,
		CategorySlug: cat,
		Offset:       int32(offset),
		Limit:        int32(limit),
	})
	if err != nil {
		return CreatorListResponse{}, err
	}
	total, err := s.q.CountCreatorArticles(ctx, db.CountCreatorArticlesParams{
		PublisherId:  publisherID,
		Published:    pub,
		CategorySlug: cat,
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
			ImageUrl:    textPtr(r.ImageUrl),
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
func (s *Service) GetCreatorBySlug(ctx context.Context, slug, publisherID string) (CreatorItem, error) {
	row, err := s.q.GetCreatorArticleBySlug(ctx, db.GetCreatorArticleBySlugParams{Slug: slug, PublisherId: publisherID})
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
		ImageUrl:    textPtr(row.ImageUrl),
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
		EventID:     "article_" + strings.TrimPrefix(taskType, "article.") + "_" + row.ID,
		PublisherID: row.PublisherId,
		ArticleID:   row.ID,
		AuthorID:    row.AuthorID,
		Title:       title,
		Slug:        slug,
		Visibility:  string(row.Visibility),
		PublishedAt: time.Now().UTC().Format(time.RFC3339),
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

func boolVal(p *bool) pgtype.Bool {
	if p == nil {
		return pgtype.Bool{}
	}
	return pgtype.Bool{Bool: *p, Valid: true}
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

func stringPtrVal(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// ─── Souveraineté de l'auteur : Fork personnel & Révisions ───────────────

func (s *Service) fetchOriginPublisher(ctx context.Context, originArticleID string) *PublisherInfo {
	if s.pool == nil || originArticleID == "" {
		return nil
	}
	var pubID, name, slug, ptype string
	var sub, logo, custom pgtype.Text
	err := s.pool.QueryRow(ctx, `
		SELECT p.id, p.name, p.slug, p.subdomain, p."logoUrl", p."customDomain", p.type::text
		FROM "Article" a
		JOIN "Publisher" p ON p.id = a."publisherId"
		WHERE a.id = $1
	`, originArticleID).Scan(&pubID, &name, &slug, &sub, &logo, &custom, &ptype)
	if err != nil {
		return nil
	}
	return &PublisherInfo{
		ID:           pubID,
		Name:         name,
		Slug:         slug,
		Subdomain:    textPtr(sub),
		LogoURL:      textPtr(logo),
		CustomDomain: textPtr(custom),
		Type:         identity.FromPublisherType(ptype),
	}
}

func countWords(content string) int {
	return len(strings.Fields(content))
}

const (
	authorSwitchSnapshotCooldown = 5 * time.Minute
	maxNonMilestoneSnapshots     = 50
)

func snapshotContentHash(title, content string) string {
	sum := sha256.Sum256([]byte(title + "\x00" + content))
	return hex.EncodeToString(sum[:])
}

func isMilestoneSnapshotReason(reason string) bool {
	return reason == "INITIAL" || reason == "PUBLISHED" || reason == "BEFORE_REVOCATION"
}

func (s *Service) captureSnapshot(ctx context.Context, articleID string, actorID *string, title, content, reason string) error {
	if s.pool == nil || articleID == "" {
		return nil
	}
	contentHash := snapshotContentHash(title, content)

	// Cooldown anti-flood sur AUTHOR_SWITCH (éditions collaboratives alternées rapides).
	if reason == "AUTHOR_SWITCH" {
		if lastSwitch, err := s.q.GetLatestArticleSnapshotByReason(ctx, db.GetLatestArticleSnapshotByReasonParams{
			ArticleId: articleID,
			Reason:    "AUTHOR_SWITCH",
		}); err == nil && lastSwitch.CreatedAt.Valid && time.Since(lastSwitch.CreatedAt.Time) < authorSwitchSnapshotCooldown {
			return nil
		}
	}

	// Déduplication SHA-256 : évite de dupliquer des snapshots identiques.
	// Les jalons (INITIAL, PUBLISHED, BEFORE_REVOCATION) ne sont dédupliqués
	// que contre un jalon de même raison.
	if latest, err := s.q.GetLatestArticleSnapshotMeta(ctx, articleID); err == nil && latest.ContentHash.Valid && latest.ContentHash.String == contentHash {
		if !isMilestoneSnapshotReason(reason) || latest.Reason == reason {
			return nil
		}
	}

	var actorUUID pgtype.UUID
	if actorID != nil && *actorID != "" {
		actorUUID = toUUID(*actorID)
	}
	words := countWords(content)
	_, err := s.q.InsertArticleSnapshot(ctx, db.InsertArticleSnapshotParams{
		ArticleId:   articleID,
		ActorId:     actorUUID,
		Title:       title,
		Content:     content,
		WordCount:   int32(words),
		Reason:      reason,
		ContentHash: pgtype.Text{String: contentHash, Valid: true},
	})
	if err != nil {
		return err
	}
	if !isMilestoneSnapshotReason(reason) {
		_ = s.q.PruneOldArticleSnapshots(ctx, db.PruneOldArticleSnapshotsParams{
			ArticleId: articleID,
			Limit:     maxNonMilestoneSnapshots,
		})
	}
	return nil
}

// ensureAuthorSovereignCopy est le point d'entrée du fork manuel (« Récupérer
// ma copie »). Le provisionnement automatique à la soumission/publication est
// garanti atomiquement par le trigger SQL trg_provision_author_sovereign_copy,
// qui appelle la même fonction ensure_author_sovereign_copy en base : une
// publication ne peut plus réussir sans copie souveraine.
func (s *Service) ensureAuthorSovereignCopy(ctx context.Context, mediaArticleID, targetUserID string, claimNow bool, overrideTitle, overrideContent *string) (string, bool, error) {
	if s.pool == nil || mediaArticleID == "" || targetUserID == "" {
		return "", false, errors.New("provisionnement de la copie souveraine impossible")
	}
	var alreadyExisted bool
	if existing, err := s.q.GetSovereignCopyByOriginAndAuthor(ctx, db.GetSovereignCopyByOriginAndAuthorParams{
		OriginArticleId: pgtype.Text{String: mediaArticleID, Valid: true},
		AuthorId:        toUUID(targetUserID),
	}); err == nil && existing.ID != "" {
		alreadyExisted = true
	}

	var copyID pgtype.Text
	if err := s.pool.QueryRow(ctx,
		`SELECT ensure_author_sovereign_copy($1, $2, $3, $4, $5)`,
		mediaArticleID, toUUID(targetUserID), claimNow, overrideTitle, overrideContent,
	).Scan(&copyID); err != nil {
		return "", false, err
	}
	if !copyID.Valid || copyID.String == "" {
		return "", false, errors.New("la copie souveraine n'a pas pu être créée")
	}
	return copyID.String, alreadyExisted, nil
}

// ForkToPersonal exerce le droit inaliénable de l'auteur (ou co-auteur accepté)
// de rapatrier une copie éditable dans son propre espace personnel, même s'il
// a été exclu du média.
func (s *Service) ForkToPersonal(ctx context.Context, articleID, userID string, snapshotID ...string) (string, bool, error) {
	row, err := s.q.GetArticleByID(ctx, articleID)
	if err != nil {
		return "", false, errNotFound
	}
	if row.PublisherType != db.PublisherTypeMEDIA && row.AuthorID == userID {
		return "", false, errors.New("Cet article est déjà votre article personnel.")
	}
	allowed := row.AuthorID == userID
	if !allowed && s.pool != nil {
		_ = s.pool.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1 FROM "ArticleAttribution" aa
				WHERE aa."articleId" = $1 AND aa."userId" = $2 AND aa."consentStatus" IN ('ACCEPTED', 'REVOKED')
			)
		`, articleID, toUUID(userID)).Scan(&allowed)
	}
	if !allowed {
		return "", false, errForbidden
	}

	var overrideTitle, overrideContent *string
	if len(snapshotID) > 0 && strings.TrimSpace(snapshotID[0]) != "" {
		snap, err := s.q.GetArticleSnapshotByID(ctx, snapshotID[0])
		if err == nil && snap.ArticleId == articleID {
			overrideTitle = &snap.Title
			overrideContent = &snap.Content
		}
	}

	return s.ensureAuthorSovereignCopy(ctx, articleID, userID, true, overrideTitle, overrideContent)
}

// ListSnapshots retourne la liste ordonnée des versions enregistrées de l'article.
func (s *Service) ListSnapshots(ctx context.Context, articleID, userID string) ([]ArticleSnapshotItem, error) {
	row, err := s.q.GetArticleByID(ctx, articleID)
	if err != nil {
		return nil, errNotFound
	}
	allowed := row.AuthorID == userID
	if !allowed {
		if mc, err := s.resolveMember(ctx, userID, row.PublisherId); err == nil && (mc.isMedia || mc.role == "owner") {
			allowed = true
		}
	}
	if !allowed && s.pool != nil {
		_ = s.pool.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1 FROM "ArticleAttribution"
				WHERE "articleId" = $1 AND "userId" = $2 AND "consentStatus" IN ('ACCEPTED', 'REVOKED')
			)
		`, articleID, toUUID(userID)).Scan(&allowed)
	}
	if !allowed {
		return nil, errForbidden
	}

	rows, err := s.q.ListArticleSnapshots(ctx, articleID)
	if err != nil {
		return nil, err
	}
	items := make([]ArticleSnapshotItem, 0, len(rows))
	for _, r := range rows {
		item := ArticleSnapshotItem{
			ID:        r.ID,
			ArticleID: r.ArticleId,
			Title:     r.Title,
			Content:   r.Content,
			WordCount: int(r.WordCount),
			Reason:    r.Reason,
			CreatedAt: r.CreatedAt.Time.Format(time.RFC3339),
		}
		if r.ActorId.Valid {
			actID := uuidString(r.ActorId)
			item.ActorID = &actID
		}
		item.ActorName = textPtr(r.ActorName)
		item.ActorUsername = textPtr(r.ActorUsername)
		item.ActorAvatar = textPtr(r.ActorAvatar)
		items = append(items, item)
	}
	return items, nil
}

// RestoreSnapshot restaure le contenu d'un snapshot antérieur dans l'article.
func (s *Service) RestoreSnapshot(ctx context.Context, articleID, snapshotID, userID string) error {
	row, mc, err := s.authorizeEdit(ctx, articleID, userID, "")
	if err != nil {
		return err
	}
	_ = mc

	snap, err := s.q.GetArticleSnapshotByID(ctx, snapshotID)
	if err != nil || snap.ArticleId != articleID {
		return errors.New("version introuvable pour cet article")
	}

	// Sauvegarder la version actuelle avant restauration
	currentContent := row.Content
	if row.DraftContent.Valid && row.DraftContent.String != "" {
		currentContent = row.DraftContent.String
	}
	_ = s.captureSnapshot(ctx, articleID, &userID, row.Title, currentContent, "BEFORE_RESTORE")

	if row.Published {
		_, err = s.q.UpdateArticleDraft(ctx, db.UpdateArticleDraftParams{
			ID:           articleID,
			DraftContent: pgtype.Text{String: snap.Content, Valid: true},
		})
	} else {
		_, _ = s.q.UpdateArticleDraft(ctx, db.UpdateArticleDraftParams{
			ID:           articleID,
			DraftContent: pgtype.Text{Valid: false},
		})
		words := countWords(snap.Content)
		readingTime := words / 200
		if readingTime < 1 {
			readingTime = 1
		}
		_, err = s.q.UpdateArticleFull(ctx, db.UpdateArticleFullParams{
			ID:                     articleID,
			Title:                  snap.Title,
			Content:                snap.Content,
			Slug:                   row.Slug,
			Published:              row.Published,
			Status:                 row.Status,
			IsPremium:              row.IsPremium,
			CategoryId:             row.CategoryId,
			SeoTitle:               row.SeoTitle,
			SeoDescription:         row.SeoDescription,
			ReadingTime:            int32(readingTime),
			ScheduledAt:            row.ScheduledAt,
			ImageUrl:               imageVal(s.fetchArticleImageUrl(ctx, articleID)),
			AllowPublicAnnotations: row.AllowPublicAnnotations,
			AllowComments:          row.AllowComments,
			AllowDownload:          row.AllowDownload,
			ShowOnPersonalProfile:  row.ShowOnPersonalProfile,
		})
	}
	if err != nil {
		return err
	}

	s.recordEvent(ctx, EventInput{
		ArticleID:   articleID,
		PublisherID: row.PublisherId,
		ActorID:     userID,
		Type:        EventLiveUpdated,
		FromStatus:  row.Status,
		ToStatus:    row.Status,
	})
	return nil
}

// SubmitRevisionToOrigin soumet le contenu modifié d'un essai souverain personnel
// comme révision proposée à l'article média d'origine (soumise à validation du média).
func (s *Service) SubmitRevisionToOrigin(ctx context.Context, personalArticleID, userID string) (string, error) {
	personal, err := s.q.GetArticleByID(ctx, personalArticleID)
	if err != nil {
		return "", errNotFound
	}
	if personal.AuthorID != userID {
		return "", errForbidden
	}
	if !personal.OriginArticleId.Valid || personal.OriginArticleId.String == "" {
		return "", errors.New("Cet article n'est pas rattaché à un essai d'origine dans un média.")
	}
	originID := personal.OriginArticleId.String

	origin, err := s.q.GetArticleByID(ctx, originID)
	if err != nil {
		return "", errNotFound
	}
	mc, err := s.resolveMember(ctx, userID, origin.PublisherId)
	if err != nil || !mc.isMedia || !permissions.CanEditMediaArticle(mc.member, origin.AuthorID, userID) {
		return "", errors.New("Vous n'êtes plus membre actif de ce média : vos modifications restent enregistrées dans votre espace personnel.")
	}

	contentToSubmit := personal.Content
	if personal.DraftContent.Valid && strings.TrimSpace(personal.DraftContent.String) != "" {
		contentToSubmit = personal.DraftContent.String
	}

	if _, err := s.q.UpdateArticleDraft(ctx, db.UpdateArticleDraftParams{
		ID:           originID,
		DraftContent: pgtype.Text{String: contentToSubmit, Valid: true},
	}); err != nil {
		return "", err
	}

	if _, err := s.q.SetArticleStatus(ctx, db.SetArticleStatusParams{
		ID:        originID,
		Status:    "SUBMITTED",
		Published: origin.Published,
	}); err != nil {
		return "", err
	}

	_ = s.q.InsertArticleReviewLog(ctx, db.InsertArticleReviewLogParams{
		ArticleId:   originID,
		PublisherId: origin.PublisherId,
		ReviewerId:  toUUID(userID),
		Action:      "SUBMITTED",
		Comment:     pgtype.Text{String: "Révision proposée depuis l'essai personnel de l'auteur.", Valid: true},
	})
	s.notifyReviewers(ctx, origin.PublisherId, originID, userID)
	s.recordEvent(ctx, EventInput{
		ArticleID: originID, PublisherID: origin.PublisherId, ActorID: userID,
		Type: EventSubmitted, FromStatus: statusOrDraft(origin.Status), ToStatus: "SUBMITTED",
	})
	return originID, nil
}
