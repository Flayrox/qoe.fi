package testutil

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// MediaFixtures contient les IDs du seed Média (vraie publication MEDIA).
type MediaFixtures struct {
	PublicationID string // publication de type MEDIA
	OwnerID       string // role owner (membre média)
	EditorID      string // role editor
	WriterID      string // role writer (création + édition own)
	ViewerID      string // role viewer (lecture seule)
}

// SeedMedia crée une publication de type MEDIA avec 4 membres aux rôles
// distincts (owner, editor, writer, viewer) — pour tester le workflow média
// réel (EditorCapabilities, Review, RBAC articles).
func SeedMedia(ctx context.Context, pool *pgxpool.Pool) (*MediaFixtures, error) {
	fx := &MediaFixtures{}

	if _, err := pool.Exec(ctx, `TRUNCATE TABLE
		"Article", "MediaMember", "MediaInvite", "Media", "User", "Publication"
		CASCADE`); err != nil {
		return nil, fmt.Errorf("truncate: %w", err)
	}

	fx.PublicationID = "pub_media_001"
	if err := pool.QueryRow(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, "createdAt", "updatedAt")
		 VALUES ($1, 'MEDIA', 'Média Quotidien', 'media-quotidien', now(), now())
		 RETURNING id`,
		fx.PublicationID,
	).Scan(&fx.PublicationID); err != nil {
		return nil, fmt.Errorf("publication: %w", err)
	}

	fx.OwnerID = "00000000-0000-0000-0000-000000000020"
	fx.EditorID = "00000000-0000-0000-0000-000000000021"
	fx.WriterID = "00000000-0000-0000-0000-000000000022"
	fx.ViewerID = "00000000-0000-0000-0000-000000000023"

	users := []struct {
		id, email, username string
	}{
		{fx.OwnerID, "owner@media.test", "mowner"},
		{fx.EditorID, "editor@media.test", "meditor"},
		{fx.WriterID, "writer@media.test", "mwriter"},
		{fx.ViewerID, "viewer@media.test", "mviewer"},
	}
	for _, u := range users {
		if _, err := pool.Exec(ctx,
			`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
			 VALUES ($1, $2, $3, $3, 'user', now(), now())`,
			u.id, u.email, u.username,
		); err != nil {
			return nil, fmt.Errorf("user %s: %w", u.username, err)
		}
	}

	if _, err := pool.Exec(ctx,
		`INSERT INTO "Media" (id, "publicationId", "createdAt", "updatedAt")
		 VALUES ('media_001', $1, now(), now())`,
		fx.PublicationID,
	); err != nil {
		return nil, fmt.Errorf("media: %w", err)
	}

	members := []struct {
		userID, role string
	}{
		{fx.OwnerID, "owner"},
		{fx.EditorID, "editor"},
		{fx.WriterID, "writer"},
		{fx.ViewerID, "viewer"},
	}
	for _, m := range members {
		if _, err := pool.Exec(ctx,
			`INSERT INTO "MediaMember" (id, "mediaId", "userId", role, status, "createdAt", "updatedAt")
			 VALUES (gen_random_uuid()::text, 'media_001', $1, $2, 'active', now(), now())`,
			m.userID, m.role,
		); err != nil {
			return nil, fmt.Errorf("member %s: %w", m.role, err)
		}
	}

	return fx, nil
}
