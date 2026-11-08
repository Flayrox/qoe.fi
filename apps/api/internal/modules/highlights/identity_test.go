package highlights

import (
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
)

// Un annotateur ou commentateur est une personne, même membre d'un média :
// l'identité média ne doit pas fuiter dans le tiroir d'annotation.
func TestAuthorFromCarriesIdentityType(t *testing.T) {
	member := authorFrom(
		"user_camille",
		pgtype.Text{String: "Camille", Valid: true},
		pgtype.Text{String: "camille", Valid: true},
		pgtype.Text{String: "/avatars/camille.svg", Valid: true},
	)
	if member.Type != "PERSONAL" {
		t.Fatalf("type = %q, attendu PERSONAL", member.Type)
	}
	if member.Name == nil || *member.Name != "Camille" {
		t.Fatalf("nom perdu : %+v", member)
	}

	person := authorFrom("user_noe", pgtype.Text{String: "Noé", Valid: true}, pgtype.Text{}, pgtype.Text{})
	if person.Type != "PERSONAL" {
		t.Fatalf("type = %q, attendu PERSONAL", person.Type)
	}
	if person.Username != nil || person.LogoURL != nil {
		t.Fatalf("champs absents doivent rester nil : %+v", person)
	}
}
