package feed

// ─────────────────────────────────────────────────────────────────────────────
// Réhydratation du feed « Pour vous » — remplace la réhydratation Prisma
// (prisma.article.findMany + prisma.thought.findMany + buildFeedSlices) côté
// Next. Le moteur classe (PersonalizedEngine → ids) puis POST /v1/feed/hydrate
// renvoie les enregistrements complets dans le shape consommé par vector-feed.
// ─────────────────────────────────────────────────────────────────────────────

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/eligibility"
	"github.com/qoefi/api/internal/identity"
	"github.com/qoefi/api/internal/modules/posts"
)

// HydrateAuthor est un auteur dénormalisé (parité Prisma select author/coAuthors).
type HydrateAuthor struct {
	ID          string  `json:"id"`
	Name        *string `json:"name"`
	Username    *string `json:"username"`
	LogoURL     *string `json:"logoUrl"`
	IsCertified bool    `json:"isCertified"`
	// Type (PERSONAL | MEDIA) est la nature de l'identité. Le feed la transmet
	// telle quelle pour que l'avatar soit dérivé des données, pas du composant.
	Type string `json:"type"`
}

// HydratePublication est la publication dénormalisée complète (parité
// publicationProfileSelect du client — inclut customDomain/heroText/isCertified).
type HydratePublication struct {
	ID           string  `json:"id"`
	Type         string  `json:"type"`
	Name         string  `json:"name"`
	Slug         string  `json:"slug"`
	Subdomain    *string `json:"subdomain"`
	CustomDomain *string `json:"customDomain"`
	LogoURL      *string `json:"logoUrl"`
	HeroText     *string `json:"heroText"`
	IsCertified  bool    `json:"isCertified"`
}

// HydrateAttribution est une attribution d'article (parité Prisma attributions).
type HydrateAttribution struct {
	User          HydrateAuthor `json:"user"`
	Role          string        `json:"role"`
	Order         int           `json:"order"`
	IsVisible     bool          `json:"isVisible"`
	ConsentStatus string        `json:"consentStatus"`
}

// HydrateArticle est un article complet du lecteur (parité ArticleWithDetails
// minimal — les champs lus par mapArticleToFeedItem / FeedDashboard).
type HydrateArticle struct {
	ID                     string               `json:"id"`
	Title                  string               `json:"title"`
	Slug                   string               `json:"slug"`
	Content                string               `json:"content"`
	ImageURL               *string              `json:"imageUrl"`
	Published              bool                 `json:"published"`
	IsPremium              bool                 `json:"isPremium"`
	Visibility             string               `json:"visibility"`
	ReadingTime            int                  `json:"readingTime"`
	Status                 string               `json:"status"`
	CompletionRate         float64              `json:"completionRate"`
	SemanticTags           []string             `json:"semanticTags"`
	AllowPublicAnnotations bool                 `json:"allowPublicAnnotations"`
	AllowComments          bool                 `json:"allowComments"`
	ScheduledAt            *string              `json:"scheduledAt"`
	PublicationID          string               `json:"publicationId"`
	AuthorID               string               `json:"authorId"`
	CategoryID             *string              `json:"categoryId"`
	TierID                 *string              `json:"tierId"`
	SeoTitle               *string              `json:"seoTitle"`
	SeoDescription         *string              `json:"seoDescription"`
	CreatedAt              string               `json:"createdAt"`
	UpdatedAt              string               `json:"updatedAt"`
	Author                 HydrateAuthor        `json:"author"`
	Publication            HydratePublication   `json:"publication"`
	CoAuthors              []HydrateAuthor      `json:"coAuthors"`
	Attributions           []HydrateAttribution `json:"attributions"`
	Capabilities           ArticleCapabilities  `json:"capabilities"`
}

// ArticleCapabilities regroupe les droits d'action calculés par le serveur
// pour le viewer courant sur un article (commentaires, annotations, actions
// sociales). Le front les consomme déclarativement.
type ArticleCapabilities struct {
	CanComment     bool `json:"canComment"`
	CanAnnotate    bool `json:"canAnnotate"`
	CanBookmark    bool `json:"canBookmark"`
	CanReport      bool `json:"canReport"`
	CanMuteAuthor  bool `json:"canMuteAuthor"`
	CanBlockAuthor bool `json:"canBlockAuthor"`
	IsSelf         bool `json:"isSelf"`
}

// HydrateResult est la réponse de POST /v1/feed/hydrate.
type HydrateResult struct {
	Articles []HydrateArticle  `json:"articles"`
	Thoughts []posts.FeedSlice `json:"thoughts"`
}

// HydrateArticles charge les articles complets pour les ids du moteur.
// Le viewer est indispensable : sans lui, un ID connu suffirait à lire un
// brouillon, un article programmé, un compte privé ou un contenu d'un compte
// bloqué. Le contenu premium reste tronqué plus bas.
func (s *Service) HydrateArticles(ctx context.Context, articleIDs []string, viewerID string) ([]HydrateArticle, error) {
	if len(articleIDs) == 0 {
		return []HydrateArticle{}, nil
	}
	// Passe 2 : les mêmes verrous d'éligibilité que les flux d'IDs. Un
	// identifiant pré-calculé en cache ne doit jamais contourner un blocage,
	// une sourdine ou un mot masqué activé depuis le classement.
	eligible := eligibility.ArticlePredicates(eligibility.Aliases{
		Entity:      "a",
		Authors:     []string{"u.id", "po.id"},
		Publication: `a."publicationId"`,
		Viewer:      "$2",
	})
	rows, err := s.pool.Query(ctx, `
		SELECT a.id, a.title, a.slug, a.content, a."imageUrl", a.published, a."isPremium",
		       a.visibility, a."readingTime", a.status, a."completionRate", a."semanticTags",
		       a."allowPublicAnnotations", a."allowComments", a."scheduledAt",
		       a."publicationId", a."authorId", a."categoryId", a."tierId",
		       a."seoTitle", a."seoDescription", a."createdAt", a."updatedAt",
		       u.id::text, u.name, u.username, u."logoUrl", u."isCertified",
		       p.id, p.type, p.name, p.slug, p.subdomain, p."customDomain", p."logoUrl", p."heroText", p."isCertified"
		FROM "Article" a
		JOIN "User" u ON u.id = a."authorId"
		JOIN "Publication" p ON p.id = a."publicationId"
		LEFT JOIN LATERAL (
		  SELECT owner.id AS id
		  FROM "Publication" pv
		  JOIN "User" owner ON owner."publicationId" = pv.id
		  WHERE pv.id = a."publicationId"
		  LIMIT 1
		) po ON true
		WHERE a.id = ANY($1::text[])
		  AND a.published = true
		  AND (a."scheduledAt" IS NULL OR a."scheduledAt" <= now())`+eligible+`
		  AND (
		    COALESCE((SELECT us."profileVisibility" FROM "UserSettings" us
		              WHERE us."userId" = COALESCE(po.id, u.id)), 'PUBLIC') = 'PUBLIC'
		    OR u.id = $2
		    OR po.id = $2
		    OR EXISTS (SELECT 1 FROM "Follows" f WHERE f."readerId" = $2 AND f."publicationId" = a."publicationId")
		    OR EXISTS (SELECT 1 FROM "_CoAuthors" ca WHERE ca."A" = a.id AND ca."B" = $2)
		  )`, articleIDs, toUUID(viewerID))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	articles := map[string]*HydrateArticle{}
	var order []string
	for rows.Next() {
		var a HydrateArticle
		var img, cat, tier, seoTitle, seoDesc *string
		var scheduled pgtype.Timestamp
		var createdAt, updatedAt pgtype.Timestamp
		var authorName, authorUsername, authorLogo *string
		var pubSubdomain, pubCustomDomain, pubLogo, pubHero *string
		if err := rows.Scan(
			&a.ID, &a.Title, &a.Slug, &a.Content, &img, &a.Published, &a.IsPremium,
			&a.Visibility, &a.ReadingTime, &a.Status, &a.CompletionRate, &a.SemanticTags,
			&a.AllowPublicAnnotations, &a.AllowComments, &scheduled,
			&a.PublicationID, &a.AuthorID, &cat, &tier,
			&seoTitle, &seoDesc, &createdAt, &updatedAt,
			&a.Author.ID, &authorName, &authorUsername, &authorLogo, &a.Author.IsCertified,
			&a.Publication.ID, &a.Publication.Type, &a.Publication.Name, &a.Publication.Slug,
			&pubSubdomain, &pubCustomDomain, &pubLogo, &pubHero, &a.Publication.IsCertified,
		); err != nil {
			continue
		}
		a.ImageURL = img
		a.CategoryID = cat
		a.TierID = tier
		a.SeoTitle = seoTitle
		a.SeoDescription = seoDesc
		// 🔒 Zéro-fuite : POST /v1/feed/hydrate est public (visiteur anonyme),
		// le contenu premium au-delà du marqueur ne doit jamais être transmis.
		a.Content = truncatePaywall(a.Content, db.ContentVisibility(a.Visibility), tier)
		if scheduled.Valid {
			v := scheduled.Time.Format(time.RFC3339)
			a.ScheduledAt = &v
		}
		a.CreatedAt = createdAt.Time.Format(time.RFC3339)
		a.UpdatedAt = updatedAt.Time.Format(time.RFC3339)
		a.Author.Name = authorName
		a.Author.Username = authorUsername
		a.Author.LogoURL = authorLogo
		a.Author.Type = identity.FromPublicationType(a.Publication.Type)
		a.Publication.Subdomain = pubSubdomain
		a.Publication.CustomDomain = pubCustomDomain
		a.Publication.LogoURL = pubLogo
		a.Publication.HeroText = pubHero
		a.CoAuthors = []HydrateAuthor{}
		a.Attributions = []HydrateAttribution{}
		isSelf := viewerID != "" && viewerID == a.AuthorID
		a.Capabilities = ArticleCapabilities{
			CanComment:     a.AllowComments,
			CanAnnotate:    a.AllowPublicAnnotations,
			CanBookmark:    viewerID != "",
			CanReport:      !isSelf,
			CanMuteAuthor:  viewerID != "" && !isSelf,
			CanBlockAuthor: viewerID != "" && !isSelf,
			IsSelf:         isSelf,
		}
		articles[a.ID] = &a
		order = append(order, a.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Co-auteurs (batch).
	if crows, err := s.pool.Query(ctx, `
		SELECT ca."A", u.id::text, u.name, u.username, u."logoUrl", u."isCertified"
		FROM "_CoAuthors" ca JOIN "User" u ON u.id = ca."B"
		WHERE ca."A" = ANY($1::text[])`, articleIDs); err == nil {
		for crows.Next() {
			var artID string
			var au HydrateAuthor
			if err := crows.Scan(&artID, &au.ID, &au.Name, &au.Username, &au.LogoURL, &au.IsCertified); err == nil {
				au.Type = identity.Personal
				if a, ok := articles[artID]; ok {
					a.CoAuthors = append(a.CoAuthors, au)
				}
			}
		}
		crows.Close()
	}

	// Attributions (batch, ordre asc).
	if arows, err := s.pool.Query(ctx, `
		SELECT aa."articleId", aa.role, aa."order", aa."isVisible", aa."consentStatus",
		       u.id::text, u.name, u.username, u."logoUrl", u."isCertified"
		FROM "ArticleAttribution" aa JOIN "User" u ON u.id = aa."userId"
		WHERE aa."articleId" = ANY($1::text[])
		ORDER BY aa."order" ASC`, articleIDs); err == nil {
		for arows.Next() {
			var artID string
			var att HydrateAttribution
			if err := arows.Scan(&artID, &att.Role, &att.Order, &att.IsVisible, &att.ConsentStatus,
				&att.User.ID, &att.User.Name, &att.User.Username, &att.User.LogoURL, &att.User.IsCertified); err == nil {
				att.User.Type = identity.Personal
				if a, ok := articles[artID]; ok {
					a.Attributions = append(a.Attributions, att)
				}
			}
		}
		arows.Close()
	}

	// Ordonne selon l'ordre demandé.
	out := make([]HydrateArticle, 0, len(order))
	for _, id := range order {
		if a, ok := articles[id]; ok {
			out = append(out, *a)
		}
	}
	return out, nil
}

// Hydrate renvoie articles + pensées complets pour les ids classés par le moteur.
func (s *Service) Hydrate(ctx context.Context, items []EngineItem, viewerID string) (HydrateResult, error) {
	res := HydrateResult{Articles: []HydrateArticle{}, Thoughts: []posts.FeedSlice{}}
	if len(items) == 0 {
		return res, nil
	}
	var artIDs, thoughtIDs []string
	for _, it := range items {
		switch it.ItemType {
		case "ARTICLE":
			artIDs = append(artIDs, it.ID)
		case "THOUGHT":
			thoughtIDs = append(thoughtIDs, it.ID)
		}
	}
	if len(artIDs) > 0 {
		arts, err := s.HydrateArticles(ctx, artIDs, viewerID)
		if err != nil {
			return res, fmt.Errorf("hydrate articles: %w", err)
		}
		res.Articles = arts
	}
	if len(thoughtIDs) > 0 {
		slices, err := s.buildSlices(ctx, thoughtIDs, viewerID, false)
		if err != nil {
			return res, fmt.Errorf("hydrate thoughts: %w", err)
		}
		res.Thoughts = slices
	}
	return res, nil
}

// helper pour pointer des chaînes nullable (scan pgtype).
func textPtr(t pgtype.Text) *string {
	if !t.Valid {
		return nil
	}
	v := t.String
	return &v
}
