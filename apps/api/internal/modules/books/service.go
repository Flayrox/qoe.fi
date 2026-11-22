// Service livres — charger les articles demandés et vérifier la propriété.
package books

import (
	"context"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/authz"
)

// Service lit les articles à compiler.
type Service struct {
	pool *pgxpool.Pool
}

// NewService construit le service.
func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool}
}

// ArticleRow est un article sélectionné pour le livre.
type ArticleRow struct {
	ID          string
	Title       string
	Content     string
	PublisherID string
}

// Articles charge les articles par identifiants (l'ordre est rétabli par
// l'appelant, pas par la base).
func (s *Service) Articles(ctx context.Context, ids []string) ([]ArticleRow, error) {
	if s == nil || s.pool == nil || len(ids) == 0 {
		return []ArticleRow{}, nil
	}
	rows, err := s.pool.Query(ctx, `
		SELECT "id", "title", "content", "publisherId"
		FROM "Article"
		WHERE "id" = ANY($1::text[])`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	articles := []ArticleRow{}
	for rows.Next() {
		var a ArticleRow
		if err := rows.Scan(&a.ID, &a.Title, &a.Content, &a.PublisherID); err != nil {
			return nil, err
		}
		articles = append(articles, a)
	}
	return articles, rows.Err()
}

// CanManagePublisher délègue à la règle unique du dépôt (authz) : publication
// personnelle ou média dont l'utilisateur est propriétaire actif.
func (s *Service) CanManagePublisher(ctx context.Context, userID, publisherID string) (bool, error) {
	if s == nil || s.pool == nil {
		return false, nil
	}
	return authz.CanManagePublisher(ctx, s.pool, userID, publisherID)
}

// PublisherLabel renvoie le nom de la publication (auteur par défaut).
func (s *Service) PublisherLabel(ctx context.Context, publisherID string) string {
	if s == nil || s.pool == nil || strings.TrimSpace(publisherID) == "" {
		return ""
	}
	var name string
	if err := s.pool.QueryRow(ctx,
		`SELECT COALESCE("name", '') FROM "Publisher" WHERE id = $1`, publisherID).Scan(&name); err != nil {
		return ""
	}
	return name
}
