package testutil

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// WebhookFixtures contient les IDs du seed webhooks.
type WebhookFixtures struct {
	PublicationID string
	OwnerID       string
	EditorID      string
	ViewerID      string
	WebhookID     string // webhook actif sur article.published
	OtherWebhook  string // webhook actif sur subscriber.created
	InactiveID    string // webhook inactif
}

// SeedWebhooks crée un environnement minimal pour tester la gestion webhooks :
//   - 1 publication (PERSONAL, propriétaire = owner)
//   - owner (publication personnelle liée) → rôle owner
//   - editor + viewer via une Média liée à la même publication
//   - 3 webhooks : actif (article.published), actif (subscriber.created),
//     inactif
func SeedWebhooks(ctx context.Context, pool *pgxpool.Pool) (*WebhookFixtures, error) {
	fx := &WebhookFixtures{}

	// Vide les tables (IDs fixes → seed rejouable entre tests).
	if _, err := pool.Exec(ctx, `TRUNCATE TABLE
		"WebhookDelivery", "Webhook", "MediaMember", "Media", "User", "Publication"
		CASCADE`); err != nil {
		return nil, fmt.Errorf("truncate: %w", err)
	}

	// Publication
	if err := pool.QueryRow(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, "createdAt", "updatedAt")
		 VALUES ('pub_wh_001', 'PERSONAL', 'Média Test', 'media-test', now(), now())
		 RETURNING id`,
	).Scan(&fx.PublicationID); err != nil {
		return nil, fmt.Errorf("publication: %w", err)
	}

	// Owner : publication personnelle = la publication du média (comme le fait
	// le service resolveRole : GetUserPersonalPublication).
	const ownerID = "00000000-0000-0000-0000-000000000010"
	if err := pool.QueryRow(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "publicationId", "createdAt", "updatedAt")
		 VALUES ($1, 'owner@test.dev', 'owner', 'Owner', 'creator', $2, now(), now())
		 RETURNING id`,
		ownerID, fx.PublicationID,
	).Scan(&fx.OwnerID); err != nil {
		return nil, fmt.Errorf("owner: %w", err)
	}

	// Éditeur et lecteur via Média + MediaMember.
	const editorID = "00000000-0000-0000-0000-000000000011"
	const viewerID = "00000000-0000-0000-0000-000000000012"
	for _, u := range []struct{ id, email, username string }{
		{editorID, "editor@test.dev", "editor"},
		{viewerID, "viewer@test.dev", "viewer"},
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
		 VALUES ('media_wh_001', $1, now(), now())`,
		fx.PublicationID,
	); err != nil {
		return nil, fmt.Errorf("media: %w", err)
	}
	if _, err := pool.Exec(ctx,
		`INSERT INTO "MediaMember" (id, "mediaId", "userId", role, status, "createdAt", "updatedAt")
		 VALUES (gen_random_uuid()::text, 'media_wh_001', $1, 'editor', 'active', now(), now()),
		        (gen_random_uuid()::text, 'media_wh_001', $2, 'viewer', 'active', now(), now())`,
		editorID, viewerID,
	); err != nil {
		return nil, fmt.Errorf("media members: %w", err)
	}

	// 3 webhooks (events passés en tableau Go, pas de littéral SQL).
	webhooks := []struct {
		id, name, url string
		events        []string
		active        bool
	}{
		{"wh_act_pub", "Site CMS", "https://cms.example.com/hook", []string{"article.published"}, true},
		{"wh_act_sub", "CRM", "https://crm.example.com/hook", []string{"subscriber.created"}, true},
		{"wh_inact", "Ancien", "https://old.example.com/hook", []string{"article.published"}, false},
	}
	for _, w := range webhooks {
		var id string
		if err := pool.QueryRow(ctx,
			`INSERT INTO "Webhook" (id, "publicationId", name, url, secret, events, active, "createdAt", "updatedAt")
			 VALUES ($1, $2, $3, $4, 'secret_placeholder', $5, $6, now(), now())
			 RETURNING id`,
			w.id, fx.PublicationID, w.name, w.url, w.events, w.active,
		).Scan(&id); err != nil {
			return nil, fmt.Errorf("webhook %s: %w", w.name, err)
		}
		switch id {
		case "wh_act_pub":
			fx.WebhookID = id
		case "wh_act_sub":
			fx.OtherWebhook = id
		case "wh_inact":
			fx.InactiveID = id
		}
	}

	return fx, nil
}
