// Package publications — identité tenant publique (remplacement des reads
// Prisma des pages apps/tenants).
//
// Résout la Publication (personnelle OU média) par sous-domaine/domaine
// personnalisé, avec sa navigation, ses réseaux sociaux, ses articles
// publiés et ses catégories. L'article d'une publication inclut l'auteur,
// la catégorie, les entitlements du lecteur (abonné) et ses interactions
// (bookmark + follow). Auth optionnelle : le viewer est lu du JWT.
package publishers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/identity"
	"github.com/qoefi/api/internal/modules/articles"
	pkgslug "github.com/qoefi/api/internal/slug"
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
	PublisherID string  `json:"publisherId"`
	ParentID      *string `json:"parentId"`
}

type SocialLinkItem struct {
	ID            string `json:"id"`
	Platform      string `json:"platform"`
	URL           string `json:"url"`
	Order         int32  `json:"order"`
	PublisherID string `json:"publisherId"`
}

type CategoryItem struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Slug        string  `json:"slug"`
	Description *string `json:"description,omitempty"`
	ParentID    *string `json:"parentId,omitempty"`
	ParentSlug  *string `json:"parentSlug,omitempty"`
	IsDefault   bool    `json:"isDefault"`
}

type OriginPublisherInfo struct {
	ID      string  `json:"id"`
	Name    string  `json:"name"`
	Slug    string  `json:"slug"`
	Type    string  `json:"type"`
	LogoURL *string `json:"logoUrl"`
}

type ArticleSummary struct {
	ID                string                 `json:"id"`
	Title             string                 `json:"title"`
	Slug              string                 `json:"slug"`
	Content           string                 `json:"content"`
	ImageURL          *string                `json:"imageUrl,omitempty"`
	Published         bool                   `json:"published"`
	IsPremium         bool                   `json:"isPremium"`
	Visibility        string                 `json:"visibility"`
	ReadingTime       int32                  `json:"readingTime"`
	CreatedAt         string                 `json:"createdAt"`
	CategoryID        *string                `json:"categoryId"`
	Category          *CategoryItem          `json:"category,omitempty"`
	OriginPublisher *OriginPublisherInfo `json:"originPublisher,omitempty"`
	// Compteurs d'engagement réels (alimentent le tri par popularité côté home).
	LikesCount    int `json:"likesCount"`
	CommentsCount int `json:"commentsCount"`
	RepostsCount  int `json:"repostsCount"`
}

type PublisherUser struct {
	ID       string  `json:"id"`
	Username *string `json:"username"`
	Name     *string `json:"name,omitempty"`
	LogoURL  *string `json:"logoUrl,omitempty"`
}

// PublicationDetail est la publication dénormalisée (header + home).
type PublisherDetail struct {
	ID                     string           `json:"id"`
	Type                   string           `json:"type"`
	Name                   string           `json:"name"`
	Slug                   string           `json:"slug"`
	Bio                    *string          `json:"bio"`
	LogoURL                *string          `json:"logoUrl"`
	IsCertified            bool             `json:"isCertified"`
	Subdomain              *string          `json:"subdomain"`
	CustomDomain           *string          `json:"customDomain"`
	UmamiWebsiteID         *string          `json:"umamiWebsiteId"`
	AccentColor            *string          `json:"accentColor"`
	FontFamily             *string          `json:"fontFamily"`
	HeroText               *string          `json:"heroText"`
	HeaderImageURL         *string          `json:"headerImageUrl"`
	FooterText             *string          `json:"footerText"`
	ThemeMode              *string          `json:"themeMode"`
	LayoutStyle            *string          `json:"layoutStyle"`
	AllowIndexing          bool             `json:"allowIndexing"`
	AllowPublicAnnotations bool             `json:"allowPublicAnnotations"`
	AllowComments          bool             `json:"allowComments"`
	SeoTitle               *string          `json:"seoTitle"`
	SeoDescription         *string          `json:"seoDescription"`
	SupportURL             *string          `json:"supportUrl"`
	StripeAccountID        *string          `json:"stripeAccountId"`
	Navigation             []NavItem        `json:"navigation"`
	SocialLinks            []SocialLinkItem `json:"socialLinks"`
	Categories             []CategoryItem   `json:"categories"`
	Articles               []ArticleSummary `json:"articles,omitempty"`
	User                   *PublisherUser `json:"user,omitempty"`
	SiteOptions            any              `json:"siteOptions,omitempty"`
	Team                   []TeamMemberItem `json:"team,omitempty"`
}

// TeamMemberItem est un contributeur / auteur de la publication.
type TeamMemberItem struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Username    *string `json:"username"`
	LogoURL     *string `json:"logoUrl"`
	Bio         *string `json:"bio,omitempty"`
	Role        string  `json:"role"`
	IsCertified bool    `json:"isCertified"`
}

// RecommendationItem est une publication recommandée par un créateur.
type RecommendationItem struct {
	ID                      string  `json:"id"`
	PublisherID           string  `json:"publisherId"`
	PublisherName         string  `json:"name"`
	PublisherSlug         string  `json:"slug"`
	PublisherSubdomain    *string `json:"subdomain"`
	PublisherCustomDomain *string `json:"customDomain"`
	PublisherBio          *string `json:"bio"`
	PublisherLogoURL      *string `json:"logoUrl"`
	Description             *string `json:"description"`
}

// AuthorInfo est l'auteur dénormalisé d'un article.
type AuthorInfo struct {
	ID       string  `json:"id"`
	Name     *string `json:"name"`
	Username *string `json:"username"`
	LogoURL  *string `json:"logoUrl"`
	// Type est la NATURE de l'identité (PERSONAL | MEDIA), pas le type de la
	// publication : c'est elle qui décide de la forme de l'avatar.
	Type string `json:"type"`
}

type ArticleDetail struct {
	ID         string  `json:"id"`
	Title      string  `json:"title"`
	Slug       string  `json:"slug"`
	Content    string  `json:"content"`
	ImageURL   *string `json:"imageUrl"`
	Published  bool    `json:"published"`
	Status     string  `json:"status"`
	IsPremium  bool    `json:"isPremium"`
	Visibility string  `json:"visibility"`
	// 🔒 Zéro-fuite : le contenu servi ici est DÉJÀ tronqué au paywall pour un
	// lecteur non autorisé. `accessGranted` doit être lu par les clients pour
	// ne PAS retronquer (le marqueur de coupure a disparu de la charge utile).
	IsTruncated            bool          `json:"isTruncated"`
	AccessGranted          bool          `json:"accessGranted"`
	ReadingTime            int32         `json:"readingTime"`
	AllowPublicAnnotations bool          `json:"allowPublicAnnotations"`
	AllowComments          bool          `json:"allowComments"`
	AllowDownload          bool          `json:"allowDownload"`
	SeoTitle               *string       `json:"seoTitle"`
	SeoDescription         *string       `json:"seoDescription"`
	CreatedAt              string               `json:"createdAt"`
	OriginArticleID        *string              `json:"originArticleId,omitempty"`
	CanonicalType          string               `json:"canonicalType,omitempty"`
	CanonicalURL           *string              `json:"canonicalUrl,omitempty"`
	OriginPublisher        *OriginPublisherInfo `json:"originPublisher,omitempty"`
	AuthorID               string               `json:"authorId"`
	Category               *CategoryItem `json:"category"`
	Author                 *AuthorInfo   `json:"author"`
	LikesCount             int           `json:"likesCount"`
	CommentsCount          int           `json:"commentsCount"`
	RepostsCount           int           `json:"repostsCount"`
	IsLiked                bool          `json:"isLiked"`
	IsReposted             bool          `json:"isReposted"`
}

type Entitlements struct {
	IsMember         bool   `json:"isMember"`
	IsPaidSubscriber bool   `json:"isPaidSubscriber"`
	TierID           string `json:"tierId,omitempty"`
}

// ArticleBundle est la réponse complète de la page article tenant.
type ArticleBundle struct {
	Publisher             PublisherDetail `json:"publisher"`
	Article                 ArticleDetail     `json:"article"`
	Entitlements            Entitlements      `json:"entitlements"`
	Bookmarked              bool              `json:"bookmarked"`
	Followed                bool              `json:"followed"`
	IsViaAttribution        bool              `json:"isViaAttribution"`
	AttributionCategorySlug *string           `json:"attributionCategorySlug"`
}

// ---------------------------------------------------------------------------
// Implémentation
// ---------------------------------------------------------------------------

// ByDomain retourne la publication identifiée par sous-domaine ou domaine
// personnalisé, avec navigation, réseaux sociaux, catégories et articles
// publiés (tri createdAt DESC).
func (s *Service) ByDomain(ctx context.Context, domain string) (*PublisherDetail, error) {
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
	if team, err := s.teamMembers(ctx, pub); err == nil {
		pub.Team = team
	}
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

	bundle := &ArticleBundle{Publisher: *pub}
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
	if bundle.Article.OriginArticleID != nil && *bundle.Article.OriginArticleID != "" {
		var orig OriginPublisherInfo
		if err := s.pool.QueryRow(ctx, `
			SELECT p.id, p.name, p.slug, p.type::text, p."logoUrl"
			FROM "Article" a
			JOIN "Publisher" p ON p.id = a."publisherId"
			WHERE a.id = $1
		`, *bundle.Article.OriginArticleID).Scan(&orig.ID, &orig.Name, &orig.Slug, &orig.Type, &orig.LogoURL); err == nil {
			bundle.Article.OriginPublisher = &orig
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

	// Compteurs d'engagement réels
	var repostsCount int
	_ = s.pool.QueryRow(ctx, `SELECT count(*) FROM "Post" WHERE "quotedArticleId" = $1`, article.ID).Scan(&repostsCount)
	bundle.Article.RepostsCount = repostsCount

	var commentsCount int
	_ = s.pool.QueryRow(ctx, `SELECT count(*) FROM "ArticleComment" WHERE "articleId" = $1`, article.ID).Scan(&commentsCount)
	bundle.Article.CommentsCount = commentsCount

	var likesCount int
	_ = s.pool.QueryRow(ctx, `SELECT count(*) FROM "ContentFeedback" WHERE "articleId" = $1 AND "type" = 'LIKE'`, article.ID).Scan(&likesCount)
	bundle.Article.LikesCount = likesCount

	if viewerID != "" {
		var isReposted bool
		_ = s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM "Post" WHERE "authorId" = $1 AND "quotedArticleId" = $2 AND ("content" IS NULL OR "content" = ''))`, viewerID, article.ID).Scan(&isReposted)
		bundle.Article.IsReposted = isReposted

		var isLiked bool
		_ = s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM "ContentFeedback" WHERE "userId"::text = $1 AND "articleId" = $2 AND "type" = 'LIKE')`, viewerID, article.ID).Scan(&isLiked)
		bundle.Article.IsLiked = isLiked
	}

	// 🔒 Zéro-fuite : cette route est PUBLIQUE (lecture anonyme du site tenant).
	// Le passage réservé d'un article verrouillé ne doit donc JAMAIS franchir
	// la frontière HTTP, même pour un appel direct à l'API qui contournerait le
	// rendu Next. Les entitlements sont résolus avant la coupure (l'auteur voit
	// toujours son propre article en entier).
	access := bundle.Entitlements
	cut := articles.SliceContentAtPaywall(
		bundle.Article.Content,
		articles.UserEntitlements{
			IsMember:         access.IsMember,
			IsPaidSubscriber: access.IsPaidSubscriber || (viewerID != "" && viewerID == bundle.Article.AuthorID),
		},
		bundle.Article.Visibility,
		nil,
	)
	bundle.Article.Content = cut.Content
	bundle.Article.IsTruncated = cut.IsTruncated
	bundle.Article.AccessGranted = cut.AccessGranted
	return bundle, nil
}

// ---------------------------------------------------------------------------
// Requêtes
// ---------------------------------------------------------------------------

// reservedTLSSubdomains utilise déjà un certificat statique dédié : inutile
// (et interdit) de leur émettre un certificat on-demand.
var reservedTLSSubdomains = map[string]bool{
	"admin": true, "api": true, "auth": true, "cdn": true,
	"hi": true, "studio": true, "umami": true,
}

// AllowTLS dit à Caddy si un certificat on-demand peut être émis. Seuls
// updates.qoe.fi et les sous-domaines rattachés à une publication existante
// sont autorisés : les typos, scans et sous-domaines inventés sont refusés
// avant tout appel à Let's Encrypt.
func (s *Service) AllowTLS(ctx context.Context, domain string) (bool, error) {
	clean := strings.ToLower(strings.TrimSpace(domain))
	if clean == "updates.qoe.fi" {
		return true, nil
	}
	if !strings.HasSuffix(clean, ".qoe.fi") {
		return false, nil
	}
	sub := strings.TrimSuffix(clean, ".qoe.fi")
	if sub == "" || strings.Contains(sub, ".") || reservedTLSSubdomains[sub] {
		return false, nil
	}
	var exists bool
	err := s.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM "Publisher" WHERE lower(subdomain) = $1)`, sub).Scan(&exists)
	if err != nil {
		return false, err
	}
	return exists, nil
}

func (s *Service) publicationByDomain(ctx context.Context, domain string) (*PublisherDetail, error) {
	clean := strings.TrimSpace(domain)
	sub := clean
	for _, suffix := range []string{".qoe.fi", ".qoe.test", ".localhost", ":15403", ":80", ":443"} {
		sub = strings.TrimSuffix(sub, suffix)
	}

	var p PublisherDetail
	var userID, username, userName, userLogo *string
	var createdAt, updatedAt time.Time
	var siteOptionsBytes []byte
	err := s.pool.QueryRow(ctx, `
		SELECT p.id, p.type, p.name, p.slug, p.bio, p."logoUrl", p."isCertified",
		       p.subdomain, p."customDomain", p."umamiWebsiteId", p."accentColor",
		       p."fontFamily", p."heroText", p."headerImageUrl", p."footerText",
		       p."themeMode", p."layoutStyle", p."allowIndexing",
		       p."allowPublicAnnotations", p."allowComments", p."seoTitle",
		       p."seoDescription", p."supportUrl", p."stripeAccountId",
		       p."siteOptions",
		       p."createdAt", p."updatedAt", u.id, u.username, u.name, u."logoUrl"
		FROM "Publisher" p
		LEFT JOIN "User" u ON u."publisherId" = p.id
		WHERE lower(p.subdomain) = lower($1) OR lower(p.subdomain) = lower($2) OR lower(p."customDomain") = lower($1) OR lower(p.slug) = lower($1)
		LIMIT 1`, clean, sub).Scan(
		&p.ID, &p.Type, &p.Name, &p.Slug, &p.Bio, &p.LogoURL, &p.IsCertified,
		&p.Subdomain, &p.CustomDomain, &p.UmamiWebsiteID, &p.AccentColor,
		&p.FontFamily, &p.HeroText, &p.HeaderImageURL, &p.FooterText,
		&p.ThemeMode, &p.LayoutStyle, &p.AllowIndexing,
		&p.AllowPublicAnnotations, &p.AllowComments, &p.SeoTitle,
		&p.SeoDescription, &p.SupportURL, &p.StripeAccountID,
		&siteOptionsBytes,
		&createdAt, &updatedAt, &userID, &username, &userName, &userLogo)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, errNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("publication by domain: %w", err)
	}
	if len(siteOptionsBytes) > 0 {
		var so any
		if jsonErr := json.Unmarshal(siteOptionsBytes, &so); jsonErr == nil {
			p.SiteOptions = so
		}
	}
	if userID != nil {
		p.User = &PublisherUser{ID: *userID, Username: username, Name: userName, LogoURL: userLogo}
	}
	return &p, nil
}

func (s *Service) navigation(ctx context.Context, pubID string) ([]NavItem, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, label, url, "order", "isExternal", "publisherId", "parentId"
		FROM "NavigationItem"
		WHERE "publisherId" = $1 ORDER BY "order" ASC`, pubID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []NavItem{}
	for rows.Next() {
		var n NavItem
		if err := rows.Scan(&n.ID, &n.Label, &n.URL, &n.Order, &n.IsExternal,
			&n.PublisherID, &n.ParentID); err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

func (s *Service) socialLinks(ctx context.Context, pubID string) ([]SocialLinkItem, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, platform, url, "order", "publisherId" FROM "SocialLink"
		WHERE "publisherId" = $1 ORDER BY "order" ASC`, pubID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []SocialLinkItem{}
	for rows.Next() {
		var sl SocialLinkItem
		if err := rows.Scan(&sl.ID, &sl.Platform, &sl.URL, &sl.Order, &sl.PublisherID); err != nil {
			return nil, err
		}
		out = append(out, sl)
	}
	return out, rows.Err()
}

func (s *Service) categories(ctx context.Context, pubID string) ([]CategoryItem, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, name, slug, description, "parentId", "isDefault" FROM "Category"
		WHERE "publisherId" = $1 ORDER BY "isDefault" ASC, name ASC`, pubID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []CategoryItem{}
	for rows.Next() {
		var c CategoryItem
		if err := rows.Scan(&c.ID, &c.Name, &c.Slug, &c.Description, &c.ParentID, &c.IsDefault); err != nil {
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
		       c.id, c.name, c.slug, COALESCE(c."isDefault", false), cp.slug, a."imageUrl",
		       (SELECT count(*) FROM "ContentFeedback" f WHERE f."articleId" = a.id AND f."type" = 'LIKE') AS likes,
		       (SELECT count(*) FROM "ArticleComment" ac WHERE ac."articleId" = a.id) AS comments,
		       (SELECT count(*) FROM "Post" p WHERE p."quotedArticleId" = a.id) AS reposts,
		       a."publisherId", ap.name, ap.slug, ap.type::text, ap."logoUrl"
		FROM "Article" a
		LEFT JOIN "Publisher" ap ON ap.id = a."publisherId"
		LEFT JOIN "Category" c ON c.id = a."categoryId"
		LEFT JOIN "Category" cp ON cp.id = c."parentId"
		WHERE a.published = true
		  AND (
		    a."publisherId" = $1
		    OR EXISTS (
		      SELECT 1
		      FROM "Publisher" tp
		      JOIN "User" tu ON tu."publisherId" = tp.id
		      WHERE tp.id = $1
		        AND tp.type = 'PERSONAL'
		        AND (
		          (a."authorId" = tu.id AND a."showOnPersonalProfile" = true)
		          OR EXISTS (
		            SELECT 1
		            FROM "ArticleAttribution" aa
		            WHERE aa."articleId" = a.id
		              AND aa."userId" = tu.id
		              AND aa."consentStatus" = 'ACCEPTED'
		              AND aa."isVisible" = true
		              AND aa.role IN ('PRIMARY_AUTHOR', 'CO_AUTHOR')
		              AND (a."authorId" <> tu.id OR a."showOnPersonalProfile" = true)
		          )
		        )
		    )
		  )
		ORDER BY a."createdAt" DESC`, pubID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ArticleSummary{}
	for rows.Next() {
		var a ArticleSummary
		var createdAt time.Time
		var catID, catName, catSlug, catParentSlug *string
		var catIsDefault bool
		var artPubID string
		var artPubName, artPubSlug, artPubType, artPubLogo *string
		if err := rows.Scan(&a.ID, &a.Title, &a.Slug, &a.Content, &a.Published, &a.IsPremium,
			&a.Visibility, &a.ReadingTime, &createdAt, &a.CategoryID, &catID, &catName, &catSlug,
			&catIsDefault, &catParentSlug, &a.ImageURL,
			&a.LikesCount, &a.CommentsCount, &a.RepostsCount,
			&artPubID, &artPubName, &artPubSlug, &artPubType, &artPubLogo); err != nil {
			return nil, err
		}
		// 🔒 Zéro-fuite : la liste d'articles publiés alimente les cartes de la
		// home tenant, servie à des visiteurs anonymes. On tronque au paywall
		// avant de sérialiser (l'extrait rendu ne peut donc jamais exposer le
		// passage réservé).
		a.Content = articles.SliceContentAtPaywall(
			a.Content, articles.UserEntitlements{}, a.Visibility, nil,
		).Content
		a.CreatedAt = createdAt.Format(time.RFC3339)
		if catID != nil {
			a.Category = &CategoryItem{
				ID: *catID, Name: *catName, Slug: *catSlug,
				ParentSlug: catParentSlug, IsDefault: catIsDefault,
			}
		}
		if artPubID != "" && artPubID != pubID && artPubName != nil && artPubSlug != nil && artPubType != nil {
			a.OriginPublisher = &OriginPublisherInfo{
				ID:      artPubID,
				Name:    *artPubName,
				Slug:    *artPubSlug,
				Type:    *artPubType,
				LogoURL: artPubLogo,
			}
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (s *Service) articleBySlugOrID(ctx context.Context, pubID, slug string, pubUser *PublisherUser) (*ArticleDetail, bool, error) {
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
	var catID, catName, catSlug, catParentSlug *string
	var catIsDefault bool
	var authorName, authorUsername, authorLogo, publisherLogo *string
	var publicationType string
	var imageURL, seoTitle, seoDescription, originArticleID, canonicalURL *string
	var canonicalType string
	var createdAt time.Time
	err := row.Scan(&a.ID, &a.Title, &a.Slug, &a.Content, &a.Published, &a.Status,
		&a.IsPremium, &a.Visibility, &a.ReadingTime, &a.AllowPublicAnnotations,
		&a.AllowComments, &a.AllowDownload, &seoTitle, &seoDescription,
		&createdAt, &a.AuthorID, &imageURL,
		&originArticleID, &canonicalType, &canonicalURL,
		&catID, &catName, &catSlug, &catIsDefault, &catParentSlug,
		&authorName, &authorUsername, &authorLogo, &publicationType, &publisherLogo)
	if err != nil {
		return nil, err
	}
	a.CreatedAt = createdAt.Format(time.RFC3339)
	a.ImageURL = imageURL
	a.SeoTitle = seoTitle
	a.SeoDescription = seoDescription
	a.OriginArticleID = originArticleID
	a.CanonicalType = canonicalType
	a.CanonicalURL = canonicalURL
	if catID != nil {
		a.Category = &CategoryItem{
			ID: *catID, Name: *catName, Slug: *catSlug,
			ParentSlug: catParentSlug, IsDefault: catIsDefault,
		}
	}
	pubType := identity.FromPublisherType(publicationType)
	a.Author = &AuthorInfo{
		ID: a.AuthorID, Name: authorName, Username: authorUsername, LogoURL: authorLogo,
		Type: pubType,
	}
	return &a, nil
}

const articleSelect = `
	SELECT a.id, a.title, a.slug, a.content, a.published, a.status,
	       a."isPremium", a.visibility, a."readingTime",
	       a."allowPublicAnnotations", a."allowComments", a."allowDownload",
	       a."seoTitle", a."seoDescription", a."createdAt", a."authorId", a."imageUrl",
	       a."originArticleId", a."canonicalType", a."canonicalUrl",
	       c.id, c.name, c.slug, COALESCE(c."isDefault", false), cp.slug,
	       au.name, au.username, au."logoUrl",
	       p.type, p."logoUrl"
		FROM "Article" a
		JOIN "Publisher" p ON p.id = a."publisherId"
		LEFT JOIN "Category" c ON c.id = a."categoryId"
		LEFT JOIN "Category" cp ON cp.id = c."parentId"
		LEFT JOIN "User" au ON au.id = a."authorId"`

func (s *Service) resolveArticleWithFallbacks(ctx context.Context, scopeCond, scopeArg, slugOrID, errLabel string) (*ArticleDetail, error) {
	run := func(matchCond, param string) (*ArticleDetail, error) {
		row := s.pool.QueryRow(ctx,
			articleSelect+` WHERE (`+matchCond+`) AND `+scopeCond+` LIMIT 1`,
			param, scopeArg)
		article, err := scanArticleDetail(row)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, errNotFound
			}
			return nil, fmt.Errorf("%s: %w", errLabel, err)
		}
		return article, nil
	}

	// 1. Slug canonique ou ID direct.
	if art, err := run(`lower(a.slug) = lower($1) OR a.id = $1`, slugOrID); err == nil || !errors.Is(err, errNotFound) {
		return art, err
	}
	// 2. Code court numérique extrait du suffixe (ex. mon-article-810839 → 810839).
	if shortCode := pkgslug.ExtractTrailingShortCode(slugOrID); shortCode != "" {
		if art, err := run(`a."shortCode" = $1`, shortCode); err == nil || !errors.Is(err, errNotFound) {
			return art, err
		}
	}
	// 3. Slugs personnalisés (ArticleSlug) ou historique des slugs (ArticleSlugHistory).
	return run(`EXISTS (SELECT 1 FROM "ArticleSlug" s WHERE lower(s.slug) = lower($1) AND s."articleId" = a.id)
		OR EXISTS (SELECT 1 FROM "ArticleSlugHistory" h WHERE lower(h.slug) = lower($1) AND h."articleId" = a.id)`, slugOrID)
}

func (s *Service) articleDirect(ctx context.Context, pubID, slug string) (*ArticleDetail, error) {
	return s.resolveArticleWithFallbacks(
		ctx,
		`a."publisherId" = $2 AND (a."isClaimed" = true OR a."isAuthorSovereignCopy" = false)`,
		pubID,
		slug,
		"article direct",
	)
}

func (s *Service) articleViaAttribution(ctx context.Context, slug, userID string) (*ArticleDetail, error) {
	return s.resolveArticleWithFallbacks(
		ctx,
		`(
		    (a."authorId" = $2 AND a."showOnPersonalProfile" = true)
		    OR EXISTS (SELECT 1 FROM "ArticleAttribution" at
		               WHERE at."articleId" = a.id AND at."userId" = $2
		                 AND at."consentStatus" = 'ACCEPTED' AND at."isVisible" = true
		                 AND at.role IN ('PRIMARY_AUTHOR', 'CO_AUTHOR')
		                 AND (a."authorId" <> $2 OR a."showOnPersonalProfile" = true))
		  )`,
		userID,
		slug,
		"article attribution",
	)
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
		WHERE "publisherId" = $1
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
		`SELECT 1 FROM "Follows" WHERE "publisherId" = $1 AND "readerId" = $2 LIMIT 1`,
		pubID, viewerID).Scan(&one)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

// Recommendations retourne les publications recommandées par le créateur.
func (s *Service) Recommendations(ctx context.Context, domain string) ([]RecommendationItem, error) {
	domain = strings.ToLower(strings.TrimSpace(domain))
	pub, err := s.publicationByDomain(ctx, domain)
	if err != nil {
		return nil, err
	}
	rows, err := s.pool.Query(ctx, `
		SELECT r.id, r."description", p.id, p.name, p.slug, p.subdomain, p."customDomain", p.bio, p."logoUrl"
		FROM "Recommendation" r
		JOIN "Publisher" p ON p.id = r."recommendedId"
		WHERE r."recommenderId" = $1
		ORDER BY r."createdAt" DESC
	`, pub.ID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]RecommendationItem, 0)
	for rows.Next() {
		var item RecommendationItem
		var desc, sub, custom, bio, logo *string
		if err := rows.Scan(&item.ID, &desc, &item.PublisherID, &item.PublisherName, &item.PublisherSlug, &sub, &custom, &bio, &logo); err != nil {
			return nil, err
		}
		item.Description = desc
		item.PublisherSubdomain = sub
		item.PublisherCustomDomain = custom
		item.PublisherBio = bio
		item.PublisherLogoURL = logo
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *Service) teamMembers(ctx context.Context, pub *PublisherDetail) ([]TeamMemberItem, error) {
	membersMap := make(map[string]TeamMemberItem)

	// 1. Owner / Créateur principal
	if pub.User != nil && pub.User.ID != "" {
		var uName, uUsername, uLogo *string
		var isCert bool
		err := s.pool.QueryRow(ctx, `
			SELECT name, username, "logoUrl", "isCertified"
			FROM "User" WHERE id = $1`, pub.User.ID).Scan(&uName, &uUsername, &uLogo, &isCert)
		if err == nil {
			displayName := pub.Name
			if uName != nil && *uName != "" {
				displayName = *uName
			}
			role := "Fondateur & Auteur"
			if pub.Type == "MEDIA" {
				role = "Direction de la publication"
			}
			membersMap[pub.User.ID] = TeamMemberItem{
				ID:          pub.User.ID,
				Name:        displayName,
				Username:    uUsername,
				LogoURL:     uLogo,
				Bio:         pub.Bio,
				Role:        role,
				IsCertified: isCert || pub.IsCertified,
			}
		}
	}

	// 2. Si Média, membres d'équipe actifs
	if pub.Type == "MEDIA" {
		rows, err := s.pool.Query(ctx, `
			SELECT u.id, u.name, u.username, u."logoUrl", u."isCertified", mm.role
			FROM "Media" m
			JOIN "MediaMember" mm ON mm."mediaId" = m.id AND mm.status = 'active'
			JOIN "User" u ON u.id = mm."userId"
			WHERE m."publisherId" = $1
			ORDER BY mm."joinedAt" ASC`, pub.ID)
		if err == nil {
			for rows.Next() {
				var uid string
				var name, username, logo *string
				var isCert bool
				var role string
				if scanErr := rows.Scan(&uid, &name, &username, &logo, &isCert, &role); scanErr == nil {
					displayName := uid
					if name != nil && *name != "" {
						displayName = *name
					} else if username != nil && *username != "" {
						displayName = *username
					}
					cleanRole := "Rédacteur régulier"
					switch role {
					case "owner", "admin":
						cleanRole = "Rédacteur en chef"
					case "writer", "editor":
						cleanRole = "Rédacteur régulier"
					case "contributor":
						cleanRole = "Contributeur"
					}
					membersMap[uid] = TeamMemberItem{
						ID:          uid,
						Name:        displayName,
						Username:    username,
						LogoURL:     logo,
						Role:        cleanRole,
						IsCertified: isCert,
					}
				}
			}
			rows.Close()
		}
	}

	// 3. Auteurs des articles publiés
	rows, err := s.pool.Query(ctx, `
		SELECT DISTINCT u.id, u.name, u.username, u."logoUrl", u."isCertified"
		FROM "Article" a
		JOIN "User" u ON u.id = a."authorId"
		WHERE a."publisherId" = $1 AND a.published = true
		LIMIT 15`, pub.ID)
	if err == nil {
		for rows.Next() {
			var uid string
			var name, username, logo *string
			var isCert bool
			if scanErr := rows.Scan(&uid, &name, &username, &logo, &isCert); scanErr == nil {
				if _, exists := membersMap[uid]; !exists {
					displayName := uid
					if name != nil && *name != "" {
						displayName = *name
					} else if username != nil && *username != "" {
						displayName = *username
					}
					membersMap[uid] = TeamMemberItem{
						ID:          uid,
						Name:        displayName,
						Username:    username,
						LogoURL:     logo,
						Role:        "Auteur",
						IsCertified: isCert,
					}
				}
			}
		}
		rows.Close()
	}

	if len(membersMap) == 0 {
		// Repli : une publication sans aucun auteur (pas d'utilisateur lié,
		// pas d'article publié) reste rendable. Lire pub.User sans garde
		// faisait paniquer la home tenant en 500 (nil pointer).
		fallback := TeamMemberItem{
			ID:          pub.ID,
			Name:        pub.Name,
			LogoURL:     pub.LogoURL,
			Bio:         pub.Bio,
			Role:        "Auteur",
			IsCertified: pub.IsCertified,
		}
		if pub.User != nil {
			fallback.Username = pub.User.Username
		}
		return []TeamMemberItem{fallback}, nil
	}

	out := make([]TeamMemberItem, 0, len(membersMap))
	if pub.User != nil && pub.User.ID != "" {
		if owner, ok := membersMap[pub.User.ID]; ok {
			out = append(out, owner)
			delete(membersMap, pub.User.ID)
		}
	}
	for _, m := range membersMap {
		out = append(out, m)
	}
	return out, nil
}
