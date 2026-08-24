package workspaces

import (
	"context"
	"log"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/testutil"
)

var poolTest *pgxpool.Pool

func TestMain(m *testing.M) {
	p, err := testutil.Pool(context.Background())
	if err != nil {
		log.Fatalf("testcontainers: %v", err)
	}
	poolTest = p
	code := m.Run()
	testutil.Cleanup()
	os.Exit(code)
}

func TestGetActive_MediaMember(t *testing.T) {
	mfx, err := testutil.SeedMedia(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed media: %v", err)
	}
	svc := NewService(poolTest)

	ws, err := svc.GetActive(context.Background(), mfx.OwnerID, "media_001")
	if err != nil {
		t.Fatalf("GetActive: %v", err)
	}
	if ws.Type != "MEDIA" {
		t.Fatalf("type = %s, attendu MEDIA", ws.Type)
	}
	if ws.MediaID == nil || *ws.MediaID != "media_001" {
		t.Fatal("mediaId manquant")
	}
	if ws.MediaRole == nil || *ws.MediaRole != "owner" {
		t.Fatalf("role = %v, attendu owner", ws.MediaRole)
	}
	if ws.PublicationID != mfx.PublicationID {
		t.Fatalf("publicationId = %s, attendu %s", ws.PublicationID, mfx.PublicationID)
	}
	if ws.Name != "Média Quotidien" || ws.Slug != "media-quotidien" {
		t.Fatalf("nom/slug = %q/%q", ws.Name, ws.Slug)
	}
}

func TestGetActive_FallbackPersonalWhenNotMember(t *testing.T) {
	mfx, err := testutil.SeedMedia(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed media: %v", err)
	}
	svc := NewService(poolTest)

	// Un membre du média avec un mediaId inconnu → fallback personnel.
	ws, err := svc.GetActive(context.Background(), mfx.OwnerID, "media-inexistant")
	if err != nil {
		t.Fatalf("GetActive: %v", err)
	}
	if ws.Type != "PERSONAL" {
		t.Fatalf("type = %s, attendu PERSONAL (fallback)", ws.Type)
	}
}

func TestGetActive_PersonalFallbackWithoutPublication(t *testing.T) {
	mfx, err := testutil.SeedMedia(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed media: %v", err)
	}
	svc := NewService(poolTest)

	// Les users seedés n'ont pas de publication personnelle : le service
	// renvoie un workspace fictif adossé au userId.
	ws, err := svc.GetActive(context.Background(), mfx.ViewerID, "")
	if err != nil {
		t.Fatalf("GetActive: %v", err)
	}
	if ws.Type != "PERSONAL" || ws.PublicationID != mfx.ViewerID {
		t.Fatalf("fallback = %+v, attendu PERSONAL/userId", ws)
	}
	if ws.Slug != "personal" || ws.Name != "Profil Personnel" {
		t.Fatalf("nom/slug fallback = %q/%q", ws.Name, ws.Slug)
	}
}

func TestGetActive_RealPersonalPublication(t *testing.T) {
	if _, err := testutil.SeedMedia(context.Background(), poolTest); err != nil {
		t.Fatalf("seed media: %v", err)
	}
	// SeedPosts ne truncate ni User ni Publication : il crée un auteur
	// rattaché à sa publication personnelle.
	pfx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed posts: %v", err)
	}
	svc := NewService(poolTest)

	var wantPub string
	if err := poolTest.QueryRow(context.Background(),
		`SELECT "publicationId" FROM "User" WHERE id = $1`, pfx.AuthorID,
	).Scan(&wantPub); err != nil {
		t.Fatalf("publication auteur: %v", err)
	}

	ws, err := svc.GetActive(context.Background(), pfx.AuthorID, "")
	if err != nil {
		t.Fatalf("GetActive: %v", err)
	}
	if ws.Type != "PERSONAL" || ws.PublicationID != wantPub {
		t.Fatalf("workspace = %+v, attendu PERSONAL/%s", ws, wantPub)
	}
	if ws.Slug == "" || ws.Name == "" {
		t.Fatalf("nom/slug vides : %+v", ws)
	}
}
