package posts

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
)

// ─────────────────────────── Mock Querier pur ───────────────────────────

type mockBlockQuerier struct {
	db.Querier
	blocks          map[string]map[string]bool
	authors         map[string]string
	usersByUsername map[string]string
	insertedLikes   int
	insertedReposts int
	insertedMentions int
}

func newMockBlockQuerier() *mockBlockQuerier {
	return &mockBlockQuerier{
		blocks:          make(map[string]map[string]bool),
		authors:         make(map[string]string),
		usersByUsername: make(map[string]string),
	}
}

func (m *mockBlockQuerier) setBlock(reader, creator string) {
	if m.blocks[reader] == nil {
		m.blocks[reader] = make(map[string]bool)
	}
	m.blocks[reader][creator] = true
}

func (m *mockBlockQuerier) IsBlockedEitherWay(ctx context.Context, arg db.IsBlockedEitherWayParams) (bool, error) {
	r := arg.ReaderId.String()
	c := arg.CreatorId.String()
	if m.blocks[r] != nil && m.blocks[r][c] {
		return true, nil
	}
	if m.blocks[c] != nil && m.blocks[c][r] {
		return true, nil
	}
	return false, nil
}

func (m *mockBlockQuerier) GetPostAuthor(ctx context.Context, postID string) (string, error) {
	if a, ok := m.authors[postID]; ok {
		return a, nil
	}
	return "", pgx.ErrNoRows
}

func (m *mockBlockQuerier) GetUsersByUsernames(ctx context.Context, usernames []string) ([]db.GetUsersByUsernamesRow, error) {
	var rows []db.GetUsersByUsernamesRow
	for _, u := range usernames {
		if id, ok := m.usersByUsername[u]; ok {
			rows = append(rows, db.GetUsersByUsernamesRow{
				UserID:   id,
				Username: pgtype.Text{String: u, Valid: true},
			})
		}
	}
	return rows, nil
}

func (m *mockBlockQuerier) GetLikePrefs(ctx context.Context, id pgtype.UUID) (db.GetLikePrefsRow, error) {
	return db.GetLikePrefsRow{EmailLikes: true, PushLikes: true}, nil
}

func (m *mockBlockQuerier) GetReplyPrefs(ctx context.Context, id pgtype.UUID) (db.GetReplyPrefsRow, error) {
	return db.GetReplyPrefsRow{EmailMentions: true, PushMentions: true}, nil
}

func (m *mockBlockQuerier) ExistsUnreadLikeNotification(ctx context.Context, arg db.ExistsUnreadLikeNotificationParams) (int32, error) {
	return 0, nil
}

func (m *mockBlockQuerier) ExistsUnreadRepostNotification(ctx context.Context, arg db.ExistsUnreadRepostNotificationParams) (int32, error) {
	return 0, nil
}

func (m *mockBlockQuerier) ExistsUnreadMentionNotification(ctx context.Context, arg db.ExistsUnreadMentionNotificationParams) (int32, error) {
	return 0, nil
}

func (m *mockBlockQuerier) InsertLikeNotification(ctx context.Context, arg db.InsertLikeNotificationParams) error {
	m.insertedLikes++
	return nil
}

func (m *mockBlockQuerier) InsertRepostNotification(ctx context.Context, arg db.InsertRepostNotificationParams) error {
	m.insertedReposts++
	return nil
}

func (m *mockBlockQuerier) InsertMentionNotification(ctx context.Context, arg db.InsertMentionNotificationParams) error {
	m.insertedMentions++
	return nil
}

// ─────────────────────────── Tests Unitaires Purs ───────────────────────────

func TestBlockMatrix_Unit(t *testing.T) {
	ctx := context.Background()
	aliceID := "11111111-1111-1111-1111-111111111111"
	bobID := "22222222-2222-2222-2222-222222222222"
	charlieID := "33333333-3333-3333-3333-333333333333"

	svc := &Service{}

	t.Run("Direction 1 : Bob bloque Alice -> Alice ne peut pas interagir", func(t *testing.T) {
		q := newMockBlockQuerier()
		q.setBlock(bobID, aliceID)
		q.authors["post_alice"] = aliceID
		q.authors["post_bob"] = bobID

		// Alice tente d'interagir sur le post de Bob
		err := svc.ensurePostNotBlocked(ctx, q, "post_bob", aliceID)
		if !errors.Is(err, ErrBlockedContent) {
			t.Fatalf("attendu ErrBlockedContent, reçu %v", err)
		}

		// Bob tente d'interagir sur le post d'Alice (symétrie)
		err = svc.ensurePostNotBlocked(ctx, q, "post_alice", bobID)
		if !errors.Is(err, ErrBlockedContent) {
			t.Fatalf("attendu ErrBlockedContent en sens inverse, reçu %v", err)
		}
	})

	t.Run("Direction 2 : Alice bloque Bob -> Bob ne peut pas interagir", func(t *testing.T) {
		q := newMockBlockQuerier()
		q.setBlock(aliceID, bobID)
		q.authors["post_alice"] = aliceID
		q.authors["post_bob"] = bobID

		err := svc.ensurePostNotBlocked(ctx, q, "post_alice", bobID)
		if !errors.Is(err, ErrBlockedContent) {
			t.Fatalf("attendu ErrBlockedContent, reçu %v", err)
		}

		err = svc.ensurePostNotBlocked(ctx, q, "post_bob", aliceID)
		if !errors.Is(err, ErrBlockedContent) {
			t.Fatalf("attendu ErrBlockedContent en sens inverse, reçu %v", err)
		}
	})

	t.Run("Nominal : Pas de blocage avec Charlie -> autorisé", func(t *testing.T) {
		q := newMockBlockQuerier()
		q.authors["post_charlie"] = charlieID

		err := svc.ensurePostNotBlocked(ctx, q, "post_charlie", aliceID)
		if err != nil {
			t.Fatalf("aucun blocage attendu, reçu %v", err)
		}
	})

	t.Run("Même utilisateur : pas de blocage", func(t *testing.T) {
		q := newMockBlockQuerier()
		blocked, err := isBlockedBetween(ctx, q, aliceID, aliceID)
		if err != nil || blocked {
			t.Fatalf("un utilisateur ne se bloque pas lui-même: blocked=%v, err=%v", blocked, err)
		}
	})
}

func TestNotificationsMatrix_Unit(t *testing.T) {
	ctx := context.Background()
	aliceID := "11111111-1111-1111-1111-111111111111"
	bobID := "22222222-2222-2222-2222-222222222222"
	charlieID := "33333333-3333-3333-3333-333333333333"

	t.Run("Like et Repost vers un compte bloqué n'émettent aucune notification", func(t *testing.T) {
		q := newMockBlockQuerier()
		q.setBlock(aliceID, bobID)
		q.authors["post_alice"] = aliceID

		// Bob tente de liker Alice
		err := notifyLike(ctx, q, "post_alice", bobID)
		if err != nil {
			t.Fatalf("notifyLike ne doit pas échouer: %v", err)
		}
		if q.insertedLikes != 0 {
			t.Fatalf("aucune notification like attendue, inséré %d", q.insertedLikes)
		}

		// Bob tente de reposter Alice
		err = notifyRepost(ctx, q, "post_alice", bobID)
		if err != nil {
			t.Fatalf("notifyRepost ne doit pas échouer: %v", err)
		}
		if q.insertedReposts != 0 {
			t.Fatalf("aucune notification repost attendue, inséré %d", q.insertedReposts)
		}
	})

	t.Run("Mention d'un compte bloqué n'émet aucune notification", func(t *testing.T) {
		q := newMockBlockQuerier()
		q.setBlock(aliceID, bobID)
		q.usersByUsername["alice"] = aliceID
		q.usersByUsername["charlie"] = charlieID

		// Bob mentionne @alice (bloquée) et @charlie (non bloqué)
		notifyMentionsInContent(ctx, q, "Coucou @alice et @charlie !", "post_bob", bobID)

		if q.insertedMentions != 1 {
			t.Fatalf("seule la mention non bloquée (@charlie) doit être insérée, total: %d", q.insertedMentions)
		}
	})

	t.Run("Cas nominal non bloqué : notifications LIKE, REPOST, MENTION émises", func(t *testing.T) {
		q := newMockBlockQuerier()
		q.authors["post_charlie"] = charlieID
		q.usersByUsername["charlie"] = charlieID

		// Alice like Charlie
		if err := notifyLike(ctx, q, "post_charlie", aliceID); err != nil {
			t.Fatalf("notifyLike: %v", err)
		}
		if q.insertedLikes != 1 {
			t.Fatalf("notification like attendue, inséré %d", q.insertedLikes)
		}

		// Alice repost Charlie
		if err := notifyRepost(ctx, q, "post_charlie", aliceID); err != nil {
			t.Fatalf("notifyRepost: %v", err)
		}
		if q.insertedReposts != 1 {
			t.Fatalf("notification repost attendue, inséré %d", q.insertedReposts)
		}

		// Alice mentionne Charlie
		notifyMentionsInContent(ctx, q, "Merci @charlie !", "post_alice", aliceID)
		if q.insertedMentions != 1 {
			t.Fatalf("notification mention attendue, inséré %d", q.insertedMentions)
		}
	})
}

// ─────────────────────────── Tests d'Intégration DB ───────────────────────────

// TestEngagement_BlockedEitherWay : un blocage, dans un sens ou l'autre,
// interdit like, repost et réponse. Le retrait d'un like existant reste possible.
func TestEngagement_BlockedEitherWay(t *testing.T) {
	requirePool(t)
	fx := seedPosts(t)
	svc := newTestService()
	ctx := context.Background()

	// Bob like le post d'Alice avant tout blocage.
	liked, err := svc.ToggleLike(ctx, fx.PostID, fx.ViewerID)
	if err != nil || !liked {
		t.Fatalf("like initial: %v, liked=%v", err, liked)
	}

	// Bob bloque Alice.
	if _, err := svc.ToggleBlock(ctx, fx.AuthorID, fx.ViewerID); err != nil {
		t.Fatalf("block: %v", err)
	}

	assertBlocked := func(label string, err error) {
		t.Helper()
		if !errors.Is(err, ErrBlockedContent) {
			t.Fatalf("%s = %v, attendu ErrBlockedContent", label, err)
		}
	}

	// Retrait du like existant : doit RÉUSSIR même sous blocage (idempotence).
	unliked, err := svc.ToggleLike(ctx, fx.PostID, fx.ViewerID)
	if err != nil {
		t.Fatalf("unlike sous blocage: %v", err)
	}
	if unliked {
		t.Fatalf("attendu unliked=false, reçu true")
	}

	// Nouvelle tentative d'ajout de like : REFUSÉE.
	_, err = svc.ToggleLike(ctx, fx.PostID, fx.ViewerID)
	assertBlocked("ToggleLike", err)

	// Tentative d'ajout de repost : REFUSÉE.
	_, err = svc.ToggleRepost(ctx, fx.PostID, fx.ViewerID)
	assertBlocked("ToggleRepost", err)

	// Tentative de réponse : REFUSÉE.
	_, err = svc.Reply(ctx, fx.PostID, fx.ViewerID, "réponse interdite")
	assertBlocked("Reply", err)

	_, err = svc.CreateFull(ctx, fx.ViewerID, CreateFullInput{
		Content: "réponse interdite", ParentID: &fx.PostID,
	})
	assertBlocked("CreateFull(reply)", err)

	// Déblocage puis blocage inverse (Alice bloque Bob) : même résultat symétrique.
	if _, err := svc.ToggleBlock(ctx, fx.AuthorID, fx.ViewerID); err != nil {
		t.Fatalf("unblock: %v", err)
	}
	if _, err := svc.ToggleBlock(ctx, fx.ViewerID, fx.AuthorID); err != nil {
		t.Fatalf("block inverse: %v", err)
	}
	_, err = svc.ToggleLike(ctx, fx.PostID, fx.ViewerID)
	assertBlocked("ToggleLike (inverse)", err)

	_, err = svc.ToggleRepost(ctx, fx.PostID, fx.ViewerID)
	assertBlocked("ToggleRepost (inverse)", err)
}

// TestMentions_BlockedRecipientNotNotified : une @mention d'un compte bloqué
// ne crée aucune notification.
func TestMentions_BlockedRecipientNotNotified(t *testing.T) {
	requirePool(t)
	fx := seedPosts(t)
	svc := newTestService()
	ctx := context.Background()

	// Bob bloque Alice, puis la mentionne dans une pensée.
	if _, err := svc.ToggleBlock(ctx, fx.AuthorID, fx.ViewerID); err != nil {
		t.Fatalf("block: %v", err)
	}
	post, err := svc.CreateFull(ctx, fx.ViewerID, CreateFullInput{Content: "salut @alice"})
	if err != nil {
		t.Fatalf("CreateFull: %v", err)
	}
	if n := countNotifications(t, fx.AuthorID, fx.ViewerID, "MENTION", post.ID); n != 0 {
		t.Fatalf("MENTION d'un compte bloqué = %d, attendu 0", n)
	}
}
