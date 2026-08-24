package users

import (
	"context"
	"testing"
)

// TestGetOrCreatePersonalPublication — création + réutilisation.
func TestGetOrCreatePersonalPublication(t *testing.T) {
	seedMe(t)
	svc := NewService(poolTest)
	ctx := context.Background()

	// L'utilisateur seedé n'a pas de publication → création.
	pub1, err := svc.GetOrCreatePersonalPublication(ctx, userID)
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if pub1 == "" {
		t.Fatal("empty publication id")
	}

	// Idempotent : même publication à la 2e lecture.
	pub2, err := svc.GetOrCreatePersonalPublication(ctx, userID)
	if err != nil {
		t.Fatalf("resolve again: %v", err)
	}
	if pub1 != pub2 {
		t.Fatalf("publication changed: %s != %s", pub1, pub2)
	}
}

// TestToggleMuteWord — ajout, dédup, retrait, normalisation.
func TestToggleMuteWord(t *testing.T) {
	seedMe(t)
	svc := NewService(poolTest)
	ctx := context.Background()

	muted, word, err := svc.ToggleMuteWord(ctx, userID, "  SPOILERS ")
	if err != nil {
		t.Fatalf("add: %v", err)
	}
	if !muted || word != "spoilers" {
		t.Fatalf("add = %v %q", muted, word)
	}

	// Double ajout → retrait.
	muted, _, err = svc.ToggleMuteWord(ctx, userID, "SPOILERS")
	if err != nil {
		t.Fatalf("remove: %v", err)
	}
	if muted {
		t.Fatal("second toggle should unmute")
	}

	// Mot vide → erreur.
	if _, _, err := svc.ToggleMuteWord(ctx, userID, "   "); err == nil {
		t.Fatal("empty word should fail")
	}
}

// TestUnlockArticleWithWallet — débit lecteur + crédit propriétaire.
func TestUnlockArticleWithWallet(t *testing.T) {
	seedMe(t)
	svc := NewService(poolTest)
	ctx := context.Background()

	// Publication appartenant à otherID.
	var pubID2 string
	if err := poolTest.QueryRow(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, "updatedAt")
		 VALUES ('pub_wallet_owner', 'PERSONAL', 'Owner Pub', 'owner-pub', now())
		 RETURNING id`).Scan(&pubID2); err != nil {
		t.Fatalf("publication: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`UPDATE "User" SET "publicationId" = $2 WHERE id = $1`, otherID, pubID2); err != nil {
		t.Fatalf("link: %v", err)
	}

	code, err := svc.UnlockArticleWithWallet(ctx, userID, pubID2, 100)
	if err != nil {
		t.Fatalf("unlock: %v", err)
	}
	if code != "" {
		t.Fatalf("unlock code = %q", code)
	}

	// Solde lecteur : 250 - 100 = 150.
	var balance int
	if err := poolTest.QueryRow(ctx,
		`SELECT "walletBalanceCents" FROM "User" WHERE id = $1`, userID).Scan(&balance); err != nil {
		t.Fatalf("balance: %v", err)
	}
	if balance != 150 {
		t.Fatalf("reader balance = %d, want 150", balance)
	}

	// Solde propriétaire : 0 + 100 = 100.
	if err := poolTest.QueryRow(ctx,
		`SELECT "walletBalanceCents" FROM "User" WHERE id = $1`, otherID).Scan(&balance); err != nil {
		t.Fatalf("owner balance: %v", err)
	}
	if balance != 100 {
		t.Fatalf("owner balance = %d, want 100", balance)
	}

	// Fonds insuffisants.
	code, err = svc.UnlockArticleWithWallet(ctx, userID, pubID2, 500)
	if err != nil {
		t.Fatalf("unlock2: %v", err)
	}
	if code != "INSUFFICIENT_FUNDS" {
		t.Fatalf("code = %q, want INSUFFICIENT_FUNDS", code)
	}
}
