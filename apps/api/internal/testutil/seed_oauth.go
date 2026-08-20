package testutil

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// OAuthFixtures contient les IDs du seed OAuth.
type OAuthFixtures struct {
	OwnerID  string // apiAccessStatus=approved (peut créer des apps OAuth)
	ViewerID string // apiAccessStatus=none (refusé)
}

// SeedOAuth crée deux utilisateurs : un créateur approuvé pour l'accès API et
// un simple utilisateur non approuvé (pour tester le refus d'accès).
func SeedOAuth(ctx context.Context, pool *pgxpool.Pool) (*OAuthFixtures, error) {
	fx := &OAuthFixtures{}

	if _, err := pool.Exec(ctx, `TRUNCATE TABLE
		"OAuthConsent", "OAuthToken", "OAuthAuthorizationCode", "OAuthClient", "User"
		CASCADE`); err != nil {
		return nil, fmt.Errorf("truncate: %w", err)
	}

	const ownerID = "00000000-0000-0000-0000-000000000030"
	const viewerID = "00000000-0000-0000-0000-000000000031"
	if _, err := pool.Exec(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "apiAccessStatus", "createdAt", "updatedAt")
		 VALUES ($1, 'oauth.owner@test.dev', 'oauthowner', 'OAuth Owner', 'creator', 'approved', now(), now()),
		        ($2, 'oauth.viewer@test.dev', 'oauthviewer', 'OAuth Viewer', 'user', 'none', now(), now())`,
		ownerID, viewerID,
	); err != nil {
		return nil, fmt.Errorf("users: %w", err)
	}

	fx.OwnerID = ownerID
	fx.ViewerID = viewerID
	return fx, nil
}
