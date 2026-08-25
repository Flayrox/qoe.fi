package highlights

import (
	"context"
	"testing"

	"github.com/qoefi/api/internal/testutil"
)

// TestUpdateHighlight — bascule de visibilité + note, ownership vérifié.
func TestUpdateHighlight(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := newTestService()
	ctx := context.Background()

	h, err := svc.Create(ctx, fx.ArticleID, fx.AuthorID, "Passage privé", strPtr("note initiale"), false, 0)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	// Rendre public.
	updated, err := svc.Update(ctx, h.ID, fx.AuthorID, nil, boolPtr(true))
	if err != nil {
		t.Fatalf("Update(isPublic): %v", err)
	}
	if !updated.IsPublic {
		t.Fatal("isPublic = false, want true")
	}
	if updated.Note == nil || *updated.Note != "note initiale" {
		t.Fatalf("note changed unexpectedly: %v", updated.Note)
	}

	// Mettre à jour la note.
	updated, err = svc.Update(ctx, h.ID, fx.AuthorID, strPtr("nouvelle note"), nil)
	if err != nil {
		t.Fatalf("Update(note): %v", err)
	}
	if updated.Note == nil || *updated.Note != "nouvelle note" {
		t.Fatalf("note = %v", updated.Note)
	}
	if !updated.IsPublic {
		t.Fatal("isPublic reverted")
	}

	// Non-propriétaire refusé.
	if _, err := svc.Update(ctx, h.ID, fx.ViewerID, nil, boolPtr(false)); err == nil {
		t.Fatal("viewer should not update someone else's highlight")
	}
}

func boolPtr(b bool) *bool { return &b }
