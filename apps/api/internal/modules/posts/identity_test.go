package posts

import (
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
)

// Une pensée appartient à une personne, jamais à un média : même si l'auteur
// est membre actif d'un média, son identité publique reste PERSONAL. Le média
// n'apparaît que sur les articles publiés dans sa publication.
func TestAuthorOfIsAlwaysPersonal(t *testing.T) {
	row := db.GetPostsByIDsRow{
		AuthorID:        "user_camille",
		AuthorName:      pgtype.Text{String: "Camille", Valid: true},
		AuthorUsername:  pgtype.Text{String: "camille", Valid: true},
		AuthorLogo:      pgtype.Text{String: "/avatars/camille.svg", Valid: true},
		AuthorCertified: true,
	}

	author := AuthorOf(&row, map[string]bool{"user_camille": true})
	if author.Type != "PERSONAL" {
		t.Fatalf("type = %q, attendu PERSONAL", author.Type)
	}
	if author.LogoURL == nil || *author.LogoURL != "/avatars/camille.svg" {
		t.Fatalf("logo = %v, le logo personnel doit être conservé", author.LogoURL)
	}
	if !author.IsFollowing || !author.IsCertified {
		t.Fatalf("attributs perdus : %+v", author)
	}
}

func TestActorFromLikeIsAlwaysPersonal(t *testing.T) {
	actor := actorFromLike(db.ListLikesForPostRow{
		UserID:        "user_camille",
		UserName:      pgtype.Text{String: "Camille", Valid: true},
		UserUsername:  pgtype.Text{String: "camille", Valid: true},
		UserCertified: true,
	})
	if actor.Type != "PERSONAL" {
		t.Fatalf("type = %q, attendu PERSONAL", actor.Type)
	}
}
