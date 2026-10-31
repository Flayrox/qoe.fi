package posts

import (
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
)

// Le type d'identité d'un auteur de pensée est dérivé de sa membership média
// active, et non de la surface d'affichage. Sans ce champ, ThoughtCard ne peut
// pas savoir qu'un compte média doit garder un avatar carré.
func TestAuthorOfCarriesIdentityType(t *testing.T) {
	row := db.GetPostsByIDsRow{
		AuthorID:        "user_camille",
		AuthorName:      pgtype.Text{String: "Camille", Valid: true},
		AuthorUsername:  pgtype.Text{String: "camille", Valid: true},
		AuthorLogo:      pgtype.Text{String: "/avatars/media-camille.svg", Valid: true},
		AuthorCertified: true,
		AuthorIsMedia:   true,
	}

	author := AuthorOf(&row, map[string]bool{"user_camille": true})
	if author.Type != "MEDIA" {
		t.Fatalf("type = %q, attendu MEDIA", author.Type)
	}
	if !author.IsFollowing || !author.IsCertified {
		t.Fatalf("attributs perdus : %+v", author)
	}

	row.AuthorIsMedia = false
	if got := AuthorOf(&row, nil).Type; got != "PERSONAL" {
		t.Fatalf("type = %q, attendu PERSONAL", got)
	}
}

func TestActorFromLikeCarriesIdentityType(t *testing.T) {
	actor := actorFromLike(db.ListLikesForPostRow{
		UserID:        "user_camille",
		UserName:      pgtype.Text{String: "Camille", Valid: true},
		UserUsername:  pgtype.Text{String: "camille", Valid: true},
		UserIsMedia:   true,
		UserCertified: true,
	})
	if actor.Type != "MEDIA" {
		t.Fatalf("type = %q, attendu MEDIA", actor.Type)
	}
}
