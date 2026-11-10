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
	p, err := testutil.TryPool(context.Background())
	if err != nil {
		log.Printf("testcontainers indisponible, tests DB skippes: %v", err)
		poolTest = nil
	} else {
		poolTest = p
	}
	code := m.Run()
	if poolTest != nil {
		testutil.Cleanup()
	}
	os.Exit(code)
}

// requirePool skippe les tests DB quand Docker/testcontainers est absent.
func requirePool(t *testing.T) {
	t.Helper()
	if poolTest == nil {
		t.Skip("DB indisponible (Docker/testcontainers requis)")
	}
}

func TestGetActive_MediaMember(t *testing.T) {
	requirePool(t)
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
	if ws.PublisherID != mfx.PublisherID {
		t.Fatalf("publisherId = %s, attendu %s", ws.PublisherID, mfx.PublisherID)
	}
	if ws.Name != "Média Quotidien" || ws.Slug != "media-quotidien" {
		t.Fatalf("nom/slug = %q/%q", ws.Name, ws.Slug)
	}
}

func TestGetActive_FallbackPersonalWhenNotMember(t *testing.T) {
	requirePool(t)
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

func TestGetActive_PersonalFallbackWithoutPublisher(t *testing.T) {
	requirePool(t)
	mfx, err := testutil.SeedMedia(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed media: %v", err)
	}
	svc := NewService(poolTest)

	// Les users seedés n'ont pas de publication personnelle : le service
	// renvoie un workspace PERSONAL sans identifiant de publication (jamais
	// publisherId = userId). La publication est créée via /v1/me/publication.
	ws, err := svc.GetActive(context.Background(), mfx.ViewerID, "")
	if err != nil {
		t.Fatalf("GetActive: %v", err)
	}
	if ws.Type != "PERSONAL" || ws.PublisherID != "" {
		t.Fatalf("fallback = %+v, attendu PERSONAL sans publication", ws)
	}
	if ws.Slug != "personal" || ws.Name != "Profil Personnel" {
		t.Fatalf("nom/slug fallback = %q/%q", ws.Name, ws.Slug)
	}
}

func TestGetActive_RealPersonalPublisher(t *testing.T) {
	requirePool(t)
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
		`SELECT "publisherId" FROM "User" WHERE id = $1`, pfx.AuthorID,
	).Scan(&wantPub); err != nil {
		t.Fatalf("publication auteur: %v", err)
	}

	ws, err := svc.GetActive(context.Background(), pfx.AuthorID, "")
	if err != nil {
		t.Fatalf("GetActive: %v", err)
	}
	if ws.Type != "PERSONAL" || ws.PublisherID != wantPub {
		t.Fatalf("workspace = %+v, attendu PERSONAL/%s", ws, wantPub)
	}
	if ws.Slug == "" || ws.Name == "" {
		t.Fatalf("nom/slug vides : %+v", ws)
	}
}

// Un invité qui n'a pas encore accepté ne peut pas activer le workspace média :
// Go retombe sur le workspace personnel, jamais sur le média.
func TestGetActive_InvitedMemberFallsBackToPersonal(t *testing.T) {
	requirePool(t)
	if _, err := testutil.SeedMedia(context.Background(), poolTest); err != nil {
		t.Fatalf("seed media: %v", err)
	}
	ctx := context.Background()

	const invitedID = "00000000-0000-0000-0000-000000000024"
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
		 VALUES ($1, 'invited@media.test', 'minvited', 'Invité', 'user', now(), now())`, invitedID); err != nil {
		t.Fatalf("invited user: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "MediaMember" (id, "mediaId", "userId", role, status, "createdAt", "updatedAt")
		 VALUES (gen_random_uuid()::text, 'media_001', $1, 'editor', 'invited', now(), now())`, invitedID); err != nil {
		t.Fatalf("invited membership: %v", err)
	}

	svc := NewService(poolTest)
	ws, err := svc.GetActive(ctx, invitedID, "media_001")
	if err != nil {
		t.Fatalf("GetActive: %v", err)
	}
	if ws.Type != "PERSONAL" {
		t.Fatalf("type = %s, attendu PERSONAL (invitation non acceptée)", ws.Type)
	}
	if ws.MediaID != nil || ws.MediaRole != nil {
		t.Fatalf("workspace invité expose des champs média : %+v", ws)
	}
}

// Un propriétaire actif reçoit les permissions effectives (base du rôle).
func TestGetActive_MediaExposesEffectivePermissions(t *testing.T) {
	requirePool(t)
	mfx, err := testutil.SeedMedia(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed media: %v", err)
	}
	svc := NewService(poolTest)
	ws, err := svc.GetActive(context.Background(), mfx.OwnerID, "media_001")
	if err != nil {
		t.Fatalf("GetActive: %v", err)
	}
	if len(ws.Permissions) == 0 {
		t.Fatal("permissions effectives vides pour un owner")
	}
	found := false
	for _, p := range ws.Permissions {
		if p == "media:manage_members" {
			found = true
		}
	}
	if !found {
		t.Fatalf("media:manage_members absent : %v", ws.Permissions)
	}
}
