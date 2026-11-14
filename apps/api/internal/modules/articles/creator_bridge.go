package articles

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
)

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
