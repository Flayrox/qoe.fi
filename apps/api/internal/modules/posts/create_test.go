package posts

import (
	"context"
	"testing"
)

// TestCreate_WithParent exerce le créateur legacy avec un parent (canonical id → root).
func TestCreate_WithParent(t *testing.T) {
	fx := seedPosts(t)
	svc := newTestService()
	ctx := context.Background()

	parent := fx.PostID
	post, err := svc.Create(ctx, fx.ViewerID, "Réponse via Create(parent)", nil, &parent, nil)
	if err != nil {
		t.Fatalf("Create(parent): %v", err)
	}
	// Le parent est bien renseigné en base (rootId = canonical = lui-même).
	var parentID, rootID string
	if err := poolTest.QueryRow(ctx,
		`SELECT COALESCE("parentId",''), COALESCE("rootId",'') FROM "Post" WHERE id=$1::text`, post.ID).Scan(&parentID, &rootID); err != nil {
		t.Fatalf("parent query: %v", err)
	}
	if parentID != parent {
		t.Fatalf("parentId = %q, attendu %q", parentID, parent)
	}
	if rootID != parent {
		t.Fatalf("rootId = %q, attendu %q", rootID, parent)
	}

	// Compteur de réponses du parent incrémenté.
	var count int
	if err := poolTest.QueryRow(ctx,
		`SELECT "replyCount" FROM "Post" WHERE id=$1::text`, parent).Scan(&count); err != nil {
		t.Fatalf("replyCount: %v", err)
	}
	if count < 1 {
		t.Fatalf("replyCount = %d, attendu ≥1", count)
	}
}

// TestCreate_PureRepost crée un repost pur (repostId sans contenu).
func TestCreate_PureRepost(t *testing.T) {
	fx := seedPosts(t)
	svc := newTestService()
	ctx := context.Background()

	target := fx.PostID
	post, err := svc.Create(ctx, fx.ViewerID, "", nil, nil, &target)
	if err != nil {
		t.Fatalf("Create(repost): %v", err)
	}
	if post.RepostID == nil || *post.RepostID != target {
		t.Fatalf("repostId = %v, attendu %q", post.RepostID, target)
	}
}

// TestCreate_WithAttachments puis Get exerce l'assemblage des pièces jointes.
func TestCreate_WithAttachments(t *testing.T) {
	fx := seedPosts(t)
	svc := newTestService()
	ctx := context.Background()

	w, h := 800, 600
	post, err := svc.CreateFull(ctx, fx.AuthorID, CreateFullInput{
		Content: "Pensée avec média et sondage",
		Attachments: []AttachmentInput{
			{URL: "https://img.example.com/a.jpg", Type: "IMAGE", AltText: "alt", Width: &w, Height: &h},
		},
		Poll: &PollInput{Options: []string{"Option A", "Option B"}, DurationHours: 48},
	})
	if err != nil {
		t.Fatalf("CreateFull(media): %v", err)
	}

	// Get re-assemble la pensée : pièces jointes + sondage présents.
	got, err := svc.Get(ctx, post.ID, fx.AuthorID)
	if err != nil {
		t.Fatalf("Get(media): %v", err)
	}
	if len(got.Attachments) != 1 {
		t.Fatalf("attachments = %d, attendu 1", len(got.Attachments))
	}
	if got.Attachments[0].URL != "https://img.example.com/a.jpg" {
		t.Errorf("attachment url = %q", got.Attachments[0].URL)
	}
	if got.Poll == nil || len(got.Poll.Options) != 2 {
		t.Fatalf("poll = %+v", got.Poll)
	}
}

// TestGet_AncestorChain couvre la boucle d'ancêtres (root → parent) de Get.
func TestGet_AncestorChain(t *testing.T) {
	fx := seedPosts(t)
	svc := newTestService()
	ctx := context.Background()

	root, err := svc.Create(ctx, fx.AuthorID, "racine", nil, nil, nil)
	if err != nil {
		t.Fatalf("Create(root): %v", err)
	}
	// Réponse au root.
	mid, err := svc.Create(ctx, fx.ViewerID, "niveau 1", nil, &root.ID, nil)
	if err != nil {
		t.Fatalf("Create(l1): %v", err)
	}
	// Réponse au niveau 1.
	leaf, err := svc.Create(ctx, fx.AuthorID, "niveau 2", nil, &mid.ID, nil)
	if err != nil {
		t.Fatalf("Create(l2): %v", err)
	}

	got, err := svc.Get(ctx, leaf.ID, fx.AuthorID)
	if err != nil {
		t.Fatalf("Get(leaf): %v", err)
	}
	// La chaîne d'ancêtres est chargée et chaînée (leaf → mid → root).
	if got.Parent == nil || got.Parent.ID != mid.ID {
		t.Fatalf("leaf.Parent = %+v, attendu %q", got.Parent, mid.ID)
	}
	if got.Parent.Parent == nil || got.Parent.Parent.ID != root.ID {
		t.Fatalf("leaf.Parent.Parent = %+v, attendu racine", got.Parent.Parent)
	}
}

func TestCreate_EmptyContentNoRepost_Error(t *testing.T) {
	fx := seedPosts(t)
	svc := newTestService()
	if _, err := svc.Create(context.Background(), fx.AuthorID, "", nil, nil, nil); err == nil {
		t.Fatal("Create(vide) sans repost doit échouer")
	}
}