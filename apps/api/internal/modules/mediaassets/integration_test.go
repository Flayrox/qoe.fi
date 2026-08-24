package mediaassets

// Tests d'intégration du module MediaAsset (registre CAS) — migration de
// packages/db/src/repositories/media.ts → registerMediaAsset vers Go.

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

const assetOwnerID = "00000000-0000-0000-0000-0000000000c1"

func seedAssets(t *testing.T, ctx context.Context) {
	t.Helper()
	if _, err := poolTest.Exec(ctx, `TRUNCATE TABLE "MediaAsset" CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
		 VALUES ($1, 'owner-assets@test.dev', 'ownerassets', 'Owner', 'creator', now(), now())`,
		assetOwnerID); err != nil {
		t.Fatalf("user: %v", err)
	}
}

func newTestService() *Service {
	return NewService(poolTest)
}

func baseInput() RegisterInput {
	w, h := int32(800), int32(600)
	return RegisterInput{
		Sha256:      "abc123def456",
		Url:         "https://cdn.qoe.fi/articles/abc123.webp",
		StoragePath: "articles/abc123.webp",
		MimeType:    "image/webp",
		Width:       &w,
		Height:      &h,
		SizeBytes:   2048,
		TargetType:  "ARTICLE_BODY",
	}
}

func TestRegisterAsset(t *testing.T) {
	ctx := context.Background()
	seedAssets(t, ctx)
	svc := newTestService()

	// Création DRAFT_ORPHAN avec TTL 3 jours.
	asset, err := svc.RegisterAsset(ctx, assetOwnerID, baseInput())
	if err != nil {
		t.Fatalf("RegisterAsset: %v", err)
	}
	if asset.Status != "DRAFT_ORPHAN" || asset.OwnerId != assetOwnerID {
		t.Fatalf("asset = %+v", asset)
	}
	if !asset.PurgeDueAt.Valid {
		t.Fatalf("purgeDueAt manquant (TTL 3j requis)")
	}

	// Dédoublonnage CAS : même sha256 → même id, pas de doublon.
	again, err := svc.RegisterAsset(ctx, assetOwnerID, baseInput())
	if err != nil {
		t.Fatalf("RegisterAsset (dédup): %v", err)
	}
	if again.ID != asset.ID {
		t.Fatalf("dédup: id %s != %s", again.ID, asset.ID)
	}

	// Réactivation d'un asset purgé (nouvelle fenêtre de purge).
	if _, err := poolTest.Exec(ctx,
		`UPDATE "MediaAsset" SET status = 'PURGED', "purgeDueAt" = NULL WHERE id = $1`, asset.ID); err != nil {
		t.Fatalf("purge: %v", err)
	}
	reactivated, err := svc.RegisterAsset(ctx, assetOwnerID, baseInput())
	if err != nil {
		t.Fatalf("RegisterAsset (réactivation): %v", err)
	}
	if reactivated.ID != asset.ID || reactivated.Status != "DRAFT_ORPHAN" {
		t.Fatalf("réactivation = %+v", reactivated)
	}
	if !reactivated.PurgeDueAt.Valid {
		t.Fatalf("réactivation sans purgeDueAt")
	}

	// Validation : targetType invalide refusé.
	bad := baseInput()
	bad.TargetType = "MALICIOUS"
	if _, err := svc.RegisterAsset(ctx, assetOwnerID, bad); err == nil {
		t.Fatalf("targetType invalide accepté")
	}
	// Champs requis.
	empty := baseInput()
	empty.Sha256 = ""
	if _, err := svc.RegisterAsset(ctx, assetOwnerID, empty); err == nil {
		t.Fatalf("sha256 vide accepté")
	}
}
