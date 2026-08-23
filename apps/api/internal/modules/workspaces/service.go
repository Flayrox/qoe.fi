package workspaces

import (
	"context"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api/internal/database"
)

type Service struct {
	pool *pgxpool.Pool
	q    *db.Queries
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool, q: db.New(pool)}
}

type ActiveWorkspace struct {
	Type          string  `json:"type"`
	PublicationID string  `json:"publicationId"`
	Name          string  `json:"name"`
	Slug          string  `json:"slug"`
	LogoURL       *string `json:"logoUrl"`
	MediaID       *string `json:"mediaId,omitempty"`
	MediaRole     *string `json:"mediaRole,omitempty"`
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

// GetActive resolves the active workspace for a user, given an optional mediaId from the cookie.
// Mirrors apps/studio/src/lib/active-workspace.ts getActiveWorkspace.
func (s *Service) GetActive(ctx context.Context, userID, mediaID string) (ActiveWorkspace, error) {
	if mediaID != "" {
		var pubID, pubName, pubSlug string
		var pubLogo pgtype.Text
		var role string
		err := s.pool.QueryRow(ctx, `
			SELECT p.id, p.name, p.slug, p."logoUrl", mm.role
			FROM "MediaMember" mm
			JOIN "Media" m ON m.id = mm."mediaId"
			JOIN "Publication" p ON p.id = m."publicationId"
			WHERE mm."mediaId" = $1 AND mm."userId" = $2
		`, mediaID, toUUID(userID)).Scan(&pubID, &pubName, &pubSlug, &pubLogo, &role)
		if err == nil {
			return ActiveWorkspace{
				Type:          "MEDIA",
				MediaID:       &mediaID,
				PublicationID: pubID,
				Name:          pubName,
				Slug:          pubSlug,
				LogoURL:       textPtr(pubLogo),
				MediaRole:     &role,
			}, nil
		}
	}
	// Fallback: personal publication
	var pubID, pubName, pubSlug string
	var pubLogo pgtype.Text
	err := s.pool.QueryRow(ctx, `
		SELECT p.id, p.name, p.slug, p."logoUrl"
		FROM "Publication" p
		WHERE p.type = 'PERSONAL' AND p.id = (SELECT "publicationId" FROM "User" WHERE id = $1)
	`, userID).Scan(&pubID, &pubName, &pubSlug, &pubLogo)
	if err != nil {
		// No personal publication yet — return userId as fallback (will be created on demand)
		return ActiveWorkspace{
			Type:          "PERSONAL",
			PublicationID: userID,
			Name:          "Profil Personnel",
			Slug:          "personal",
			LogoURL:       nil,
		}, nil
	}
	return ActiveWorkspace{
		Type:          "PERSONAL",
		PublicationID: pubID,
		Name:          pubName,
		Slug:          pubSlug,
		LogoURL:       textPtr(pubLogo),
	}, nil
}
