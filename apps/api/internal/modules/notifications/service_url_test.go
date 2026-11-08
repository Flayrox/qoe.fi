package notifications

import (
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
)

// TestNotificationFromRowIncludesWorkspaceLink verrouille le câblage : la
// liste in-app reçoit l'URL calculée par Go, avec ?ws=<mediaId> uniquement
// quand la publication cible est un média.
func TestNotificationFromRowIncludesWorkspaceLink(t *testing.T) {
	articleRow := func(publicationType, mediaID string) *db.GetNotificationsRow {
		return &db.GetNotificationsRow{
			Type:            "COMMENT",
			ArticleId:       pgtype.Text{String: "art-1", Valid: true},
			ArticleTitle:    pgtype.Text{String: "Titre", Valid: true},
			ArticleSlug:     pgtype.Text{String: "titre", Valid: true},
			PublicationId:   pgtype.Text{String: "pub-1", Valid: true},
			PublicationType: publicationType,
			MediaID:         mediaID,
		}
	}

	if got := notificationFromRow(articleRow("MEDIA", "media-1")).URL; got != "/articles/art-1?ws=media-1" {
		t.Fatalf("URL média = %q", got)
	}
	if got := notificationFromRow(articleRow("PERSONAL", "")).URL; got != "/articles/art-1" {
		t.Fatalf("URL personnelle = %q", got)
	}
}
