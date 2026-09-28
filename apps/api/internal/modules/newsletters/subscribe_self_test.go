package newsletters

import (
	"context"
	"testing"

	db "github.com/qoefi/api/internal/database"
)

// Fiche 01 §2 : le compte connecté s'abonne sans ressaisir d'adresse.
// L'adresse demandée doit être exactement celle du compte (sinon 403) ; si
// elle est confirmée côté fournisseur, activation directe, sinon parcours
// invité (pending + e-mail de confirmation).

type fakeVerifier struct {
	email     string
	confirmed bool
	err       error
}

func (f *fakeVerifier) GetEmailVerification(_ context.Context, _ string) (string, bool, error) {
	return f.email, f.confirmed, f.err
}

func TestSubscribeSelf_MismatchForbidden(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	seedNewsletterEnv(t, ctx)
	svc := NewService(db.New(poolTest), nil)
	svc.SetEmailVerifier(&fakeVerifier{email: "moi@test.dev", confirmed: true})

	// Saisir l'adresse d'un compte ne prouve pas qu'on en est titulaire.
	if _, err := svc.SubscribeSelf(ctx, ownerID, "autre@test.dev", pubID); err == nil {
		t.Fatal("adresse différente de celle du compte acceptée")
	}
	if _, err := svc.SubscribeSelf(ctx, ownerID, "MOI@TEST.DEV ", pubID); err != nil {
		t.Fatalf("la comparaison doit être insensible à la casse et aux espaces : %v", err)
	}
}

func TestSubscribeSelf_UnverifiedGoesPending(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	seedNewsletterEnv(t, ctx)
	svc := NewService(db.New(poolTest), nil)
	svc.SetEmailVerifier(&fakeVerifier{email: "attente@test.dev", confirmed: false})

	res, err := svc.SubscribeSelf(ctx, ownerID, "attente@test.dev", pubID)
	if err != nil {
		t.Fatalf("SubscribeSelf: %v", err)
	}
	if res.Active {
		t.Fatal("adresse non vérifiée activée sans clic")
	}
	var receive, confirmed bool
	var token *string
	if err := poolTest.QueryRow(ctx,
		`SELECT "receiveArticles", "confirmedAt" IS NOT NULL, "confirmationToken"
		 FROM "Subscriber" WHERE email = 'attente@test.dev' AND "publicationId" = $1`,
		pubID).Scan(&receive, &confirmed, &token); err != nil {
		t.Fatalf("read subscriber: %v", err)
	}
	if receive || confirmed || token == nil || *token == "" {
		t.Fatalf("pas en attente : receive=%v confirmed=%v token=%v", receive, confirmed, token)
	}
}

func TestSubscribeSelf_VerifiedActivatesDirectly(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	seedNewsletterEnv(t, ctx)
	svc := NewService(db.New(poolTest), nil)
	svc.SetEmailVerifier(&fakeVerifier{email: "verifie@test.dev", confirmed: true})

	res, err := svc.SubscribeSelf(ctx, ownerID, "verifie@test.dev", pubID)
	if err != nil {
		t.Fatalf("SubscribeSelf: %v", err)
	}
	if !res.Active {
		t.Fatal("adresse vérifiée non activée")
	}
	var receive, confirmed bool
	var userID *string
	if err := poolTest.QueryRow(ctx,
		`SELECT "receiveArticles", "confirmedAt" IS NOT NULL, "userId"
		 FROM "Subscriber" WHERE email = 'verifie@test.dev' AND "publicationId" = $1`,
		pubID).Scan(&receive, &confirmed, &userID); err != nil {
		t.Fatalf("read subscriber: %v", err)
	}
	if !receive || !confirmed {
		t.Fatalf("pas destinataire : receive=%v confirmed=%v", receive, confirmed)
	}
	if userID == nil || *userID != ownerID {
		t.Fatalf("abonnement non rattaché au compte : %v", userID)
	}
}

func TestSubscribeSelf_NoVerifierRefused(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	seedNewsletterEnv(t, ctx)
	svc := NewService(db.New(poolTest), nil)
	// Pas de verifier branché : le parcours connecté est désactivé plutôt que
	// de croire une adresse déclarée.
	if _, err := svc.SubscribeSelf(ctx, ownerID, "x@test.dev", pubID); err == nil {
		t.Fatal("parcours connecté accepté sans vérificateur branché")
	}
}
