package newsletters

import (
	"context"
	"errors"
	"log"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/testutil"
)

var poolTest *pgxpool.Pool

func TestMain(m *testing.M) {
	p, err := testutil.Pool(context.Background())
	if err != nil {
		log.Fatalf("testcontainers: %v", err)
	}
	poolTest = p
	code := m.Run()
	testutil.Cleanup()
	os.Exit(code)
}

const (
	ownerID  = "00000000-0000-0000-0000-0000000000b1"
	stranger = "00000000-0000-0000-0000-0000000000b2"
	pubID    = "pub_newsletter_001"
)

func seedNewsletterEnv(t *testing.T, ctx context.Context) {
	t.Helper()
	if _, err := poolTest.Exec(ctx, `TRUNCATE "NewsletterIssue", "NewsletterDelivery", "Subscriber", "User", "Publication" CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	if _, err := poolTest.Exec(ctx, `INSERT INTO "Publication" (id, type, name, slug, "createdAt", "updatedAt") VALUES ($1, 'PERSONAL', 'Pub Test', 'pub-test', now(), now())`, pubID); err != nil {
		t.Fatalf("publication: %v", err)
	}
	// L'owner porte la publication (contrainte unique sur User.publicationId) ;
	// l'étranger n'en a pas → non-owner.
	if _, err := poolTest.Exec(ctx, `INSERT INTO "User" (id, email, username, name, role, "publicationId", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, 'creator', $5, now(), now())`, ownerID, "owner@test.dev", "owner", "Owner", pubID); err != nil {
		t.Fatalf("user owner: %v", err)
	}
	if _, err := poolTest.Exec(ctx, `INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, 'creator', now(), now())`, stranger, "stranger@test.dev", "stranger", "Stranger"); err != nil {
		t.Fatalf("user stranger: %v", err)
	}
	if _, err := poolTest.Exec(ctx, `INSERT INTO "Subscriber" (id, email, "publicationId", "receiveArticles", "updatedAt") VALUES ('sub_1', 'reader@test.dev', $1, true, now()), ('sub_2', 'reader2@test.dev', $1, true, now()), ('sub_3', 'optout@test.dev', $1, false, now())`, pubID); err != nil {
		t.Fatalf("subscribers: %v", err)
	}
}

func newTestService() *Service {
	return NewService(db.New(poolTest), nil)
}

func TestNewsletterLifecycle(t *testing.T) {
	ctx := context.Background()
	seedNewsletterEnv(t, ctx)
	svc := newTestService()

	// Création d'un brouillon.
	issue, err := svc.CreateDraft(ctx, ownerID, CreateInput{
		PublicationID: pubID,
		Subject:       "Ma première newsletter",
		PreviewText:   "Un aperçu",
		Html:          "<h1>Bonjour</h1>",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if issue.Status != "DRAFT" {
		t.Fatalf("status = %s, attendu DRAFT", issue.Status)
	}

	// Liste.
	items, err := svc.ListIssues(ctx, ownerID, "")
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(items) != 1 || items[0].Subject != "Ma première newsletter" {
		t.Fatalf("list = %+v", items)
	}

	// Mise à jour du brouillon.
	updated, err := svc.UpdateDraft(ctx, ownerID, issue.ID, CreateInput{
		PublicationID: pubID,
		Subject:       "Sujet corrigé",
		Html:          "<h1>Bonjour</h1><p>Mise à jour</p>",
	})
	if err != nil || updated.Subject != "Sujet corrigé" {
		t.Fatalf("update: %v (%+v)", err, updated)
	}

	// Envoi → SENDING.
	if err := svc.Send(ctx, ownerID, issue.ID); err != nil {
		t.Fatalf("send: %v", err)
	}
	items, _ = svc.ListIssues(ctx, ownerID, pubID)
	if items[0].Status != "SENDING" {
		t.Fatalf("status après send = %s, attendu SENDING", items[0].Status)
	}
}

func TestNewsletterOwnershipAndValidation(t *testing.T) {
	ctx := context.Background()
	seedNewsletterEnv(t, ctx)
	svc := newTestService()

	// Non-owner → refusé.
	if _, err := svc.CreateDraft(ctx, stranger, CreateInput{
		PublicationID: pubID, Subject: "S", Html: "<p>H</p>",
	}); !errors.Is(err, errForbidden) {
		t.Fatalf("create par étranger = %v, attendu errForbidden", err)
	}

	// Owner sans publicationId → résolu via User.publicationId.
	issue, err := svc.CreateDraft(ctx, ownerID, CreateInput{
		Subject: "Sans publicationId", Html: "<p>OK</p>",
	})
	if err != nil {
		t.Fatalf("create sans publicationId: %v", err)
	}
	if issue.PublicationID != pubID {
		t.Fatalf("publicationId = %s, attendu %s", issue.PublicationID, pubID)
	}

	// Champs manquants → erreur.
	if _, err := svc.CreateDraft(ctx, ownerID, CreateInput{PublicationID: pubID}); err == nil {
		t.Fatal("create sans contenu = nil, attendu erreur")
	}

	// Issue inexistante → errNotFound.
	if err := svc.DeleteDraft(ctx, ownerID, "nope"); !errors.Is(err, errNotFound) {
		t.Fatalf("delete inexistante = %v, attendu errNotFound", err)
	}
}

func TestNewsletterUnsubscribe(t *testing.T) {
	ctx := context.Background()
	seedNewsletterEnv(t, ctx)
	svc := newTestService()

	// L'abonné reçoit les articles (receiveArticles=true)…
	var before bool
	_ = poolTest.QueryRow(ctx, `SELECT "receiveArticles" FROM "Subscriber" WHERE id='sub_1'`).Scan(&before)
	if !before {
		t.Fatal("sub_1 devrait recevoir les articles")
	}

	if err := svc.Unsubscribe(ctx, pubID, "reader@test.dev"); err != nil {
		t.Fatalf("unsubscribe: %v", err)
	}

	var after bool
	_ = poolTest.QueryRow(ctx, `SELECT "receiveArticles" FROM "Subscriber" WHERE id='sub_1'`).Scan(&after)
	if after {
		t.Fatal("sub_1 ne devrait plus recevoir les articles")
	}
}
