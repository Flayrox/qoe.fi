package posts

import (
	"context"
	"testing"
	"time"
)

// TestListDrafts — brouillons créés via CreateFull(isDraft) sont listés.
func TestListDrafts(t *testing.T) {
	fx := seedPosts(t)
	svc := newTestService()
	ctx := context.Background()

	now := time.Now().Add(2 * time.Hour)
	_, err := svc.CreateFull(ctx, fx.AuthorID, CreateFullInput{
		Content:       "Brouillon en cours",
		Tags:          []string{"draft"},
		IsDraft:       true,
		ScheduledAt:   &now,
		TriggerWarning: strPtr("sujet sensible"),
	})
	if err != nil {
		t.Fatalf("CreateFull(draft): %v", err)
	}

	// Une pensée publiée ne doit PAS apparaître.
	if _, err := svc.CreateFull(ctx, fx.AuthorID, CreateFullInput{
		Content: "Pensée publiée",
		IsDraft: false,
	}); err != nil {
		t.Fatalf("CreateFull(published): %v", err)
	}

	drafts, err := svc.ListDrafts(ctx, fx.AuthorID, 20)
	if err != nil {
		t.Fatalf("ListDrafts: %v", err)
	}
	if len(drafts) != 1 {
		t.Fatalf("drafts = %d, want 1", len(drafts))
	}
	if drafts[0].Content != "Brouillon en cours" {
		t.Fatalf("draft content = %q", drafts[0].Content)
	}
	if drafts[0].ScheduledAt == nil {
		t.Fatalf("scheduledAt absent")
	}
	if drafts[0].TriggerWarning == nil || *drafts[0].TriggerWarning != "sujet sensible" {
		t.Fatalf("triggerWarning = %v", drafts[0].TriggerWarning)
	}
}

// TestToggleHideReply — l'auteur masque/restaure une réponse.
func TestToggleHideReply(t *testing.T) {
	fx := seedPosts(t)
	svc := newTestService()
	ctx := context.Background()

	// Réponse du viewer à la pensée de l'auteur.
	reply, err := svc.CreateFull(ctx, fx.ViewerID, CreateFullInput{
		Content:  "Une réponse",
		ParentID: &fx.PostID,
	})
	if err != nil {
		t.Fatalf("reply: %v", err)
	}

	// L'auteur masque.
	hidden, err := svc.ToggleHideReply(ctx, reply.ID, fx.AuthorID)
	if err != nil {
		t.Fatalf("hide: %v", err)
	}
	if !hidden {
		t.Fatal("hidden = false, want true")
	}

	// Non-auteur refusé.
	if _, err := svc.ToggleHideReply(ctx, reply.ID, fx.ViewerID); err == nil {
		t.Fatal("viewer should not hide author's reply context")
	}

	// Restauration.
	hidden, err = svc.ToggleHideReply(ctx, reply.ID, fx.AuthorID)
	if err != nil {
		t.Fatalf("unhide: %v", err)
	}
	if hidden {
		t.Fatal("hidden = true after restore")
	}
}

func strPtr(s string) *string { return &s }
