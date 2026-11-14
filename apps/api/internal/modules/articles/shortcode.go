package articles

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/qoefi/api/internal/shortcode"
	"github.com/qoefi/api/internal/slug"
)

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

func (s *Service) uniqueShortCode(ctx context.Context) string {
	return shortcode.Generate(ctx, s.pool)
}

// assignShortCode pose le code court sur l'article. Le pré-contrôle
// uniqueShortCode ne suffit pas (course entre deux créations) : l'index unique
// fait foi, on régénère le code en cas de collision et on réaligne le suffixe
// du slug pour que le code reste le dernier jeton de l'URL.
func (s *Service) assignShortCode(ctx context.Context, articleID, oldCode, code string) error {
	for attempt := 0; attempt < 5; attempt++ {
		_, err := s.pool.Exec(ctx, `
			UPDATE "Article"
			SET "shortCode" = $2,
			    slug = CASE
			        WHEN slug LIKE '%-' || $3 THEN left(slug, length(slug) - length($3)) || $2
			        ELSE slug
			    END,
			    "updatedAt" = now()
			WHERE id = $1 AND "shortCode" IS NULL`, articleID, code, oldCode)
		if err == nil {
			return nil
		}
		if !shortcode.IsUniqueViolation(err) {
			return err
		}
		code = s.uniqueShortCode(ctx)
	}
	return fmt.Errorf("code court : collisions répétées pour l'article %s", articleID)
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
