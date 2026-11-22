// Package exports — archive de portabilité d'une publication.
//
// Le contrat de traitement promet l'export complet (Markdown/HTML + CSV des
// abonnés) ; ce module le rend vrai, en lecture seule et sans migration.
// L'export « compte » (JSON) existe déjà dans users.DataExport : ici c'est
// l'archive de la PUBLICATION, celle qui permet de partir sans lock-in.
package exports

import (
	"context"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/authz"
)

// Service lit les données exportables.
type Service struct {
	pool *pgxpool.Pool
}

// NewService construit le service (pool nil = archive vide, jamais de panne).
func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool}
}

// ArticleRow est un article exporté (contenu HTML d'origine).
type ArticleRow struct {
	ID        string
	Title     string
	Slug      string
	Content   string
	Status    string
	CreatedAt time.Time
	UpdatedAt time.Time
}

// SubscriberRow est une ligne du CSV abonnés.
type SubscriberRow struct {
	Email     string
	Status    string
	Active    bool
	Premium   bool
	LtvCents  int
	CreatedAt time.Time
}

// CanManagePublisher délègue à la règle unique du dépôt (authz) : publication
// personnelle, ou média dont l'utilisateur est propriétaire actif.
func (s *Service) CanManagePublisher(ctx context.Context, userID, publisherID string) (bool, error) {
	if s == nil || s.pool == nil {
		return false, nil
	}
	return authz.CanManagePublisher(ctx, s.pool, userID, publisherID)
}

// PublisherName renvoie le nom affiché de la publication (manifeste).
func (s *Service) PublisherName(ctx context.Context, publisherID string) string {
	if s == nil || s.pool == nil {
		return ""
	}
	var name string
	if err := s.pool.QueryRow(ctx,
		`SELECT COALESCE("name", '') FROM "Publisher" WHERE id = $1`, publisherID).Scan(&name); err != nil {
		return ""
	}
	return name
}

// Articles liste les articles de la publication, du plus récent au plus ancien.
func (s *Service) Articles(ctx context.Context, publisherID string) ([]ArticleRow, error) {
	if s == nil || s.pool == nil {
		return []ArticleRow{}, nil
	}
	rows, err := s.pool.Query(ctx, `
		SELECT "id", "title", "slug", "content", "status", "createdAt", "updatedAt"
		FROM "Article"
		WHERE "publisherId" = $1
		ORDER BY "createdAt" DESC`, publisherID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	articles := []ArticleRow{}
	for rows.Next() {
		var a ArticleRow
		if err := rows.Scan(&a.ID, &a.Title, &a.Slug, &a.Content, &a.Status, &a.CreatedAt, &a.UpdatedAt); err != nil {
			return nil, err
		}
		articles = append(articles, a)
	}
	return articles, rows.Err()
}

// Subscribers liste l'audience (email, état, LTV, date d'inscription).
func (s *Service) Subscribers(ctx context.Context, publisherID string) ([]SubscriberRow, error) {
	if s == nil || s.pool == nil {
		return []SubscriberRow{}, nil
	}
	rows, err := s.pool.Query(ctx, `
		SELECT "email", "status"::text, "isActive", "isPremium", "ltvCents", "createdAt"
		FROM "Subscriber"
		WHERE "publisherId" = $1
		ORDER BY "createdAt" DESC`, publisherID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	subs := []SubscriberRow{}
	for rows.Next() {
		var row SubscriberRow
		if err := rows.Scan(&row.Email, &row.Status, &row.Active, &row.Premium, &row.LtvCents, &row.CreatedAt); err != nil {
			return nil, err
		}
		subs = append(subs, row)
	}
	return subs, rows.Err()
}

// SafeFileName normalise un slug pour l'archive (aucun chemin, aucun accent).
func SafeFileName(slug string) string {
	slug = strings.TrimSpace(strings.ToLower(slug))
	var b strings.Builder
	for _, r := range slug {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9', r == '-', r == '_':
			b.WriteRune(r)
		case r == ' ' || r == '/':
			b.WriteRune('-')
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		out = "article"
	}
	if len(out) > 80 {
		out = out[:80]
	}
	return out
}
