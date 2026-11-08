package feed

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
)

// testFeedRow construit une ligne de post minimale pour l'assemblage des
// slices. Aucun accès DB : buildFeedSlice est une fonction pure.
func testFeedRow(id, content string, parentID *string) db.GetPostsByIDsRow {
	row := db.GetPostsByIDsRow{
		ID:               id,
		Content:          content,
		AuthorId:         "author-" + id,
		AuthorID:         "author-" + id,
		AuthorName:       pgtype.Text{String: "Auteur " + id, Valid: true},
		AuthorUsername:   pgtype.Text{String: id, Valid: true},
		CreatedAt:        pgtype.Timestamp{Time: time.Now(), Valid: true},
		ReplyRestriction: "everyone",
	}
	if parentID != nil {
		row.ParentId = pgtype.Text{String: *parentID, Valid: true}
		row.RootId = pgtype.Text{String: *parentID, Valid: true}
	}
	return row
}

// TestBuildFeedSliceHiddenParent vérifie que la slice conserve la réponse,
// mais jamais le contenu du parent, avec le bon motif.
func TestBuildFeedSliceHiddenParent(t *testing.T) {
	parentID := "parent-1"
	reply := testFeedRow("reply-1", "La réponse visible", &parentID)
	all := map[string]*db.GetPostsByIDsRow{"reply-1": &reply}

	for _, reason := range []string{"blocked", "deleted", "unavailable"} {
		t.Run(reason, func(t *testing.T) {
			slice, conversationRoot, ok := buildFeedSlice(
				&reply, all, nil, nil, nil, nil, true,
				func(string) string { return reason },
			)
			if !ok {
				t.Fatal("la réponse doit être conservée sur un profil")
			}
			if conversationRoot != parentID {
				t.Fatalf("conversationRoot = %q, attendu %q", conversationRoot, parentID)
			}
			if !slice.ParentUnavailable {
				t.Fatal("parentUnavailable doit être vrai")
			}
			if slice.ParentPost != nil {
				t.Fatal("le parent bloqué/indisponible ne doit pas être sérialisé")
			}
			if slice.ParentUnavailableReason != reason {
				t.Fatalf("raison = %q, attendue %q", slice.ParentUnavailableReason, reason)
			}
			if slice.TargetPost.Content != "La réponse visible" {
				t.Fatalf("contenu de la réponse = %q", slice.TargetPost.Content)
			}

			raw, err := json.Marshal(slice)
			if err != nil {
				t.Fatalf("marshal: %v", err)
			}
			if strings.Contains(string(raw), `"parentPost":{`) {
				t.Fatalf("un parent a fuité dans le JSON: %s", raw)
			}
			var decoded map[string]any
			if err := json.Unmarshal(raw, &decoded); err != nil {
				t.Fatalf("unmarshal: %v", err)
			}
			if decoded["parentPost"] != nil {
				t.Fatal("parentPost doit être null")
			}
			target, ok := decoded["targetPost"].(map[string]any)
			if !ok {
				t.Fatal("targetPost absent du JSON")
			}
			if target["parent"] != nil {
				t.Fatal("targetPost.parent doit être null")
			}
			if target["parentUnavailable"] != true {
				t.Fatal("targetPost.parentUnavailable doit être vrai")
			}
		})
	}
}

// TestBuildFeedSliceDropsHiddenParentInFeed vérifie qu'un flux retire la
// réponse orpheline au lieu de la rendre sans contexte.
func TestBuildFeedSliceDropsHiddenParentInFeed(t *testing.T) {
	parentID := "parent-1"
	reply := testFeedRow("reply-1", "La réponse visible", &parentID)
	all := map[string]*db.GetPostsByIDsRow{"reply-1": &reply}

	if _, _, ok := buildFeedSlice(
		&reply, all, nil, nil, nil, nil, false,
		func(string) string { return "blocked" },
	); ok {
		t.Fatal("un flux ne doit pas garder une réponse au parent masqué")
	}
}

// TestBuildFeedSliceVisibleParent vérifie le cas nominal : un parent chargé
// reste rendu normalement, sans placeholder.
func TestBuildFeedSliceVisibleParent(t *testing.T) {
	parent := testFeedRow("parent-1", "Contenu parent visible", nil)
	parentID := parent.ID
	reply := testFeedRow("reply-1", "La réponse visible", &parentID)
	all := map[string]*db.GetPostsByIDsRow{"reply-1": &reply, "parent-1": &parent}

	slice, _, ok := buildFeedSlice(
		&reply, all, nil, nil, nil, nil, true,
		func(string) string { return "blocked" },
	)
	if !ok {
		t.Fatal("la réponse doit être conservée")
	}
	if slice.ParentUnavailable {
		t.Fatal("un parent visible ne doit pas être marqué indisponible")
	}
	if slice.ParentPost == nil || slice.ParentPost.Content != "Contenu parent visible" {
		t.Fatal("le parent visible doit être rendu")
	}
}
