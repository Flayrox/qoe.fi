package home

import (
	"context"
	"testing"
)

// Fiche 01 : l'inscription publique crée un abonné EN ATTENTE, jamais un
// destinataire. Seul le clic sur le lien (ConfirmSubscriber) active.
func TestSubscribeToNewsletter_Pending(t *testing.T) {
	ctx := context.Background()
	seedHomeWidgets(t, ctx)
	svc := newTestService()

	ok, err := svc.SubscribeToNewsletter(ctx, "pending1@test.dev", "pub_home_001", "fr")
	if err != nil || !ok {
		t.Fatalf("subscribe: %v %v", err, ok)
	}

	var receive, confirmed bool
	var token *string
	var locale string
	if err := poolTest.QueryRow(ctx,
		`SELECT "receiveArticles", "confirmedAt" IS NOT NULL, "confirmationToken", locale
		 FROM "Subscriber" WHERE email = 'pending1@test.dev' AND "publicationId" = 'pub_home_001'`,
	).Scan(&receive, &confirmed, &token, &locale); err != nil {
		t.Fatalf("read subscriber: %v", err)
	}
	if receive {
		t.Fatal("receiveArticles = true : l'inscription ne doit pas rendre destinataire")
	}
	if confirmed {
		t.Fatal("confirmedAt renseigné sans clic : la preuve doit venir du destinataire")
	}
	if token == nil || *token == "" {
		t.Fatal("aucun token : sans lui, aucune confirmation n'est possible")
	}
	if locale != "fr" {
		t.Fatalf("locale = %q, attendu fr", locale)
	}

	// Réinscription : toujours en attente, token rafraîchi (l'ancien lien meurt).
	var token2 *string
	if _, err := svc.SubscribeToNewsletter(ctx, "pending1@test.dev", "pub_home_001", "fr"); err != nil {
		t.Fatalf("resubscribe: %v", err)
	}
	if err := poolTest.QueryRow(ctx,
		`SELECT "confirmationToken" FROM "Subscriber" WHERE email = 'pending1@test.dev' AND "publicationId" = 'pub_home_001'`,
	).Scan(&token2); err != nil {
		t.Fatalf("read token: %v", err)
	}
	if token2 == nil || *token2 == "" || *token2 == *token {
		t.Fatal("le token doit être renouvelé à chaque demande (liens précédents invalidés)")
	}
	var receive2 bool
	if err := poolTest.QueryRow(ctx,
		`SELECT "receiveArticles" FROM "Subscriber" WHERE email = 'pending1@test.dev' AND "publicationId" = 'pub_home_001'`,
	).Scan(&receive2); err != nil {
		t.Fatalf("read: %v", err)
	}
	if receive2 {
		t.Fatal("la réinscription ne doit pas activer")
	}
}

// Une adresse déjà confirmée qui se réinscrit ne change rien : pas de nouveau
// token, pas de confirmation à renvoyer, état intact.
func TestSubscribeToNewsletter_AlreadyConfirmedUntouched(t *testing.T) {
	ctx := context.Background()
	seedHomeWidgets(t, ctx)
	svc := newTestService()

	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Subscriber" (id, email, "publicationId", locale, "isActive", "receiveArticles", "confirmedAt", "createdAt", "updatedAt")
		 VALUES (gen_random_uuid()::text, 'deja@test.dev', 'pub_home_001', 'en', true, true, now(), now(), now())
		 ON CONFLICT ("email", "publicationId") DO NOTHING`); err != nil {
		t.Fatalf("seed: %v", err)
	}
	if _, err := svc.SubscribeToNewsletter(ctx, "deja@test.dev", "pub_home_001", "en"); err != nil {
		t.Fatalf("resubscribe: %v", err)
	}
	var receive, confirmed bool
	var token *string
	var locale string
	if err := poolTest.QueryRow(ctx,
		`SELECT "receiveArticles", "confirmedAt" IS NOT NULL, "confirmationToken", locale
		 FROM "Subscriber" WHERE email = 'deja@test.dev' AND "publicationId" = 'pub_home_001'`,
	).Scan(&receive, &confirmed, &token, &locale); err != nil {
		t.Fatalf("read: %v", err)
	}
	if !receive || !confirmed || token != nil {
		t.Fatalf("abonné confirmé modifié : receive=%v confirmed=%v token=%v", receive, confirmed, token)
	}
	if locale != "en" {
		t.Fatalf("locale = %q, attendu en (conservée, pas écrasée inutilement)", locale)
	}
}

// Une réinscription après désabonnement ne réactive pas : seul le clic le fait.
func TestSubscribeToNewsletter_UnsubscribedStaysOff(t *testing.T) {
	ctx := context.Background()
	seedHomeWidgets(t, ctx)
	svc := newTestService()

	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Subscriber" (id, email, "publicationId", locale, "isActive", "receiveArticles", "confirmedAt", "createdAt", "updatedAt")
		 VALUES (gen_random_uuid()::text, 'parti@test.dev', 'pub_home_001', 'fr', false, false, now() - interval '30 days', now(), now())
		 ON CONFLICT ("email", "publicationId") DO UPDATE SET "isActive" = false, "receiveArticles" = false`); err != nil {
		t.Fatalf("seed: %v", err)
	}
	if _, err := svc.SubscribeToNewsletter(ctx, "parti@test.dev", "pub_home_001", "fr"); err != nil {
		t.Fatalf("resubscribe: %v", err)
	}
	var receive bool
	var token *string
	if err := poolTest.QueryRow(ctx,
		`SELECT "receiveArticles", "confirmationToken" FROM "Subscriber" WHERE email = 'parti@test.dev' AND "publicationId" = 'pub_home_001'`,
	).Scan(&receive, &token); err != nil {
		t.Fatalf("read: %v", err)
	}
	if receive {
		t.Fatal("un désabonné a été réactivé par simple saisie : seul son clic peut le faire")
	}
	if token == nil || *token == "" {
		t.Fatal("un nouveau token doit permettre la réinscription explicite par clic")
	}
}
