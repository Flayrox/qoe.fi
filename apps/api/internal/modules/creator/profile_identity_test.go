package creator

import (
	"testing"

	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/identity"
)

// Le profil public d'une personne est PERSONAL : la décision ne prend que le
// type de sa publication, jamais une appartenance à un média (MediaMember).
func TestPublicProfileIdentityUsesPublicationType(t *testing.T) {
	tests := []struct {
		name            string
		publicationType db.PublicationType
		want            string
	}{
		{"profil personnel d'un membre média", db.PublicationTypePERSONAL, identity.Personal},
		{"profil d'une publication média", db.PublicationTypeMEDIA, identity.Media},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := publicProfileIdentity(tt.publicationType); got != tt.want {
				t.Fatalf("type = %q, attendu %q", got, tt.want)
			}
		})
	}
}
