package highlights

import (
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
)

// L'identité d'un annotateur et d'un commentateur est portée par le DTO. Un
// membre média actif doit arriver avec type=MEDIA jusqu'au tiroir d'annotation.
func TestAuthorFromCarriesIdentityType(t *testing.T) {
	media := authorFrom(
		"user_camille",
		pgtype.Text{String: "Camille", Valid: true},
		pgtype.Text{String: "camille", Valid: true},
		pgtype.Text{String: "/avatars/media-camille.svg", Valid: true},
		true,
	)
	if media.Type != "MEDIA" {
		t.Fatalf("type = %q, attendu MEDIA", media.Type)
	}
	if media.Name == nil || *media.Name != "Camille" {
		t.Fatalf("nom perdu : %+v", media)
	}

	person := authorFrom("user_noe", pgtype.Text{String: "Noé", Valid: true}, pgtype.Text{}, pgtype.Text{}, false)
	if person.Type != "PERSONAL" {
		t.Fatalf("type = %q, attendu PERSONAL", person.Type)
	}
	if person.Username != nil || person.LogoURL != nil {
		t.Fatalf("champs absents doivent rester nil : %+v", person)
	}
}
