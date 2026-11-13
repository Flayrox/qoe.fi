// Package shortcode — codes courts numériques des articles (permalinks /l/{code}).
//
// Générateur unique pour les modules articles et creator. Le pré-contrôle
// EXISTS ne protège pas d'une course entre deux créations : l'index unique
// "Article_shortCode_key" fait foi, les appelants réessaient sur violation
// (cf. IsUniqueViolation).
package shortcode

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/qoefi/api/internal/slug"
)

// Querier est le sous-ensemble de *pgxpool.Pool utilisé par Generate (les
// handlers créateur exposent une abstraction `pooler`).
type Querier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// attempts borne les tirages avant de rendre un dernier code (l'index unique
// tranchera côté écriture).
const attempts = 20

// Generate retourne un code numérique non encore utilisé par un article.
func Generate(ctx context.Context, pool Querier) string {
	for i := 0; i < attempts; i++ {
		code := slug.ShortNumericCode()
		var exists bool
		if err := pool.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM "Article" WHERE "shortCode" = $1)`, code,
		).Scan(&exists); err == nil && !exists {
			return code
		}
	}
	return slug.ShortNumericCode()
}

// IsUniqueViolation indique si l'erreur est une collision d'index unique
// (SQLSTATE 23505) — typiquement sur "Article_shortCode_key".
func IsUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
