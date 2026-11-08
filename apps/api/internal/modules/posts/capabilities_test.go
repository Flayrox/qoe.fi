package posts

import (
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
)

func capRow(id, authorID string, parentID *string, restriction, content string) *db.GetPostsByIDsRow {
	r := &db.GetPostsByIDsRow{
		ID:               id,
		AuthorId:         authorID,
		ReplyRestriction: restriction,
		Content:          content,
	}
	if parentID != nil {
		r.ParentId = pgtype.Text{String: *parentID, Valid: true}
		r.RootId = pgtype.Text{String: *parentID, Valid: true}
	}
	return r
}

func capStringPtr(v string) *string { return &v }

func TestComputePostCapabilities_Guest(t *testing.T) {
	r := capRow("p1", "author", nil, "everyone", "coucou")
	caps := ComputePostCapabilities(r, "", EmptyViewerGraph("", nil))

	if caps.CanReply {
		t.Fatal("un visiteur ne doit jamais pouvoir répondre")
	}
	if caps.ReplyLockReason != "" {
		t.Fatalf("aucun motif ne doit fuiter pour un visiteur, obtenu %q", caps.ReplyLockReason)
	}
	if caps.CanDelete || caps.CanPin || caps.CanHideReply || caps.IsSelf {
		t.Fatal("un visiteur ne possède aucun droit d'auteur")
	}
	if caps.CanMuteAuthor || caps.CanBlockAuthor {
		t.Fatal("sourdine et blocage exigent une session")
	}
	if !caps.CanReport {
		t.Fatal("signaler reste accessible à un visiteur")
	}
}

func TestComputePostCapabilities_Self(t *testing.T) {
	r := capRow("p1", "author", nil, "subscribers", "coucou")
	caps := ComputePostCapabilities(r, "author", EmptyViewerGraph("author", nil))

	if !caps.IsSelf || !caps.CanDelete || !caps.CanPin {
		t.Fatal("l'auteur peut supprimer et épingler sa pensée racine")
	}
	if !caps.CanReply {
		t.Fatal("l'auteur répond toujours à sa propre pensée, même en subscribers")
	}
	if caps.CanReport || caps.CanMuteAuthor || caps.CanBlockAuthor {
		t.Fatal("on ne signale ni ne masque soi-même")
	}
}

func TestComputePostCapabilities_SelfReplyCannotPin(t *testing.T) {
	r := capRow("reply", "author", capStringPtr("root"), "everyone", "coucou")
	caps := ComputePostCapabilities(r, "author", EmptyViewerGraph("author", nil))
	if caps.CanPin {
		t.Fatal("seule une pensée racine peut être épinglée")
	}
	if caps.CanHideReply {
		t.Fatal("on ne masque pas sa propre réponse")
	}
}

func TestComputePostCapabilities_RootAuthorHidesReply(t *testing.T) {
	parent := capStringPtr("root")
	reply := capRow("reply", "someone", parent, "everyone", "coucou")
	graph := EmptyViewerGraph("root-author", nil)

	caps := ComputePostCapabilities(reply, "root-author", graph)
	if !caps.CanHideReply {
		t.Fatal("l'auteur racine doit pouvoir masquer une réponse")
	}
	if caps.CanDelete {
		t.Fatal("il ne supprime pas la réponse d'autrui")
	}

	third := ComputePostCapabilities(reply, "root-author", EmptyViewerGraph("another", nil))
	if third.CanHideReply {
		t.Fatal("un lecteur tiers ne masque pas une réponse")
	}
}

func TestComputePostCapabilities_SubscribersOnly(t *testing.T) {
	r := capRow("p1", "author", nil, "subscribers", "coucou")
	caps := ComputePostCapabilities(r, "viewer", EmptyViewerGraph("viewer", nil))
	if caps.CanReply {
		t.Fatal("subscribers doit verrouiller la réponse en lecture batch")
	}
	if caps.ReplyLockReason != ReplyLockSubscribersOnly {
		t.Fatalf("motif attendu %q, obtenu %q", ReplyLockSubscribersOnly, caps.ReplyLockReason)
	}
}

func TestComputePostCapabilities_FollowingOnly(t *testing.T) {
	r := capRow("p1", "author", nil, "following", "coucou")

	notFollower := EmptyViewerGraph("viewer", nil)
	notFollower.AuthorFollowsViewer["author"] = false
	caps := ComputePostCapabilities(r, "author", notFollower)
	if caps.CanReply || caps.ReplyLockReason != ReplyLockFollowingOnly {
		t.Fatalf("un lecteur non suivi par l'auteur est verrouillé, obtenu %+v", caps)
	}

	follower := EmptyViewerGraph("viewer", nil)
	follower.AuthorFollowsViewer["author"] = true
	if !ComputePostCapabilities(r, "author", follower).CanReply {
		t.Fatal("un lecteur suivi par l'auteur peut répondre")
	}

	// Relation inverse inconnue (batch sans données) : permissif, le serveur
	// revalide à l'écriture via CanReply.
	unknown := EmptyViewerGraph("viewer", nil)
	if !ComputePostCapabilities(r, "author", unknown).CanReply {
		t.Fatal("relation inconnue ne doit pas masquer le bouton à tort")
	}
}

func TestComputePostCapabilities_MentionedOnly(t *testing.T) {
	graph := EmptyViewerGraph("viewer", nil)
	graph.ViewerUsername = "jean"

	mentioned := capRow("p1", "author", nil, "mentioned", "merci @Jean pour la relecture")
	if !ComputePostCapabilities(mentioned, "author", graph).CanReply {
		t.Fatal("la mention explicite ouvre la réponse (insensible à la casse)")
	}

	notMentioned := capRow("p2", "author", nil, "mentioned", "merci @jeanne pour la relecture")
	caps := ComputePostCapabilities(notMentioned, "author", graph)
	if caps.CanReply || caps.ReplyLockReason != ReplyLockMentionedOnly {
		t.Fatal("@jeanne ne doit pas matcher @jean, et la raison doit être mentioned_only")
	}
}

func TestComputePostCapabilities_Blocked(t *testing.T) {
	r := capRow("p1", "author", nil, "everyone", "coucou")
	graph := EmptyViewerGraph("viewer", nil)
	graph.Blocked["author"] = true
	caps := ComputePostCapabilities(r, "author", graph)
	if caps.CanReply || caps.ReplyLockReason != ReplyLockBlocked {
		t.Fatal("aucune réponse ne part vers un compte bloqué")
	}
	if !caps.CanMuteAuthor {
		t.Fatal("la sourdine reste proposée (idempotente côté serveur)")
	}
}

func TestRootAuthorOf(t *testing.T) {
	root := capRow("root", "root-author", nil, "everyone", "")
	mid := capRow("mid", "mid-author", capStringPtr("root"), "everyone", "")
	leaf := capRow("leaf", "leaf-author", capStringPtr("mid"), "everyone", "")
	// La racine de conversation de la feuille est `root`, pas son parent direct.
	leaf.RootId = pgtype.Text{String: "root", Valid: true}
	all := map[string]*db.GetPostsByIDsRow{"root": root, "mid": mid, "leaf": leaf}

	if got := RootAuthorOf(leaf, all); got != "root-author" {
		t.Fatalf("auteur racine attendu root-author, obtenu %q", got)
	}
	if got := RootAuthorOf(root, all); got != "" {
		t.Fatalf("une pensée racine n'a pas d'auteur racine distinct, obtenu %q", got)
	}
}

func TestContainsMention(t *testing.T) {
	cases := []struct {
		content, username string
		want              bool
	}{
		{"salut @jean", "jean", true},
		{"salut @JEAN", "jean", true},
		{"salut @jeanne", "jean", false},
		{"salut @jean_", "jean", false},
		{"salut @jean.", "jean", true},
		{"rien ici", "jean", false},
		{"salut @jean", "", false},
	}
	for _, c := range cases {
		if got := ContainsMention(c.content, c.username); got != c.want {
			t.Fatalf("ContainsMention(%q, %q) = %v, attendu %v", c.content, c.username, got, c.want)
		}
	}
}
