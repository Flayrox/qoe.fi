package posts

import (
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
)

func highlightFixture() db.GetHighlightByIDRow {
	return db.GetHighlightByIDRow{
		ID:             "hl-1",
		Text:           "ce qu’il relirait deux fois",
		Note:           pgtype.Text{String: "  Ici la formule revient comme une conclusion.  ", Valid: true},
		IsPublic:       true,
		IsOfficial:     false,
		QuoteOrdinal:   1,
		ArticleId:      "art-1",
		CanonicalStart: pgtype.Int4{Int32: 420, Valid: true},
		CanonicalEnd:   pgtype.Int4{Int32: 450, Valid: true},
		ContentSha:     pgtype.Text{String: "sha-1", Valid: true},
		ReaderID:       "reader-camille",
		ReaderName:     pgtype.Text{String: "Camille", Valid: true},
		ReaderUsername: pgtype.Text{String: "camille", Valid: true},
		ReaderLogo:     pgtype.Text{String: "/avatars/media-camille.svg", Valid: true},
	}
}

func TestCitationSnapshot_KeepsNoteAuthorAndAnchors(t *testing.T) {
	snapshot, err := citationSnapshot(highlightFixture())
	if err != nil {
		t.Fatalf("citationSnapshot: %v", err)
	}

	// La note est le texte cité — débarrassée des blancs de saisie.
	if snapshot.Note != "Ici la formule revient comme une conclusion." {
		t.Errorf("note = %q", snapshot.Note)
	}
	if snapshot.Excerpt != "ce qu’il relirait deux fois" {
		t.Errorf("excerpt = %q", snapshot.Excerpt)
	}
	if snapshot.QuoteOrdinal != 1 {
		t.Errorf("quoteOrdinal = %d, attendu 1 (occurrence annotée)", snapshot.QuoteOrdinal)
	}
	if snapshot.CanonicalStart == nil || *snapshot.CanonicalStart != 420 ||
		snapshot.CanonicalEnd == nil || *snapshot.CanonicalEnd != 450 ||
		snapshot.ContentSha == nil || *snapshot.ContentSha != "sha-1" {
		t.Errorf("ancres perdues : %+v", snapshot)
	}
	if snapshot.Reader.Username == nil || *snapshot.Reader.Username != "camille" {
		t.Errorf("attribution perdue : %+v", snapshot.Reader)
	}
	// Le lecteur cité est une personne, même s'il collabore à un média : la
	// citation ne doit pas lui coller une identité média.
	if snapshot.Reader.Type != "PERSONAL" {
		t.Errorf("type reader = %q, attendu PERSONAL", snapshot.Reader.Type)
	}
}

func TestCitationSnapshot_RefusesPlainHighlight(t *testing.T) {
	h := highlightFixture()
	h.Note = pgtype.Text{String: "   ", Valid: true}

	if _, err := citationSnapshot(h); err == nil || err.Error() != "ANNOTATION_NOT_CITABLE" {
		t.Fatalf("err = %v, attendu ANNOTATION_NOT_CITABLE", err)
	}
}

func TestCitationSnapshot_RefusesPrivateAnnotation(t *testing.T) {
	h := highlightFixture()
	h.IsPublic = false
	h.IsOfficial = false

	if _, err := citationSnapshot(h); err == nil || err.Error() != "ANNOTATION_NOT_CITABLE" {
		t.Fatalf("err = %v, attendu ANNOTATION_NOT_CITABLE", err)
	}
}

func TestCitationSnapshot_AcceptsOfficialAnnotation(t *testing.T) {
	h := highlightFixture()
	h.IsPublic = false
	h.IsOfficial = true

	if _, err := citationSnapshot(h); err != nil {
		t.Fatalf("une annotation officielle est partagée : %v", err)
	}
}

func TestCitationSnapshot_AllowsMissingAnchors(t *testing.T) {
	h := highlightFixture()
	h.CanonicalStart = pgtype.Int4{}
	h.CanonicalEnd = pgtype.Int4{}
	h.ContentSha = pgtype.Text{}

	snapshot, err := citationSnapshot(h)
	if err != nil {
		t.Fatalf("citationSnapshot: %v", err)
	}
	if snapshot.CanonicalStart != nil || snapshot.CanonicalEnd != nil || snapshot.ContentSha != nil {
		t.Errorf("ancres absentes doivent rester nil : %+v", snapshot)
	}
}
