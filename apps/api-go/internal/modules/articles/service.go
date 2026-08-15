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
	db "github.com/qoefi/api-go/internal/database"
	"github.com/qoefi/api-go/internal/permissions"
	"github.com/qoefi/api-go/internal/queue"
	"github.com/qoefi/api-go/internal/slug"
	"github.com/redis/go-redis/v9"
)

var (
	errNotFound             = errors.New("article introuvable")
	errForbidden            = errors.New("permission insuffisante")
	errInvalidContentFormat = errors.New("contentFormat invalide (markdown|html)")
)

// ArticleResponse est la forme API d'un article (contenu éventuellement tronqué).
type ArticleResponse struct {
	ID             string           `json:"id"`
	Title          string           `json:"title"`
	Slug           string           `json:"slug"`
	Content        string           `json:"content"`
	Published      bool             `json:"published"`
	IsPremium      bool             `json:"isPremium"`
	Visibility     string           `json:"visibility"`
	ReadingTime    int              `json:"readingTime"`
	Status         string           `json:"status"`
	PublicationID  string           `json:"publicationId"`
	AuthorID       string           `json:"authorId"`
	CategoryID     *string          `json:"categoryId"`
	TierID         *string          `json:"tierId"`
	SeoTitle       *string          `json:"seoTitle"`
	SeoDescription *string          `json:"seoDescription"`
	CreatedAt      string           `json:"createdAt"`
	UpdatedAt      string           `json:"updatedAt"`
	IsTruncated    bool             `json:"isTruncated"`
	AccessGranted  bool             `json:"accessGranted"`
	PaywallMeta    *PaywallMeta     `json:"paywallMeta"`
	Author         AuthorInfo       `json:"author"`
	Publication    *PublicationInfo `json:"publication"`
	Category       *CategoryInfo    `json:"category"`
}

// CategoryInfo est la catégorie dénormalisée d'un article.
type CategoryInfo struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Slug string `json:"slug"`
}

// AuthorInfo est l'auteur dénormalisé.
type AuthorInfo struct {
	ID       string  `json:"id"`
	Name     *string `json:"name"`
	Username *string `json:"username"`
	LogoURL  *string `json:"logoUrl"`
}

// PublicationInfo est la publication dénormalisée.
type PublicationInfo struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	Slug      string  `json:"slug"`
	Subdomain *string `json:"subdomain"`
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
}

type Service struct {
	pool *pgxpool.Pool
	q    *db.Queries
	rc   *redis.Client
	ac   *asynq.Client
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

// GetBySlug lit un article publié et applique la troncature paywall.
func (s *Service) GetBySlug(ctx context.Context, slug, publicationID string, viewerID string, viewerEmail string) (ArticleResponse, error) {
	row, err := s.q.GetArticleBySlug(ctx, db.GetArticleBySlugParams{Slug: slug, PublicationId: publicationID})
	if err != nil {
		if errors.Is(err, errNotFound) {
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
	})
	if err != nil {
		return "", err
	}
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
func (s *Service) List(ctx context.Context, userID, publicationID string, limit, offset int) ([]ArticleResponse, error) {
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
		}
		if r.CategoryName.Valid {
			item.Category = &CategoryInfo{ID: r.CategoryID.String, Name: r.CategoryName.String, Slug: r.CategorySlug.String}
		}
		out = append(out, item)
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

	// Gate 1 : auteur direct OU publication active du workspace.
	isAuthor := uuidString(row.AuthorId) == userID
	if !isAuthor && row.PublicationId != in.ActivePublicationID {
		return errForbidden
	}

	mc, err := s.resolveMember(ctx, userID, row.PublicationId)
	if err != nil {
		return err
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
		if !permissions.CanEditMediaArticle(mc.member, uuidString(row.AuthorId), userID) {
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

	finalSlug := s.uniqueSlug(ctx, row.PublicationId, articleID, in.Slug)

	if _, err := s.q.UpdateArticleFull(ctx, db.UpdateArticleFullParams{
		ID: articleID, Title: in.Title, Content: NormalizeContent(in.Content, in.ContentFormat), Slug: finalSlug,
		Published: effectivePublished, Status: effectiveStatus,
		IsPremium: in.IsPremium, CategoryId: textVal(in.CategoryID),
		SeoTitle: textVal(in.SeoTitle), SeoDescription: textVal(in.SeoDescription),
		ReadingTime: int32(in.ReadingTime),
	}); err != nil {
		return err
	}
	s.queueSearchSync(articleID, "upsert")
	s.emitArticleLifecycle(queue.TaskArticleUpdated, row, in.Title, in.Slug)

	// Fan-out + événement à la transition draft→publié.
	if effectivePublished && !row.Published {
		s.emitPublished(ctx, row)
	}
	return nil
}

// SetStatus met à jour l'état (DRAFT/SUBMITTED/PUBLISHED).
func (s *Service) SetStatus(ctx context.Context, articleID, userID, status string, published bool) error {
	row, err := s.q.GetArticleByID(ctx, articleID)
	if err != nil {
		return errNotFound
	}
	mc, err := s.resolveMember(ctx, userID, row.PublicationId)
	if err != nil {
		return err
	}
	if published && !mc.can(permissions.PermPublishAny) {
		return errForbidden
	}
	if _, err := s.q.SetArticleStatus(ctx, db.SetArticleStatusParams{ID: articleID, Status: status, Published: published}); err != nil {
		return err
	}
	s.queueSearchSync(articleID, "upsert")
	if published {
		s.emitPublished(ctx, row)
	}
	return nil
}

// queueSearchSync enqueue un job de sync Meilisearch.
func (s *Service) queueSearchSync(articleID string, action string) {
	if s.ac == nil {
		return
	}
	_ = queue.PublishSearchSync(s.ac, queue.SearchSyncPayload{ArticleID: articleID, Action: action})
}

// emitPublished enqueue l'événement article.published dans asynq.
func (s *Service) emitPublished(ctx context.Context, row db.GetArticleByIDRow) {
	if s.ac == nil {
		return
	}
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

	isAuthor := uuidString(row.AuthorId) == userID
	if !isAuthor && row.PublicationId != activePublicationID {
		return errForbidden
	}

	mc, err := s.resolveMember(ctx, userID, row.PublicationId)
	if err != nil {
		return err
	}
	if mc.isMedia {
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
		if _, err := s.resolveMember(ctx, userID, row.PublicationId); err != nil {
			return ArticleResponse{}, errForbidden
		}
	}
	return s.articleResponseFromIDRow(row), nil
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
	return ArticleResponse{
		ID: row.ID, Title: row.Title, Slug: row.Slug, Content: row.Content,
		Published: row.Published, IsPremium: row.IsPremium, Visibility: string(row.Visibility),
		ReadingTime: int(row.ReadingTime), Status: row.Status, PublicationID: row.PublicationId,
		AuthorID: row.AuthorID, CategoryID: textPtr(row.CategoryId), TierID: textPtr(row.TierId),
		SeoTitle: textPtr(row.SeoTitle), SeoDescription: textPtr(row.SeoDescription),
		CreatedAt:     row.CreatedAt.Time.Format(time.RFC3339),
		UpdatedAt:     row.UpdatedAt.Time.Format(time.RFC3339),
		AccessGranted: true,
		Author:        AuthorInfo{ID: row.AuthorID, Name: textPtr(row.AuthorName), Username: textPtr(row.AuthorUsername), LogoURL: textPtr(row.AuthorLogo)},
		Publication:   &PublicationInfo{ID: row.PublicationId, Name: row.PublicationName, Slug: row.PublicationSlug, Subdomain: textPtr(row.PublicationSubdomain)},
	}
}

func articleFromSlugRow(row db.GetArticleBySlugRow, cut PaywallCutResult) ArticleResponse {
	return ArticleResponse{
		ID: row.ID, Title: row.Title, Slug: row.Slug, Content: cut.Content,
		Published: row.Published, IsPremium: row.IsPremium, Visibility: string(row.Visibility),
		ReadingTime: int(row.ReadingTime), Status: row.Status, PublicationID: row.PublicationId,
		AuthorID: row.AuthorID, CategoryID: textPtr(row.CategoryId), TierID: textPtr(row.TierId),
		SeoTitle: textPtr(row.SeoTitle), SeoDescription: textPtr(row.SeoDescription),
		CreatedAt:   row.CreatedAt.Time.Format(time.RFC3339),
		UpdatedAt:   row.UpdatedAt.Time.Format(time.RFC3339),
		IsTruncated: cut.IsTruncated, AccessGranted: cut.AccessGranted, PaywallMeta: cut.PaywallMeta,
		Author:      AuthorInfo{ID: row.AuthorID, Name: textPtr(row.AuthorName), Username: textPtr(row.AuthorUsername), LogoURL: textPtr(row.AuthorLogo)},
		Publication: &PublicationInfo{ID: row.PublicationId, Name: row.PublicationName, Slug: row.PublicationSlug, Subdomain: textPtr(row.PublicationSubdomain)},
	}
}

func articleFromRow(row db.GetArticleByIDRow, cut PaywallCutResult) ArticleResponse {
	return ArticleResponse{
		ID: row.ID, Title: row.Title, Slug: row.Slug, Content: cut.Content,
		Published: row.Published, IsPremium: row.IsPremium, Visibility: string(row.Visibility),
		ReadingTime: int(row.ReadingTime), Status: row.Status, PublicationID: row.PublicationId,
		AuthorID: row.AuthorID, CategoryID: textPtr(row.CategoryId), TierID: textPtr(row.TierId),
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
