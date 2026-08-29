package permissions

import "testing"

func TestCanMedia_NilAndStatus(t *testing.T) {
	if CanMedia(nil, PermCreateArticles) {
		t.Fatal("nil member doit être refusé")
	}
	if CanMedia(&MediaMember{Role: "owner", Status: "suspended"}, PermCreateArticles) {
		t.Fatal("status suspendu doit refuser")
	}
	if !CanMedia(&MediaMember{Role: "owner", Status: "active"}, PermCreateArticles) {
		t.Fatal("status actif doit autoriser")
	}
	if !CanMedia(&MediaMember{Role: "owner", Status: "invited"}, PermCreateArticles) {
		t.Fatal("status invité doit autoriser (parité auth.ts)")
	}
}

func TestCanMedia_ByRole(t *testing.T) {
	cases := []struct {
		role, perm string
		want       bool
	}{
		{"owner", PermManageBilling, true},
		{"owner", PermDeleteAny, true},
		{"editor", PermPublishAny, true},
		{"editor", PermManageBilling, false}, // billing réservé owner
		{"writer", PermCreateArticles, true},
		{"writer", PermPublishAny, false},
		{"writer", PermEditOwn, true},
		{"viewer", PermViewAnalytics, true},
		{"viewer", PermCreateArticles, false},
		{"ghost", PermViewAnalytics, false}, // rôle inconnu
	}
	for _, c := range cases {
		m := &MediaMember{Role: c.role}
		if got := CanMedia(m, c.perm); got != c.want {
			t.Errorf("CanMedia(role=%s, perm=%s) = %v, attendu %v", c.role, c.perm, got, c.want)
		}
	}
}

func TestCanMedia_Overrides(t *testing.T) {
	// Accord explicite sur un rôle qui ne l'a pas.
	m := &MediaMember{Role: "writer", Permissions: []string{PermPublishAny}}
	if !CanMedia(m, PermPublishAny) {
		t.Fatal("override + doit accorder")
	}
	// Retrait explicite sur owner.
	m2 := &MediaMember{Role: "owner", Permissions: []string{"-" + PermManageBilling}}
	if CanMedia(m2, PermManageBilling) {
		t.Fatal("override - doit retirer")
	}
	// Un override non lié (à une permission que writer n'a PAS par défaut)
	// ne doit pas accorder cette permission.
	m3 := &MediaMember{Role: "writer", Permissions: []string{PermViewAnalytics}}
	if CanMedia(m3, PermPublishAny) {
		t.Fatal("override non lié ne doit pas accorder une permission absente du rôle")
	}
}

func TestCanEditMediaArticle(t *testing.T) {
	if CanEditMediaArticle(nil, "a", "b") {
		t.Fatal("nil doit refuser")
	}
	admin := &MediaMember{Role: "editor"}
	if !CanEditMediaArticle(admin, "someoneelse", "me") {
		t.Fatal("editor PermEditAny doit éditer l'article de n'importe qui")
	}
	writer := &MediaMember{Role: "writer"}
	if !CanEditMediaArticle(writer, "me", "me") {
		t.Fatal("writer doit éditer son propre article")
	}
	if CanEditMediaArticle(writer, "someoneelse", "me") {
		t.Fatal("writer ne doit PAS éditer l'article d'autrui")
	}
}

func TestIsMediaAdmin(t *testing.T) {
	if IsMediaAdmin(nil) {
		t.Fatal("nil ne doit pas être admin")
	}
	if !IsMediaAdmin(&MediaMember{Role: "owner"}) {
		t.Error("owner admin")
	}
	if !IsMediaAdmin(&MediaMember{Role: "editor"}) {
		t.Error("editor admin (>= editor)")
	}
	if IsMediaAdmin(&MediaMember{Role: "writer"}) {
		t.Error("writer pas admin")
	}
	if IsMediaAdmin(&MediaMember{Role: "viewer"}) {
		t.Error("viewer pas admin")
	}
}