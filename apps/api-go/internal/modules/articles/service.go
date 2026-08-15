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
	"github.com/qoefi/api-go/internal/queue"
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
// ContentFormat : "" ou "html" (tel quel) | "markdown" (converti en HTML).
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
}

// UpdateArticleInput est l'entrée de mise à jour.
// ContentFormat : "" ou "html" (tel quel) | "markdown" (converti en HTML).
type UpdateArticleInput struct {
	Title          string
	Content        string
	ContentFormat  string
	Slug           string
	IsPremium      bool
	CategoryID     *string
	SeoTitle       *string
	SeoDescription *string
	ReadingTime    int
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

// resolveRole retourne le rôle de l'utilisateur sur la publication :
// "owner" (personnel) ou rôle média ("owner"|"editor"|"writer"|"viewer"), sinon erreur.
func (s *Service) resolveRole(ctx context.Context, userID, publicationID string) (string, error) {
	if personal, err := s.q.GetUserPersonalPublication(ctx, userID); err == nil && personal.String == publicationID {
		return "owner", nil
	}
	role, err := s.q.GetMediaRoleForUser(ctx, db.GetMediaRoleForUserParams{
		PublicationId: publicationID, UserId: toUUID(userID),
	})
	if err != nil {
		return "", errForbidden
	}
	return role, nil
}

func (s *Service) canCreate(role string) bool {
	return role == "owner" || role == "editor" || role == "writer"
}
func (s *Service) canPublish(role string) bool { return role == "owner" || role == "editor" }

// GetBySlug lit un article publié et applique la troncature paywall.
func (s *Service) GetBySlug(ctx context.Context, slug, publicationID string, viewerID string, viewerEmail string) (ArticleResponse, error) {
	row, err := s.q.GetArticleBySlug(ctx, db.GetArticleBySlugParams{Slug: slug, PublicationId: publicationID})
	if err != nil {
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

	// Troncature zéro-fuite : jamais de contenu payant au-delà du marqueur.
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

// Create crée un article avec RBAC (personnel owner ou membre média).
func (s *Service) Create(ctx context.Context, userID string, in CreateArticleInput) (string, error) {
	if !IsValidContentFormat(in.ContentFormat) {
		return "", errInvalidContentFormat
	}
	role, err := s.resolveRole(ctx, userID, in.PublicationID)
	if err != nil {
		return "", err
	}
	if !s.canCreate(role) {
		return "", errForbidden
	}
	if in.Visibility == "" {
		in.Visibility = VisPublic
	}

	// Un rédacteur ne peut pas publier directement.
	published := in.Published
	if !s.canPublish(role) {
		published = false
	}

	id, err := s.q.CreateArticle(ctx, db.CreateArticleParams{
		Title:                  in.Title,
		Slug:                   in.Slug,
		Content:                NormalizeContent(in.Content, in.ContentFormat),
		Published:              published,
		IsPremium:              in.IsPremium,
		Visibility:             db.ContentVisibility(in.Visibility),
		ReadingTime:            int32(in.ReadingTime),
		AllowPublicAnnotations: true,
		AllowComments:          true,
		Status:                 "DRAFT",
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
	return id, nil
}

// ListCreatorArticles liste les articles d'une publication au format du contrat
// créateurs (enveloppe `{data, pagination}`, contenu tronqué `contentHtml`,
// catégorie embarquée). Filtres : `published` (défaut true) et `category` (slug).
// RBAC : l'utilisateur doit avoir un rôle sur la publication.
func (s *Service) ListCreatorArticles(ctx context.Context, userID, publicationID string, page, limit int, categorySlug string, publishedOnly bool) (CreatorListResponse, error) {
	if _, err := s.resolveRole(ctx, userID, publicationID); err != nil {
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

// Update met à jour le contenu d'un article (RBAC).
func (s *Service) Update(ctx context.Context, articleID, userID string, in UpdateArticleInput) error {
	if !IsValidContentFormat(in.ContentFormat) {
		return errInvalidContentFormat
	}
	row, err := s.q.GetArticleByID(ctx, articleID)
	if err != nil {
		return errNotFound
	}
	role, err := s.resolveRole(ctx, userID, row.PublicationId)
	if err != nil {
		return err
	}
	// owner/editor : tout ; writer : ses propres articles.
	if !(role == "owner" || role == "editor") && uuidString(row.AuthorId) != userID {
		return errForbidden
	}
	_, err = s.q.UpdateArticleContent(ctx, db.UpdateArticleContentParams{
		ID: articleID, Title: in.Title, Content: NormalizeContent(in.Content, in.ContentFormat), Slug: in.Slug,
		IsPremium: in.IsPremium, CategoryId: textVal(in.CategoryID),
		SeoTitle: textVal(in.SeoTitle), SeoDescription: textVal(in.SeoDescription),
		ReadingTime: int32(in.ReadingTime),
	})
	if err == nil {
		s.queueSearchSync(articleID, "upsert")
		s.emitArticleLifecycle(queue.TaskArticleUpdated, row, in.Title, in.Slug)
	}
	return err
}

// SetStatus met à jour l'état (DRAFT/SUBMITTED/PUBLISHED).
func (s *Service) SetStatus(ctx context.Context, articleID, userID, status string, published bool) error {
	row, err := s.q.GetArticleByID(ctx, articleID)
	if err != nil {
		return errNotFound
	}
	role, err := s.resolveRole(ctx, userID, row.PublicationId)
	if err != nil {
		return err
	}
	if published && !s.canPublish(role) {
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

// Delete supprime un article (RBAC owner/editor, ou writer sur le sien).
func (s *Service) Delete(ctx context.Context, articleID, userID string) error {
	row, err := s.q.GetArticleByID(ctx, articleID)
	if err != nil {
		return errNotFound
	}
	role, err := s.resolveRole(ctx, userID, row.PublicationId)
	if err != nil {
		return err
	}
	if !(role == "owner" || role == "editor") && uuidString(row.AuthorId) != userID {
		return errForbidden
	}
	if err := s.q.DeleteArticle(ctx, articleID); err != nil {
		return err
	}
	s.emitArticleLifecycle(queue.TaskArticleDeleted, row, row.Title, row.Slug)
	return nil
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
