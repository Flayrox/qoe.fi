// Package publications — identité tenant publique (remplacement des reads
// Prisma des pages apps/tenants).
//
// Résout la Publication (personnelle OU média) par sous-domaine/domaine
// personnalisé, avec sa navigation, ses réseaux sociaux, ses articles
// publiés et ses catégories. L'article d'une publication inclut l'auteur,
// la catégorie, les entitlements du lecteur (abonné) et ses interactions
// (bookmark + follow). Auth optionnelle : le viewer est lu du JWT.
package publications

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var errNotFound = errors.New("introuvable")

// Service porte les lectures publiques des publications.
type Service struct {
	pool pooler
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool}
}

// ---------------------------------------------------------------------------
// Types de réponse (parité avec les shapes Prisma consommés par les pages)
// ---------------------------------------------------------------------------

type NavItem struct {
	ID            string  `json:"id"`
	Label         string  `json:"label"`
	URL           string  `json:"url"`
	Order         int32   `json:"order"`
	IsExternal    bool    `json:"isExternal"`
	PublicationID string  `json:"publicationId"`
	ParentID      *string `json:"parentId"`
}

type SocialLinkItem struct {
	ID            string `json:"id"`
	Platform      string `json:"platform"`
	URL           string `json:"url"`
	Order         int32  `json:"order"`
	PublicationID string `json:"publicationId"`
}

type CategoryItem struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Slug string `json:"slug"`
}

type ArticleSummary struct {
	ID          string         `json:"id"`
	Title       string         `json:"title"`
	Slug        string         `json:"slug"`
	Content     string         `json:"content"`
	Published   bool           `json:"published"`
	IsPremium   bool           `json:"isPremium"`
	Visibility  string         `json:"visibility"`
	ReadingTime int32          `json:"readingTime"`
	CreatedAt   string         `json:"createdAt"`
	CategoryID  *string        `json:"categoryId"`
	Category    *CategoryItem  `json:"category,omitempty"`
}

type PublicationUser struct {
	ID       string  `json:"id"`
	Username *string `json:"username"`
}

// PublicationDetail est la publication dénormalisée (header + home).
type PublicationDetail struct {
	ID                      string            `json:"id"`
	Type                    string            `json:"type"`
	Name                    string            `json:"name"`
	Slug                    string            `json:"slug"`
	Bio                     *string           `json:"bio"`
	LogoURL                 *string           `json:"logoUrl"`
	IsCertified             bool              `json:"isCertified"`
	Subdomain               *string           `json:"subdomain"`
	CustomDomain            *string           `json:"customDomain"`
	UmamiWebsiteID          *string           `json:"umamiWebsiteId"`
	AccentColor             *string           `json:"accentColor"`
	FontFamily              *string           `json:"fontFamily"`
	HeroText                *string           `json:"heroText"`
	HeaderImageURL          *string           `json:"headerImageUrl"`
	FooterText              *string           `json:"footerText"`
	ThemeMode               *string           `json:"themeMode"`
	LayoutStyle             *string           `json:"layoutStyle"`
	AllowIndexing           bool              `json:"allowIndexing"`
	AllowPublicAnnotations  bool              `json:"allowPublicAnnotations"`
	AllowComments           bool              `json:"allowComments"`
	SeoTitle                *string           `json:"seoTitle"`
	SeoDescription          *string           `json:"seoDescription"`
	SupportURL              *string           `json:"supportUrl"`
	StripeAccountID         *string           `json:"stripeAccountId"`
	Navigation              []NavItem         `json:"navigation"`
	SocialLinks             []SocialLinkItem  `json:"socialLinks"`
	Categories              []CategoryItem    `json:"categories"`
	Articles                []ArticleSummary  `json:"articles,omitempty"`
	User                    *PublicationUser  `json:"user,omitempty"`
}

// AuthorInfo est l'auteur dénormalisé d'un article.
type AuthorInfo struct {
	ID       string  `json:"id"`
	Name     *string `json:"name"`
	Username *string `json:"username"`
	LogoURL  *string `json:"logoUrl"`
}

type ArticleDetail struct {
	ID                     string        `json:"id"`
	Title                  string        `json:"title"`
	Slug                   string        `json:"slug"`
	Content                string        `json:"content"`
	Published              bool          `json:"published"`
	Status                 string        `json:"status"`
	IsPremium              bool          `json:"isPremium"`
	Visibility             string        `json:"visibility"`
	ReadingTime            int32         `json:"readingTime"`
	AllowPublicAnnotations bool          `json:"allowPublicAnnotations"`
	AllowComments          bool          `json:"allowComments"`
	CreatedAt              string        `json:"createdAt"`
	AuthorID               string        `json:"authorId"`
	Category               *CategoryItem `json:"category"`
	Author                 *AuthorInfo   `json:"author"`
}

type Entitlements struct {
	IsMember          bool   `json:"isMember"`
	IsPaidSubscriber  bool   `json:"isPaidSubscriber"`
	TierID            string `json:"tierId,omitempty"`
}

// ArticleBundle est la réponse complète de la page article tenant.
type ArticleBundle struct {
	Publication            PublicationDetail `json:"publication"`
	Article                ArticleDetail     `json:"article"`
	Entitlements           Entitlements      `json:"entitlements"`
	Bookmarked             bool              `json:"bookmarked"`
	Followed               bool              `json:"followed"`
	IsViaAttribution       bool              `json:"isViaAttribution"`
	AttributionCategorySlug *string          `json:"attributionCategorySlug"`
}

// ---------------------------------------------------------------------------
// Implémentation
// ---------------------------------------------------------------------------

// ByDomain retourne la publication identifiée par sous-domaine ou domaine
// personnalisé, avec navigation, réseaux sociaux, catégories et articles
// publiés (tri createdAt DESC).
func (s *Service) ByDomain(ctx context.Context, domain string) (*PublicationDetail, error) {
	domain = strings.ToLower(strings.TrimSpace(domain))
	pub, err := s.publicationByDomain(ctx, domain)
	if err != nil {
		return nil, err
	}
	navs, err := s.navigation(ctx, pub.ID)
	if err != nil {
		return nil, err
	}
	pub.Navigation = navs
	socials, err := s.socialLinks(ctx, pub.ID)
	if err != nil {
		return nil, err
	}
	pub.SocialLinks = socials
	cats, err := s.categories(ctx, pub.ID)
	if err != nil {
		return nil, err
	}
	pub.Categories = cats
	articles, err := s.publishedArticles(ctx, pub.ID)
	if err != nil {
		return nil, err
	}
	pub.Articles = articles
	return pub, nil
}

// Article lit l'article d'une publication (par slug ou id, insensible à la
// casse) et renseigne les entitlements + interactions du viewer. Si l'article
// n'appartient pas à la publication mais que le propriétaire de celle-ci est
// un co-auteur ACCEPTED (attribution), l'article est résolu via l'attribution.
func (s *Service) Article(ctx context.Context, domain, slug, viewerID, viewerEmail string) (*ArticleBundle, error) {
	domain = strings.ToLower(strings.TrimSpace(domain))
	pub, err := s.publicationByDomain(ctx, domain)
	if err != nil {
		return nil, err
	}
	navs, err := s.navigation(ctx, pub.ID)
	if err != nil {
		return nil, err
	}
	pub.Navigation = navs
	socials, err := s.socialLinks(ctx, pub.ID)
	if err != nil {
		return nil, err
	}
	pub.SocialLinks = socials
	cats, err := s.categories(ctx, pub.ID)
	if err != nil {
		return nil, err
	}
	pub.Categories = cats

	bundle := &ArticleBundle{Publication: *pub}
	article, viaAttribution, err := s.articleBySlugOrID(ctx, pub.ID, slug, pub.User)
	if err != nil {
		return nil, err
	}
	bundle.Article = *article
	bundle.IsViaAttribution = viaAttribution
	if viaAttribution && pub.User != nil {
		attributionSlug, err := s.attributionCategorySlug(ctx, article.ID, pub.User.ID)
		if err == nil {
			bundle.AttributionCategorySlug = attributionSlug
		}
	}

	// Entitlements + interactions du lecteur (si identifié).
	if viewerID != "" || viewerEmail != "" {
		ent, err := s.subscriberEntitlements(ctx, pub.ID, viewerID, viewerEmail)
		if err == nil {
			bundle.Entitlements = ent
		}
		if viewerID != "" {
			bm, _ := s.isBookmarked(ctx, article.ID, viewerID)
			bundle.Bookmarked = bm
			followed, _ := s.isFollowed(ctx, pub.ID, viewerID)
			bundle.Followed = followed
		}
	}
	return bundle, nil
}

// ---------------------------------------------------------------------------
// Requêtes
// ---------------------------------------------------------------------------

func (s *Service) publicationByDomain(ctx context.Context, domain string) (*PublicationDetail, error) {
	var p PublicationDetail
	var userID, username *string
	var createdAt, updatedAt time.Time
	err := s.pool.QueryRow(ctx, `
		SELECT p.id, p.type, p.name, p.slug, p.bio, p."logoUrl", p."isCertified",
		       p.subdomain, p."customDomain", p."umamiWebsiteId", p."accentColor",
		       p."fontFamily", p."heroText", p."headerImageUrl", p."footerText",
		       p."themeMode", p."layoutStyle", p."allowIndexing",
		       p."allowPublicAnnotations", p."allowComments", p."seoTitle",
		       p."seoDescription", p."supportUrl", p."stripeAccountId",
		       p."createdAt", p."updatedAt", u.id, u.username
		FROM "Publication" p
		LEFT JOIN "User" u ON u."publicationId" = p.id
		WHERE lower(p.subdomain) = lower($1) OR lower(p."customDomain") = lower($1)
		LIMIT 1`, domain).Scan(
		&p.ID, &p.Type, &p.Name, &p.Slug, &p.Bio, &p.LogoURL, &p.IsCertified,
		&p.Subdomain, &p.CustomDomain, &p.UmamiWebsiteID, &p.AccentColor,
		&p.FontFamily, &p.HeroText, &p.HeaderImageURL, &p.FooterText,
		&p.ThemeMode, &p.LayoutStyle, &p.AllowIndexing,
		&p.AllowPublicAnnotations, &p.AllowComments, &p.SeoTitle,
		&p.SeoDescription, &p.SupportURL, &p.StripeAccountID,
		&createdAt, &updatedAt, &userID, &username)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, errNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("publication by domain: %w", err)
	}
	if userID != nil {
		p.User = &PublicationUser{ID: *userID, Username: username}
	}
	return &p, nil
}

func (s *Service) navigation(ctx context.Context, pubID string) ([]NavItem, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, label, url, "order", "isExternal", "publicationId", "parentId"
		FROM "NavigationItem"
		WHERE "publicationId" = $1 ORDER BY "order" ASC`, pubID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []NavItem{}
	for rows.Next() {
		var n NavItem
		if err := rows.Scan(&n.ID, &n.Label, &n.URL, &n.Order, &n.IsExternal,
			&n.PublicationID, &n.ParentID); err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

func (s *Service) socialLinks(ctx context.Context, pubID string) ([]SocialLinkItem, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, platform, url, "order", "publicationId" FROM "SocialLink"
		WHERE "publicationId" = $1 ORDER BY "order" ASC`, pubID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []SocialLinkItem{}
	for rows.Next() {
		var sl SocialLinkItem
		if err := rows.Scan(&sl.ID, &sl.Platform, &sl.URL, &sl.Order, &sl.PublicationID); err != nil {
			return nil, err
		}
		out = append(out, sl)
	}
	return out, rows.Err()
}

func (s *Service) categories(ctx context.Context, pubID string) ([]CategoryItem, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, name, slug FROM "Category"
		WHERE "publicationId" = $1 ORDER BY name ASC`, pubID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []CategoryItem{}
	for rows.Next() {
		var c CategoryItem
		if err := rows.Scan(&c.ID, &c.Name, &c.Slug); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *Service) publishedArticles(ctx context.Context, pubID string) ([]ArticleSummary, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT a.id, a.title, a.slug, a.content, a.published, a."isPremium",
		       a.visibility, a."readingTime", a."createdAt", a."categoryId",
		       c.id, c.name, c.slug
		FROM "Article" a
		LEFT JOIN "Category" c ON c.id = a."categoryId"
		WHERE a."publicationId" = $1 AND a.published = true
		ORDER BY a."createdAt" DESC`, pubID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ArticleSummary{}
	for rows.Next() {
		var a ArticleSummary
		var createdAt time.Time
		var catID, catName, catSlug *string
		if err := rows.Scan(&a.ID, &a.Title, &a.Slug, &a.Content, &a.Published, &a.IsPremium,
			&a.Visibility, &a.ReadingTime, &createdAt, &a.CategoryID, &catID, &catName, &catSlug); err != nil {
			return nil, err
		}
		a.CreatedAt = createdAt.Format(time.RFC3339)
		if catID != nil {
			a.Category = &CategoryItem{ID: *catID, Name: *catName, Slug: *catSlug}
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (s *Service) articleBySlugOrID(ctx context.Context, pubID, slug string, pubUser *PublicationUser) (*ArticleDetail, bool, error) {
	article, err := s.articleDirect(ctx, pubID, slug)
	if err == nil {
		return article, false, nil
	}
	if !errors.Is(err, errNotFound) {
		return nil, false, err
	}
	// Attribution fallback : le propriétaire de la publication est co-auteur.
	if pubUser != nil && pubUser.ID != "" {
		article, err := s.articleViaAttribution(ctx, slug, pubUser.ID)
		if err == nil {
			return article, true, nil
		}
	}
	return nil, false, errNotFound
}

func scanArticleDetail(row pgx.Row) (*ArticleDetail, error) {
	var a ArticleDetail
	var catID, catName, catSlug *string
	var authorName, authorUsername, authorLogo *string
	var createdAt time.Time
	err := row.Scan(&a.ID, &a.Title, &a.Slug, &a.Content, &a.Published, &a.Status,
		&a.IsPremium, &a.Visibility, &a.ReadingTime, &a.AllowPublicAnnotations,
		&a.AllowComments, &createdAt, &a.AuthorID,
		&catID, &catName, &catSlug, &authorName, &authorUsername, &authorLogo)
	if err != nil {
		return nil, err
	}
	a.CreatedAt = createdAt.Format(time.RFC3339)
	if catID != nil {
		a.Category = &CategoryItem{ID: *catID, Name: *catName, Slug: *catSlug}
	}
	a.Author = &AuthorInfo{ID: a.AuthorID, Name: authorName, Username: authorUsername, LogoURL: authorLogo}
	return &a, nil
}

const articleSelect = `
		SELECT a.id, a.title, a.slug, a.content, a.published, a.status,
		       a."isPremium", a.visibility, a."readingTime",
		       a."allowPublicAnnotations", a."allowComments", a."createdAt", a."authorId",
		       c.id, c.name, c.slug, au.name, au.username, au."logoUrl"
		FROM "Article" a
		LEFT JOIN "Category" c ON c.id = a."categoryId"
		LEFT JOIN "User" au ON au.id = a."authorId"`

func (s *Service) articleDirect(ctx context.Context, pubID, slug string) (*ArticleDetail, error) {
	row := s.pool.QueryRow(ctx, articleSelect+`
		WHERE a."publicationId" = $1 AND (lower(a.slug) = lower($2) OR a.id = $2)
		LIMIT 1`, pubID, slug)
	article, err := scanArticleDetail(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errNotFound
		}
		return nil, fmt.Errorf("article direct: %w", err)
	}
	return article, nil
}

func (s *Service) articleViaAttribution(ctx context.Context, slug, userID string) (*ArticleDetail, error) {
	row := s.pool.QueryRow(ctx, articleSelect+`
		WHERE (lower(a.slug) = lower($1) OR a.id = $1)
		  AND EXISTS (SELECT 1 FROM "ArticleAttribution" at
		              WHERE at."articleId" = a.id AND at."userId" = $2
		                AND at."consentStatus" = 'ACCEPTED' AND at."isVisible" = true)
		LIMIT 1`, slug, userID)
	article, err := scanArticleDetail(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errNotFound
		}
		return nil, fmt.Errorf("article attribution: %w", err)
	}
	return article, nil
}

func (s *Service) attributionCategorySlug(ctx context.Context, articleID, userID string) (*string, error) {
	var slug *string
	err := s.pool.QueryRow(ctx, `
		SELECT c.slug FROM "ArticleAttribution" at
		LEFT JOIN "Category" c ON c.id = at."categoryId"
		WHERE at."articleId" = $1 AND at."userId" = $2
		LIMIT 1`, articleID, userID).Scan(&slug)
	if err != nil {
		return nil, err
	}
	return slug, nil
}

func (s *Service) subscriberEntitlements(ctx context.Context, pubID, viewerID, viewerEmail string) (Entitlements, error) {
	var ent Entitlements
	var tierID *string
	var isActive, isPremium bool
	err := s.pool.QueryRow(ctx, `
		SELECT "isActive", "isPremium", "tierId" FROM "Subscriber"
		WHERE "publicationId" = $1
		  AND (("userId"::text = $2 AND $2 <> '') OR (lower(email) = lower($3) AND $3 <> ''))
		LIMIT 1`, pubID, viewerID, viewerEmail).Scan(&isActive, &isPremium, &tierID)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return ent, err
	}
	if err == nil && isActive {
		ent.IsMember = true
		ent.IsPaidSubscriber = isPremium
		if tierID != nil {
			ent.TierID = *tierID
		}
	}
	return ent, nil
}

func (s *Service) isBookmarked(ctx context.Context, articleID, viewerID string) (bool, error) {
	var one int
	err := s.pool.QueryRow(ctx,
		`SELECT 1 FROM "Bookmark" WHERE "articleId" = $1 AND "readerId" = $2 LIMIT 1`,
		articleID, viewerID).Scan(&one)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

func (s *Service) isFollowed(ctx context.Context, pubID, viewerID string) (bool, error) {
	var one int
	err := s.pool.QueryRow(ctx,
		`SELECT 1 FROM "Follows" WHERE "publicationId" = $1 AND "readerId" = $2 LIMIT 1`,
		pubID, viewerID).Scan(&one)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}
