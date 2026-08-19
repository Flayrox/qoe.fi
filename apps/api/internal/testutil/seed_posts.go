package testutil

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// PostFixtures contient les IDs créés par SeedPosts pour les assertions.
type PostFixtures struct {
	AuthorID  string // auteur des pensées
	ViewerID  string // second utilisateur (like/repost/réponse)
	PostID    string // pensée d'AuthorID
	Post2ID   string // pensée de ViewerID
	ArticleID string // article pour les bookmarks
}

// SeedPosts crée un environnement minimal pour le domaine social :
//   - 2 utilisateurs (auteur + viewer)
//   - 2 pensées (une par utilisateur)
//   - 1 article (pour ToggleBookmark)
//
// Rejouable : les tables sont vidées d'abord.
func SeedPosts(ctx context.Context, pool *pgxpool.Pool) (*PostFixtures, error) {
	fx := &PostFixtures{}
	var pubID string

	if _, err := pool.Exec(ctx, `TRUNCATE TABLE
		"Post", "Like", "Bookmark", "Notification", "Poll", "MediaAttachment",
		"Article", "User", "Publication", "_CoAuthors",
		"Highlight", "AnnotationComment", "AnnotationUpvote"
		CASCADE`); err != nil {
		return nil, fmt.Errorf("truncate: %w", err)
	}

	fx.AuthorID = "00000000-0000-0000-0000-000000000002"
	fx.ViewerID = "00000000-0000-0000-0000-000000000003"

	// Deux utilisateurs.
	for _, u := range []struct {
		id, email, username, name string
	}{
		{fx.AuthorID, "alice@test.dev", "alice", "Alice"},
		{fx.ViewerID, "bob@test.dev", "bob", "Bob"},
	} {
		if _, err := pool.Exec(ctx,
			`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
			 VALUES ($1, $2, $3, $4, 'creator', now(), now())`,
			u.id, u.email, u.username, u.name,
		); err != nil {
			return nil, fmt.Errorf("user %s: %w", u.username, err)
		}
	}

	// Deux pensées publiques.
	if err := pool.QueryRow(ctx,
		`INSERT INTO "Post" (id, content, "authorId", "createdAt", "updatedAt", tags,
		                    visibility, "contentVisibility", "isDraft", "replyRestriction",
		                    "likeCount", "repostCount", "replyCount")
		 VALUES ('post_test_001', 'Première pensée de Alice', $1, now(), now(),
		         ARRAY['go','tests'], 'public', 'PUBLIC', false, 'everyone', 0, 0, 0)
		 RETURNING id`,
		fx.AuthorID,
	).Scan(&fx.PostID); err != nil {
		return nil, fmt.Errorf("post alice: %w", err)
	}
	if err := pool.QueryRow(ctx,
		`INSERT INTO "Post" (id, content, "authorId", "createdAt", "updatedAt", tags,
		                    visibility, "contentVisibility", "isDraft", "replyRestriction",
		                    "likeCount", "repostCount", "replyCount")
		 VALUES ('post_test_002', 'Pensée de Bob', $1, now(), now(),
		         ARRAY[]::text[], 'public', 'PUBLIC', false, 'everyone', 0, 0, 0)
		 RETURNING id`,
		fx.ViewerID,
	).Scan(&fx.Post2ID); err != nil {
		return nil, fmt.Errorf("post bob: %w", err)
	}

	// Publication + article (cible des bookmarks).
	if err := pool.QueryRow(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, "createdAt", "updatedAt")
		 VALUES ('pub_post_001', 'PERSONAL', 'Publication Test', 'publication-test', now(), now())
		 RETURNING id`,
	).Scan(&pubID); err != nil {
		return nil, fmt.Errorf("publication: %w", err)
	}
	// Lie l'utilisateur à sa publication (User.publicationId) pour que le
	// profil /v1/users/{username} et les bookmarks résolvent correctement.
	if _, err := pool.Exec(ctx,
		`UPDATE "User" SET "publicationId" = $1 WHERE id = $2`,
		pubID, fx.AuthorID,
	); err != nil {
		return nil, fmt.Errorf("link user->publication: %w", err)
	}
	if err := pool.QueryRow(ctx,
		`INSERT INTO "Article" (id, title, slug, content, published, visibility,
		                        "readingTime", status, "publicationId", "authorId",
		                        "createdAt", "updatedAt")
		 VALUES ('art_post_001', 'Article bookmarké', 'article-bookmark', '<p>Test</p>', true,
		         'PUBLIC', 3, 'PUBLISHED', $1, $2, now(), now())
		 RETURNING id`,
		pubID, fx.AuthorID,
	).Scan(&fx.ArticleID); err != nil {
		return nil, fmt.Errorf("article: %w", err)
	}

	return fx, nil
}
