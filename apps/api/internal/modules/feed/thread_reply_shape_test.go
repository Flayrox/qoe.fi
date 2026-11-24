package feed

import (
	"testing"

	"github.com/qoefi/api/internal/modules/posts"
)

// ─────────────────────────────────────────────────────────────────────────────
// Thread() et /replies (L45) — une seule forme, tombstone compris.
// Avant, Thread() sautait les réponses supprimées : le fil affiché ne
// correspondait plus à sa pagination, et le client voyait une forme différente
// selon l'endpoint. Ces tests figent la parité, sans base.
// ─────────────────────────────────────────────────────────────────────────────

func TestThreadReplyFor_TombstoneKeepsPlaceWithoutContent(t *testing.T) {
	parent := "c0"
	root := "c0"
	item := posts.ReplyItem{
		ID:              "c1",
		ParentID:        &parent,
		RootID:          &root,
		CreatedAt:       "2026-01-02T10:00:00Z",
		Tombstone:       true,
		TombstoneReason: "deleted",
		Why:             "Message supprimé.",
	}

	reply, ok := threadReplyFor(item, func(string) (*posts.FeedPost, bool) {
		t.Fatal("un tombstone ne doit jamais être hydraté")
		return nil, false
	})

	if !ok {
		t.Fatal("le tombstone doit garder sa place dans le fil")
	}
	if !reply.Tombstone || reply.Why != "Message supprimé." || reply.TombstoneReason != "deleted" {
		t.Fatalf("forme tombstone incomplète : %+v", reply)
	}
	if reply.Content != "" || reply.Author.ID != "" || reply.AuthorID != "" {
		t.Fatalf("contenu ou auteur ne doit jamais sortir : %+v", reply)
	}
	if reply.ParentID == nil || *reply.ParentID != "c0" || reply.RootID == nil || *reply.RootID != "c0" {
		t.Fatalf("la place dans l'arbre est perdue : %+v", reply)
	}
}

func TestThreadReplyFor_LivingReplyIsHydrated(t *testing.T) {
	item := posts.ReplyItem{ID: "c2", CreatedAt: "2026-01-02T10:00:00Z"}
	hydrated := &posts.FeedPost{ID: "c2", Content: "Vivant", Author: posts.Author{ID: "u1"}}

	reply, ok := threadReplyFor(item, func(id string) (*posts.FeedPost, bool) {
		if id != "c2" {
			t.Fatalf("hydratation sur le mauvais id : %s", id)
		}
		return hydrated, true
	})

	if !ok || reply.Content != "Vivant" || reply.Author.ID != "u1" || reply.Tombstone {
		t.Fatalf("réponse vivante mal rendue : %+v (ok=%v)", reply, ok)
	}
}
