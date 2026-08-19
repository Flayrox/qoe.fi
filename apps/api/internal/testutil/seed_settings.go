package testutil

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// SettingsFixtures contient les IDs du seed settings.
type SettingsFixtures struct {
	OwnerID    string // publication personnelle → owner
	EditorID   string // média avec override +media:manage_settings
	ViewerID   string // média sans manage_settings
	PubID      string // publication personnelle de l'owner
	MediaPubID string // publication du média
}

// SeedSettings crée :
//   - owner : publication personnelle, apiAccessStatus=approved
//   - editor : membre d'un Média (même publication) avec override
//     +media:manage_settings
//   - viewer : membre du même Média sans la permission
//   - la publication du média a un subdomain pris ("deja-pris")
func SeedSettings(ctx context.Context, pool *pgxpool.Pool) (*SettingsFixtures, error) {
	fx := &SettingsFixtures{}

	if _, err := pool.Exec(ctx, `TRUNCATE TABLE
		"ApiKey", "MediaMember", "Media", "User", "Publication"
		CASCADE`); err != nil {
		return nil, fmt.Errorf("truncate: %w", err)
	}

	// Publication personnelle de l'owner (aucun subdomain → libre).
	if err := pool.QueryRow(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, "createdAt", "updatedAt")
		 VALUES ('pub_set_own', 'PERSONAL', 'Owner Blog', 'owner-blog', now(), now())
		 RETURNING id`,
	).Scan(&fx.PubID); err != nil {
		return nil, fmt.Errorf("publication owner: %w", err)
	}

	const ownerID = "00000000-0000-0000-0000-000000000020"
	if err := pool.QueryRow(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "publicationId", "apiAccessStatus", "createdAt", "updatedAt")
		 VALUES ($1, 'owner.set@test.dev', 'ownerset', 'Owner Set', 'creator', $2, 'approved', now(), now())
		 RETURNING id`,
		ownerID, fx.PubID,
	).Scan(&fx.OwnerID); err != nil {
		return nil, fmt.Errorf("owner: %w", err)
	}

	// Publication du Média avec subdomain pris.
	if err := pool.QueryRow(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, subdomain, "createdAt", "updatedAt")
		 VALUES ('pub_set_media', 'MEDIA', 'Média Test', 'media-test', 'deja-pris', now(), now())
		 RETURNING id`,
	).Scan(&fx.MediaPubID); err != nil {
		return nil, fmt.Errorf("publication media: %w", err)
	}

	const editorID = "00000000-0000-0000-0000-000000000021"
	const viewerID = "00000000-0000-0000-0000-000000000022"
	for _, u := range []struct{ id, email, username string }{
		{editorID, "editor.set@test.dev", "editorset"},
		{viewerID, "viewer.set@test.dev", "viewerset"},
	} {
		if _, err := pool.Exec(ctx,
			`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
			 VALUES ($1, $2, $3, $3, 'user', now(), now())`,
			u.id, u.email, u.username,
		); err != nil {
			return nil, fmt.Errorf("user %s: %w", u.username, err)
		}
	}
	fx.EditorID = editorID
	fx.ViewerID = viewerID

	if _, err := pool.Exec(ctx,
		`INSERT INTO "Media" (id, "publicationId", "createdAt", "updatedAt")
		 VALUES ('media_set_001', $1, now(), now())`,
		fx.MediaPubID,
	); err != nil {
		return nil, fmt.Errorf("media: %w", err)
	}
	if _, err := pool.Exec(ctx,
		`INSERT INTO "MediaMember" (id, "mediaId", "userId", role, permissions, status, "createdAt", "updatedAt")
		 VALUES (gen_random_uuid()::text, 'media_set_001', $1, 'editor', ARRAY['media:manage_settings'], 'active', now(), now()),
		        (gen_random_uuid()::text, 'media_set_001', $2, 'viewer', ARRAY[]::text[], 'active', now(), now())`,
		editorID, viewerID,
	); err != nil {
		return nil, fmt.Errorf("media members: %w", err)
	}

	return fx, nil
}
