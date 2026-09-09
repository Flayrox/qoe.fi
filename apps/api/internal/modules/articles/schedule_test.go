package articles

// Tests de la programmation d'articles : création avec scheduledAt futur →
// statut SCHEDULED (publié automatiquement par le scheduled publisher), date
// passée → publication immédiate, annulation de programmation, gardes RBAC.

import (
	"context"
	"testing"
	"time"
)

func articleState(t *testing.T, ctx context.Context, id string) (status string, published bool, scheduledAt *time.Time) {
	t.Helper()
	var statusRaw string
	var publishedRaw bool
	var scheduledAtRaw *time.Time
	if err := poolTest.QueryRow(ctx,
		`SELECT status, published, "scheduledAt" FROM "Article" WHERE id = $1`, id,
	).Scan(&statusRaw, &publishedRaw, &scheduledAtRaw); err != nil {
		t.Fatalf("select article %s: %v", id, err)
	}
	return statusRaw, publishedRaw, scheduledAtRaw
}

// TestService_Create_FutureScheduledAt — publier avec une date future →
// SCHEDULED, non publié, date persistée (le worker basculera à l'échéance).
func TestService_Create_FutureScheduledAt(t *testing.T) {
	fx := seed(t)
	svc := newService()
	ctx := context.Background()

	future := time.Now().Add(2 * time.Hour).UTC()
	id, err := svc.Create(ctx, fx.AuthorID, CreateArticleInput{
		PublicationID: fx.PublicationID,
		Title:         "Programmé", Slug: "programme",
		Content: "<p>x</p>", ContentFormat: "html",
		Status: "PUBLISHED", Published: true, ScheduledAt: &future,
	})
	if err != nil {
		t.Fatalf("Create scheduled: %v", err)
	}
	status, published, scheduledAt := articleState(t, ctx, id)
	if status != "SCHEDULED" || published {
		t.Fatalf("article = %s/%v, attendu SCHEDULED/non publié", status, published)
	}
	if scheduledAt == nil || scheduledAt.UTC().Unix() != future.UTC().Unix() {
		t.Fatalf("scheduledAt = %v, attendu %v", scheduledAt, future)
	}
}

// TestService_Create_PastScheduledAt — date passée → publication immédiate.
func TestService_Create_PastScheduledAt(t *testing.T) {
	fx := seed(t)
	svc := newService()
	ctx := context.Background()

	past := time.Now().Add(-time.Hour).UTC()
	id, err := svc.Create(ctx, fx.AuthorID, CreateArticleInput{
		PublicationID: fx.PublicationID,
		Title:         "Déjà mûr", Slug: "deja-mur",
		Content: "<p>x</p>", ContentFormat: "html",
		Status: "PUBLISHED", Published: true, ScheduledAt: &past,
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	status, published, _ := articleState(t, ctx, id)
	if status != "PUBLISHED" || !published {
		t.Fatalf("article = %s/%v, attendu PUBLISHED publié", status, published)
	}
}

// TestService_Schedule_SetAndCancel — l'endpoint /schedule programme puis
// annule (scheduledAt null → retour au brouillon, date effacée).
func TestService_Schedule_SetAndCancel(t *testing.T) {
	fx := seed(t)
	svc := newService()
	ctx := context.Background()

	future := time.Now().Add(3 * time.Hour).UTC()
	if err := svc.Schedule(ctx, "art_test_003", fx.AuthorID, &future); err != nil {
		t.Fatalf("Schedule: %v", err)
	}
	status, published, scheduledAt := articleState(t, ctx, "art_test_003")
	if status != "SCHEDULED" || published || scheduledAt == nil {
		t.Fatalf("après Schedule = %s/%v/%v, attendu SCHEDULED/false/date", status, published, scheduledAt)
	}

	// Annulation.
	if err := svc.Schedule(ctx, "art_test_003", fx.AuthorID, nil); err != nil {
		t.Fatalf("Schedule(nil): %v", err)
	}
	status, published, scheduledAt = articleState(t, ctx, "art_test_003")
	if status != "DRAFT" || published || scheduledAt != nil {
		t.Fatalf("après annulation = %s/%v/%v, attendu DRAFT/false/nil", status, published, scheduledAt)
	}
}

// TestService_Schedule_Guards — date passée refusée ; RBAC refusé pour un
// rédacteur média (programmer = publier de façon différée).
func TestService_Schedule_Guards(t *testing.T) {
	fx := seedMedia(t)
	svc := newService()
	ctx := context.Background()

	// Brouillon créé par l'owner du média.
	id, err := svc.Create(ctx, fx.OwnerID, CreateArticleInput{
		PublicationID: fx.PublicationID,
		Title:         "À programmer", Slug: "a-programmer",
		Content: "<p>x</p>", ContentFormat: "html", Status: "DRAFT",
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	past := time.Now().Add(-time.Minute).UTC()
	// Date passée refusée, même pour l'owner.
	if err := svc.Schedule(ctx, id, fx.OwnerID, &past); err == nil {
		t.Fatal("Schedule(passé) = nil, attendu erreur")
	}
	// Rédacteur sans permission de publier → refus, même avec une date future.
	if err := svc.Schedule(ctx, id, fx.WriterID, timePtr(time.Now().Add(time.Hour))); err == nil {
		t.Fatal("Schedule(writer) = nil, attendu errForbidden")
	}
	// L'owner du média, lui, peut programmer.
	if err := svc.Schedule(ctx, id, fx.OwnerID, timePtr(time.Now().Add(time.Hour))); err != nil {
		t.Fatalf("Schedule(owner) = %v, attendu succès", err)
	}
}

// TestService_SetStatus_Scheduled — SetStatus exige une date future pour
// SCHEDULED et la persiste.
func TestService_SetStatus_Scheduled(t *testing.T) {
	fx := seed(t)
	svc := newService()
	ctx := context.Background()

	if err := svc.SetStatus(ctx, "art_test_003", fx.AuthorID, "SCHEDULED", false, nil); err == nil {
		t.Fatal("SetStatus(SCHEDULED sans date) = nil, attendu erreur")
	}
	future := time.Now().Add(time.Hour).UTC()
	if err := svc.SetStatus(ctx, "art_test_003", fx.AuthorID, "SCHEDULED", false, &future); err != nil {
		t.Fatalf("SetStatus(SCHEDULED): %v", err)
	}
	status, published, scheduledAt := articleState(t, ctx, "art_test_003")
	if status != "SCHEDULED" || published || scheduledAt == nil {
		t.Fatalf("article = %s/%v/%v", status, published, scheduledAt)
	}
}
