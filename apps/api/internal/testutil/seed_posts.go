package testutil

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// articleContent est le corps de l'article de fixture. Un surlignage public
// doit citer un passage qui existe réellement (anti-spoofing de citation) :
// les tests citent donc ces phrases-là, une par paragraphe pour que chaque
// passage reste trouvable sans ambiguïté.
const articleContent = `<p>Article de test sur la lecture et ses usages.</p>
<p>Passage génial sur la lecture</p>
<p>Passage clé</p>
<p>Passage public</p>
<p>Passage commenté</p>
<p>Passage à commenter</p>
<p>Passage à upvoter</p>
<p>Passage sauvegardé</p>
<p>Passage privé</p>
<p>Surlignage privé</p>
<p>À annoter</p>
<p>À supprimer</p>
<p>51e autorisé pour tous</p>
<p>Premier repère</p>
<p>Deuxième repère</p>
<p>Troisième repère</p>`

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
		"Article", "User", "Publisher", "_CoAuthors",
		"Highlight", "AnnotationComment", "AnnotationUpvote",
		-- Les conversations ne sont pas rattachées par FK aux comptes : sans
		-- ce TRUNCATE, un test qui compte les conversations voit celles des
		-- tests précédents du même paquet.
		"Message", "ConversationMember", "Conversation"
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

	// Publication + article (cible des bookmarks). Publication PERSONNELLE
	// d'Alice : elle porte donc SON identité (triggers 00028/00054) — un nom
	// ou un slug inventé serait réécrit à la liaison ci-dessous.
	if err := pool.QueryRow(ctx,
		`INSERT INTO "Publisher" (id, type, name, slug, "createdAt", "updatedAt")
		 VALUES ('pub_post_001', 'PERSONAL', 'Alice', 'alice', now(), now())
		 RETURNING id`,
	).Scan(&pubID); err != nil {
		return nil, fmt.Errorf("publication: %w", err)
	}
	// Lie l'utilisateur à sa publication (User.publisherId) pour que le
	// profil /v1/users/{username} et les bookmarks résolvent correctement.
	if _, err := pool.Exec(ctx,
		`UPDATE "User" SET "publisherId" = $1 WHERE id = $2`,
		pubID, fx.AuthorID,
	); err != nil {
		return nil, fmt.Errorf("link user->publication: %w", err)
	}
	if err := pool.QueryRow(ctx,
		`INSERT INTO "Article" (id, title, slug, content, published, visibility,
		                        "readingTime", status, "publisherId", "authorId",
		                        "createdAt", "updatedAt")
		 VALUES ('art_post_001', 'Article bookmarké', 'article-bookmark', $3, true,
		         'PUBLIC', 3, 'PUBLISHED', $1, $2, now(), now())
		 RETURNING id`,
		pubID, fx.AuthorID, articleContent,
	).Scan(&fx.ArticleID); err != nil {
		return nil, fmt.Errorf("article: %w", err)
	}

	return fx, nil
}
