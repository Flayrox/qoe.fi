package workspaces

import (
	"context"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/permissions"
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
	// Permissions effectives du membre (base du rôle + overrides). En PERSONAL,
	// l'utilisateur est propriétaire : toutes les permissions. Le front s'en sert
	// pour masquer les sections inaccessibles, sans dupliquer le RBAC.
	Permissions []string `json:"permissions"`
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
		var memberPerms []string
		err := s.pool.QueryRow(ctx, `
			SELECT p.id, p.name, p.slug, p."logoUrl", mm.role, mm.permissions
			FROM "MediaMember" mm
			JOIN "Media" m ON m.id = mm."mediaId"
			JOIN "Publication" p ON p.id = m."publicationId"
			WHERE mm."mediaId" = $1 AND mm."userId" = $2
			  AND mm.status = 'active'
		`, mediaID, toUUID(userID)).Scan(&pubID, &pubName, &pubSlug, &pubLogo, &role, &memberPerms)
		if err == nil {
			return ActiveWorkspace{
				Type:          "MEDIA",
				MediaID:       &mediaID,
				PublicationID: pubID,
				Name:          pubName,
				Slug:          pubSlug,
				LogoURL:       textPtr(pubLogo),
				MediaRole:     &role,
				Permissions: permissions.EffectivePermissions(&permissions.MediaMember{
					Role: role, Permissions: memberPerms, Status: "active",
				}),
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
		// Pas encore de publication personnelle : aucun identifiant de
		// publication n'existe. On ne fabrique JAMAIS publicationId = userId
		// (un id utilisateur n'est pas une publication) ; le client appelle
		// /v1/me/publication pour la créer à la demande.
		return ActiveWorkspace{
			Type:          "PERSONAL",
			PublicationID: "",
			Name:          "Profil Personnel",
			Slug:          "personal",
			LogoURL:       nil,
			Permissions:   permissions.AllMediaPermissions(),
		}, nil
	}
	return ActiveWorkspace{
		Type:          "PERSONAL",
		PublicationID: pubID,
		Name:          pubName,
		Slug:          pubSlug,
		LogoURL:       textPtr(pubLogo),
		Permissions:   permissions.AllMediaPermissions(),
	}, nil
}
