package permissions

// Audit L31 : `CanEditMediaArticle` rend vrai sur une entrée dégénérée
// (auteur d'article vide + membre vide) — un appelant qui oublie de résoudre
// l'auteur ouvre l'édition de TOUS les articles du média.

import "testing"

func TestAuditL31_CanEditMediaArticleRefusesEmptyIdentity(t *testing.T) {
	m := &MediaMember{Role: "writer", Status: "active"}
	if CanEditMediaArticle(m, "", "") {
		t.Fatal("auteur et membre vides → édition autorisée (fail-open sur identité absente)")
	}
	if CanEditMediaArticle(m, "user-1", "") {
		t.Fatal("membre vide → édition autorisée")
	}
	if CanEditMediaArticle(m, "", "user-1") {
		t.Fatal("auteur vide → édition autorisée")
	}
}
