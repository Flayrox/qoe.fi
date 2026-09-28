package newsletters

import (
	"context"
	"testing"

	"github.com/qoefi/api/internal/workers"
)

// Fiche 01 §4 : au clic de confirmation, l'abonnement rejoint le compte qui
// utilise cette adresse — sans créer de doublon d'envoi et sans jamais
// réactiver quoi que ce soit (seul userId est copié, sur la ligne qu'on vient
// d'activer par ce même clic).
func TestConfirm_AttachesToMatchingAccount(t *testing.T) {
	ctx := context.Background()
	seedNewsletterEnv(t, ctx)
	const email = "rattache-moi@test.dev"
	const token = "tok-attach-account"

	// Un compte qoe.fi utilise cette adresse comme identifiant.
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
		 VALUES (gen_random_uuid()::text, $1, 'rattachemoi', 'Rattaché', 'user', now(), now())
		 ON CONFLICT (email) DO NOTHING`, email); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	t.Cleanup(func() {
		_, _ = poolTest.Exec(ctx, `DELETE FROM "User" WHERE email = $1`, email)
	})
	seedPendingSubscriber(t, ctx, email, token)

	sig := workers.SignConfirm(pubID, email)
	r := newHTTPRouter(t, false)
	w := nlReq(r, "GET",
		"/v1/newsletters/confirm?pub="+pubID+"&email="+email+"&token="+token+"&sig="+sig, "", "")
	if w.Code != 200 {
		t.Fatalf("GET confirm = %d, attendu 200", w.Code)
	}

	var userID *string
	if err := poolTest.QueryRow(ctx,
		`SELECT "userId" FROM "Subscriber" WHERE email = $1 AND "publicationId" = $2`,
		email, pubID).Scan(&userID); err != nil {
		t.Fatalf("read subscriber: %v", err)
	}
	if userID == nil {
		t.Fatal("l'abonnement confirmé n'a pas rejoint le compte de cette adresse")
	}
	var accountID string
	if err := poolTest.QueryRow(ctx, `SELECT id FROM "User" WHERE email = $1`, email).Scan(&accountID); err != nil {
		t.Fatalf("read user: %v", err)
	}
	if *userID != accountID {
		t.Fatalf("rattaché au mauvais compte : %s vs %s", *userID, accountID)
	}
}

// Sans compte à cette adresse : userId reste NULL, la confirmation réussit
// quand même (l'abonnement sans compte est un parcours valide, fiche 01).
func TestConfirm_WithoutMatchingAccount(t *testing.T) {
	ctx := context.Background()
	seedNewsletterEnv(t, ctx)
	const email = "orphelin-confirm@test.dev"
	const token = "tok-orphan-confirm"
	seedPendingSubscriber(t, ctx, email, token)

	sig := workers.SignConfirm(pubID, email)
	r := newHTTPRouter(t, false)
	w := nlReq(r, "GET",
		"/v1/newsletters/confirm?pub="+pubID+"&email="+email+"&token="+token+"&sig="+sig, "", "")
	if w.Code != 200 {
		t.Fatalf("GET confirm = %d, attendu 200", w.Code)
	}

	var userID *string
	var receive bool
	if err := poolTest.QueryRow(ctx,
		`SELECT "userId", "receiveArticles" FROM "Subscriber" WHERE email = $1 AND "publicationId" = $2`,
		email, pubID).Scan(&userID, &receive); err != nil {
		t.Fatalf("read subscriber: %v", err)
	}
	if userID != nil {
		t.Fatal("rattachement inventé sans compte correspondant")
	}
	if !receive {
		t.Fatal("l'activation par clic ne doit pas dépendre de l'existence d'un compte")
	}
}

// Un userId déjà posé n'est jamais écrasé par une confirmation ultérieure.
func TestConfirm_NeverOverwritesUserID(t *testing.T) {
	ctx := context.Background()
	seedNewsletterEnv(t, ctx)
	const email = "deja-rattache@test.dev"
	const token = "tok-keep-attach"
	seedPendingSubscriber(t, ctx, email, token)

	const existing = "00000000-0000-0000-0000-00000000abcd"
	if _, err := poolTest.Exec(ctx,
		`UPDATE "Subscriber" SET "userId" = $1 WHERE email = $2 AND "publicationId" = $3`,
		existing, email, pubID); err != nil {
		t.Fatalf("seed userId: %v", err)
	}

	sig := workers.SignConfirm(pubID, email)
	r := newHTTPRouter(t, false)
	w := nlReq(r, "GET",
		"/v1/newsletters/confirm?pub="+pubID+"&email="+email+"&token="+token+"&sig="+sig, "", "")
	if w.Code != 200 {
		t.Fatalf("GET confirm = %d, attendu 200", w.Code)
	}

	var userID string
	if err := poolTest.QueryRow(ctx,
		`SELECT "userId" FROM "Subscriber" WHERE email = $1 AND "publicationId" = $2`,
		email, pubID).Scan(&userID); err != nil {
		t.Fatalf("read subscriber: %v", err)
	}
	if userID != existing {
		t.Fatalf("userId écrasé : %s vs %s", userID, existing)
	}
}
