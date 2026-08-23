package users

import (
	"context"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Service struct {
	pool *pgxpool.Pool
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool}
}

type Contributor struct {
	ID         string  `json:"id"`
	Name       *string `json:"name"`
	Username   *string `json:"username"`
	LogoURL    *string `json:"logoUrl"`
	IsCertified bool   `json:"isCertified"`
}

func toUUID(id string) pgtype.UUID {
	u := pgtype.UUID{}
	_ = u.Scan(id)
	return u
}

func textPtr(t pgtype.Text) *string {
	if !t.Valid {
		return nil
	}
	v := t.String
	return &v
}

// SearchForContributors cherche des utilisateurs pour co-auteur (name/username/email contains, insensible).
// Mirroir de packages/api-client/src/actions/articles/index.ts searchArticleContributorsAction.
func (s *Service) SearchForContributors(ctx context.Context, query string, excludeIds []string) ([]Contributor, error) {
	if len(query) < 2 {
		return []Contributor{}, nil
	}
	q := "%" + query + "%"
	// Construit le tableau d'UUIDs à exclure
	excludeUUIDs := make([]pgtype.UUID, 0, len(excludeIds))
	for _, id := range excludeIds {
		if id != "" {
			excludeUUIDs = append(excludeUUIDs, toUUID(id))
		}
	}
	// Si aucun à exclure, on passe un tableau vide
	rows, err := s.pool.Query(ctx, `
		SELECT id::text, name, username, "logoUrl", "isCertified"
		FROM "User"
		WHERE "isSuspended" = false AND "isShadowbanned" = false
		  AND id != ALL($2::uuid[])
		  AND (name ILIKE $1 OR username ILIKE $1 OR email ILIKE $1)
		ORDER BY name ASC
		LIMIT 8
	`, q, excludeUUIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Contributor
	for rows.Next() {
		var c Contributor
		var name, username, logo pgtype.Text
		var certified bool
		if err := rows.Scan(&c.ID, &name, &username, &logo, &certified); err != nil {
			continue
		}
		c.Name = textPtr(name)
		c.Username = textPtr(username)
		c.LogoURL = textPtr(logo)
		c.IsCertified = certified
		out = append(out, c)
	}
	if out == nil {
		out = []Contributor{}
	}
	return out, rows.Err()
}
