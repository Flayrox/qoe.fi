package feed

import (
	"encoding/json"
	"strings"
	"testing"

	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/modules/posts"
)

func feedTestStringPtr(value string) *string {
	return &value
}

// TestThreadParentStateMatrix couvre les réponses dont le parent est absent de
// la fermeture visible : blocage dans les deux directions, suppression,
// modération, parent normal et descendance multi-niveaux. Le blocage est
// volontairement réduit à un seul motif "blocked" : la direction est déjà
// symétrique dans IsBlockedEitherWay, et le client ne doit jamais la connaître.
func TestThreadParentStateMatrix(t *testing.T) {
	root := testFeedRow("root", "Racine visible", nil)
	direct := testFeedRow("direct", "Réponse directe", feedTestStringPtr("root"))
	nested := testFeedRow("nested", "Réponse imbriquée", feedTestStringPtr("direct"))

	blockedA := "blocked-viewer-to-author"
	blockedB := "blocked-author-to-viewer"
	orphanBlockedA := testFeedRow("orphan-blocked-a", "Orpheline A", &blockedA)
	orphanBlockedB := testFeedRow("orphan-blocked-b", "Orpheline B", &blockedB)
	orphanDeleted := testFeedRow("orphan-deleted", "Orpheline supprimée", feedTestStringPtr("deleted-parent"))
	orphanUnavailable := testFeedRow("orphan-unavailable", "Orpheline modérée", feedTestStringPtr("moderated-parent"))
	orphanChild := testFeedRow("orphan-child", "Enfant de l'orpheline", feedTestStringPtr("orphan-blocked-a"))

	all := map[string]*db.GetPostsByIDsRow{
		"root":               &root,
		"direct":             &direct,
		"nested":             &nested,
		"orphan-blocked-a":   &orphanBlockedA,
		"orphan-blocked-b":   &orphanBlockedB,
		"orphan-deleted":     &orphanDeleted,
		"orphan-unavailable": &orphanUnavailable,
		"orphan-child":       &orphanChild,
	}
	reasons := map[string]string{
		blockedA:           "blocked",
		blockedB:           "blocked",
		"deleted-parent":   "deleted",
		"moderated-parent": "unavailable",
	}
	parentReason := func(parentID string) string { return reasons[parentID] }

	order := []string{
		"direct",
		"nested",
		"orphan-blocked-a",
		"orphan-blocked-b",
		"orphan-deleted",
		"orphan-unavailable",
		"orphan-child",
	}
	got := map[string]posts.FeedPost{}
	for _, id := range order {
		reply := posts.BuildFeedPost(all[id], all, nil, nil, nil, posts.ViewerGraph{})
		markThreadParentUnavailable(&reply, all, parentReason)
		got[id] = reply
	}

	wantReason := map[string]string{
		"orphan-blocked-a":   "blocked",
		"orphan-blocked-b":   "blocked",
		"orphan-deleted":     "deleted",
		"orphan-unavailable": "unavailable",
	}
	for id, reason := range wantReason {
		reply := got[id]
		if !reply.ParentUnavailable {
			t.Errorf("%s : parentUnavailable doit être vrai", id)
		}
		if reply.ParentUnavailableReason != reason {
			t.Errorf("%s : raison = %q, attendue %q", id, reply.ParentUnavailableReason, reason)
		}
		if reply.Parent != nil {
			t.Errorf("%s : le parent ne doit pas être sérialisé", id)
		}
	}

	// Une réponse dont le parent est visible ne gagne aucun bandeau ; l'enfant
	// d'une orpheline reste attaché à sa mère visible, sans double bandeau.
	for _, id := range []string{"direct", "nested", "orphan-child"} {
		if got[id].ParentUnavailable {
			t.Errorf("%s : aucun placeholder attendu", id)
		}
	}

	// Même avec un parent résiduel dans le DTO, le marquage doit couper le
	// contenu et l'auteur avant sérialisation.
	const secretContent = "CONTENU SECRET DU PARENT"
	const secretHandle = "secret-parent"
	for id := range wantReason {
		reply := posts.BuildFeedPost(all[id], all, nil, nil, nil, posts.ViewerGraph{})
		reply.Parent = &posts.FeedPost{
			ID:      *reply.ParentID,
			Content: secretContent,
			Author:  posts.Author{Username: feedTestStringPtr(secretHandle)},
		}
		markThreadParentUnavailable(&reply, all, parentReason)
		if reply.Parent != nil {
			t.Errorf("%s : le parent résiduel doit être coupé", id)
			continue
		}
		raw, err := json.Marshal(reply)
		if err != nil {
			t.Fatalf("%s : marshal: %v", id, err)
		}
		if strings.Contains(string(raw), secretContent) || strings.Contains(string(raw), secretHandle) {
			t.Errorf("%s : fuite du parent dans le JSON: %s", id, raw)
		}
	}
}

// TestThreadAncestorParentState vérifie qu'un ancêtre intermédiaire dont le
// parent manque porte le placeholder, sans marquer à tort le post cible.
func TestThreadAncestorParentState(t *testing.T) {
	target := testFeedRow("target", "Cible visible", feedTestStringPtr("parent"))
	parent := testFeedRow("parent", "Parent visible", feedTestStringPtr("missing-grandparent"))
	all := map[string]*db.GetPostsByIDsRow{"target": &target, "parent": &parent}

	fp := posts.BuildFeedPostWithAncestors(
		&target, all, nil, nil, map[string]bool{}, nil, posts.ViewerGraph{},
	)
	markThreadAncestorParents(&fp, all, func(string) string { return "blocked" })

	if fp.ParentUnavailable {
		t.Fatal("la cible dont le parent direct est visible ne doit pas être marquée")
	}
	if fp.Parent == nil {
		t.Fatal("le parent visible doit rester attaché")
	}
	if !fp.Parent.ParentUnavailable {
		t.Fatal("le parent dont le parent manque doit porter le placeholder")
	}
	if fp.Parent.ParentUnavailableReason != "blocked" {
		t.Fatalf("raison = %q, attendue blocked", fp.Parent.ParentUnavailableReason)
	}
	if fp.Parent.Parent != nil {
		t.Fatal("le grand-parent manquant ne doit pas être sérialisé")
	}
}

// TestThreadTargetMissingParent couvre le cas où le parent direct de la cible
// est bloqué/supprimé : le placeholder est porté par le post cible lui-même.
func TestThreadTargetMissingParent(t *testing.T) {
	target := testFeedRow("target", "Cible visible", feedTestStringPtr("blocked-parent"))
	all := map[string]*db.GetPostsByIDsRow{"target": &target}

	fp := posts.BuildFeedPostWithAncestors(
		&target, all, nil, nil, map[string]bool{}, nil, posts.ViewerGraph{},
	)
	markThreadAncestorParents(&fp, all, func(string) string { return "blocked" })

	if !fp.ParentUnavailable {
		t.Fatal("la cible doit porter le placeholder")
	}
	if fp.ParentUnavailableReason != "blocked" {
		t.Fatalf("raison = %q, attendue blocked", fp.ParentUnavailableReason)
	}
	if fp.Parent != nil {
		t.Fatal("le parent masqué ne doit pas être sérialisé")
	}
}

// TestThreadVisibleParentNoPlaceholder verrouille le cas nominal de la cible.
func TestThreadVisibleParentNoPlaceholder(t *testing.T) {
	target := testFeedRow("target", "Cible visible", feedTestStringPtr("parent"))
	parent := testFeedRow("parent", "Parent visible", nil)
	all := map[string]*db.GetPostsByIDsRow{"target": &target, "parent": &parent}

	fp := posts.BuildFeedPostWithAncestors(
		&target, all, nil, nil, map[string]bool{}, nil, posts.ViewerGraph{},
	)
	markThreadAncestorParents(&fp, all, func(string) string { return "blocked" })

	if fp.ParentUnavailable || fp.Parent == nil || fp.Parent.ParentUnavailable {
		t.Fatal("un parent visible ne doit produire aucun placeholder")
	}
}
