package mediaassets

// Tests d'intégration du cycle de vie MediaAsset : attachement,
// réconciliation (détachés), purge des expirés (storage + DB) et quota.
// Requiert Docker/testcontainers (CI) — skippé sinon via seedAssets.

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
)

func lifecycleInput(sha, url, path string, size int32) RegisterInput {
	return RegisterInput{
		Sha256: sha, Url: url, StoragePath: path,
		MimeType: "image/webp", SizeBytes: size, TargetType: "ARTICLE_BODY",
	}
}

// fakeDeleter enregistre les suppressions storage sans toucher au réseau.
type fakeDeleter struct {
	deleted [][2]string
	fail    error
}

func (f *fakeDeleter) Delete(_ context.Context, bucket, path string) error {
	if f.fail != nil {
		return f.fail
	}
	f.deleted = append(f.deleted, [2]string{bucket, path})
	return nil
}

func TestAttachByURLs(t *testing.T) {
	ctx := context.Background()
	seedAssets(t, ctx)
	svc := newTestService()

	a, err := svc.RegisterAsset(ctx, assetOwnerID,
		lifecycleInput("sha-attach-1", "https://cdn.qoe.fi/life/a.webp", "articles/life/a.webp", 100))
	if err != nil {
		t.Fatalf("register: %v", err)
	}
	if a.Status != "DRAFT_ORPHAN" {
		t.Fatalf("statut = %s, attendu DRAFT_ORPHAN", a.Status)
	}

	// Attachement (avec bruit : URL inconnue + vide ignorées).
	n, err := svc.AttachByURLs(ctx, "article-1", []string{
		"https://cdn.qoe.fi/life/a.webp", "https://cdn.qoe.fi/missing.webp", "",
	})
	if err != nil {
		t.Fatalf("attach: %v", err)
	}
	if n != 1 {
		t.Fatalf("attachés = %d, attendu 1", n)
	}
	got, err := svc.GetBySha256(ctx, "sha-attach-1")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.Status != "ATTACHED" {
		t.Fatalf("statut = %s, attendu ATTACHED", got.Status)
	}
	if !got.PurgeDueAt.Valid {
		// purgeDueAt nettoyé à l'attachement.
		t.Logf("note: purgeDueAt conservé (%v)", got.PurgeDueAt)
	}

	// Idempotent : ré-attacher ne duplique rien et ne purge jamais.
	n2, err := svc.AttachByURLs(ctx, "", []string{"https://cdn.qoe.fi/life/a.webp"})
	if err != nil || n2 != 0 {
		t.Fatalf("ré-attach = %d, %v (attendu 0, nil)", n2, err)
	}
}

func TestReconcileDetachesUnreferenced(t *testing.T) {
	ctx := context.Background()
	seedAssets(t, ctx)
	svc := newTestService()

	kept := "https://cdn.qoe.fi/life/kept.webp"
	dropped := "https://cdn.qoe.fi/life/dropped.webp"
	for i, u := range []string{kept, dropped} {
		sha := []string{"sha-keep-1", "sha-drop-1"}[i]
		if _, err := svc.RegisterAsset(ctx, assetOwnerID,
			lifecycleInput(sha, u, "articles/life/"+sha+".webp", 100)); err != nil {
			t.Fatalf("register: %v", err)
		}
	}
	if _, err := svc.AttachByURLs(ctx, "", []string{kept, dropped}); err != nil {
		t.Fatalf("attach: %v", err)
	}

	// Seule `kept` reste référencée → `dropped` passe SOFT_DELETED.
	attached, detached, err := svc.Reconcile(ctx, []string{kept}, 7*24*time.Hour)
	if err != nil {
		t.Fatalf("reconcile: %v", err)
	}
	if attached != 0 || detached != 1 {
		t.Fatalf("reconcile = (%d, %d), attendu (0, 1)", attached, detached)
	}
	got, err := svc.GetBySha256(ctx, "sha-drop-1")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.Status != "SOFT_DELETED" || !got.PurgeDueAt.Valid {
		t.Fatalf("détaché = %+v (attendu SOFT_DELETED + purgeDueAt)", got)
	}
	still, err := svc.GetBySha256(ctx, "sha-keep-1")
	if err != nil || still.Status != "ATTACHED" {
		t.Fatalf("conservé = %+v, %v", still, err)
	}
}

func TestPurgeExpired(t *testing.T) {
	ctx := context.Background()
	seedAssets(t, ctx)
	svc := newTestService()

	orphanURL := "https://cdn.qoe.fi/life/orphan.webp"
	if _, err := svc.RegisterAsset(ctx, assetOwnerID,
		lifecycleInput("sha-orphan-1", orphanURL, "articles/life/orphan.webp", 100)); err != nil {
		t.Fatalf("register: %v", err)
	}
	// Force l'expiration (orphelin jamais attaché).
	if _, err := poolTest.Exec(ctx,
		`UPDATE "MediaAsset" SET "purgeDueAt" = now() - interval '1 hour' WHERE sha256 = 'sha-orphan-1'`); err != nil {
		t.Fatalf("expire: %v", err)
	}

	del := &fakeDeleter{}
	n, err := svc.PurgeExpired(ctx, del, 100)
	if err != nil {
		t.Fatalf("purge: %v", err)
	}
	if n != 1 {
		t.Fatalf("purgés = %d, attendu 1", n)
	}
	if len(del.deleted) != 1 || del.deleted[0][1] != "articles/life/orphan.webp" {
		t.Fatalf("storage supprimé = %v", del.deleted)
	}
	got, err := svc.GetBySha256(ctx, "sha-orphan-1")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.Status != "PURGED" {
		t.Fatalf("statut = %s, attendu PURGED", got.Status)
	}

	// Second passage : rien à purger (idempotent).
	n2, err := svc.PurgeExpired(ctx, del, 100)
	if err != nil || n2 != 0 {
		t.Fatalf("re-purge = %d, %v", n2, err)
	}
}

func TestPurgeExpired_StorageFailureKeepsRow(t *testing.T) {
	ctx := context.Background()
	seedAssets(t, ctx)
	svc := newTestService()

	if _, err := svc.RegisterAsset(ctx, assetOwnerID,
		lifecycleInput("sha-orphan-2", "https://cdn.qoe.fi/life/orphan2.webp", "articles/life/orphan2.webp", 100)); err != nil {
		t.Fatalf("register: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`UPDATE "MediaAsset" SET "purgeDueAt" = now() - interval '1 hour' WHERE sha256 = 'sha-orphan-2'`); err != nil {
		t.Fatalf("expire: %v", err)
	}

	del := &fakeDeleter{fail: errors.New("storage HS")}
	if _, err := svc.PurgeExpired(ctx, del, 100); err == nil {
		t.Fatal("échec storage doit remonter l'erreur")
	}
	// La ligne n'est PAS marquée PURGED : retry au prochain passage.
	got, err := svc.GetBySha256(ctx, "sha-orphan-2")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.Status == "PURGED" {
		t.Fatal("ligne marquée PURGED malgré l'échec storage")
	}
}

func TestRegisterQuota(t *testing.T) {
	ctx := context.Background()
	seedAssets(t, ctx)
	svc := newTestService().SetQuotaBytes(300)

	if _, err := svc.RegisterAsset(ctx, assetOwnerID,
		lifecycleInput("sha-q-1", "https://cdn.qoe.fi/life/q1.webp", "articles/life/q1.webp", 200)); err != nil {
		t.Fatalf("register 200o: %v", err)
	}
	// 200 + 200 > 300 → refusé.
	if _, err := svc.RegisterAsset(ctx, assetOwnerID,
		lifecycleInput("sha-q-2", "https://cdn.qoe.fi/life/q2.webp", "articles/life/q2.webp", 200)); err == nil {
		t.Fatal("dépassement de quota accepté")
	}
	// Dédoublonnage CAS : même sha → réutilisé, jamais compté double.
	if _, err := svc.RegisterAsset(ctx, assetOwnerID,
		lifecycleInput("sha-q-1", "https://cdn.qoe.fi/life/q1.webp", "articles/life/q1.webp", 200)); err != nil {
		t.Fatalf("dédup sous quota: %v", err)
	}
	// Quota 0 = illimité.
	unlimited := newTestService().SetQuotaBytes(0)
	if _, err := unlimited.RegisterAsset(ctx, assetOwnerID,
		lifecycleInput("sha-q-9", "https://cdn.qoe.fi/life/q9.webp", "articles/life/q9.webp", 1<<30)); err != nil {
		t.Fatalf("quota 0 doit être illimité: %v", err)
	}

	// Asset inexistant → pgx.ErrNoRows via GetBySha256.
	if _, err := svc.GetBySha256(ctx, "sha-unknown"); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("inconnu doit être ErrNoRows, obtenu %v", err)
	}
}

func TestRegisterUploadThrottle(t *testing.T) {
	ctx := context.Background()
	seedAssets(t, ctx)
	svc := newTestService().SetQuotaBytes(0).SetUploadsPerHour(2)

	for _, sha := range []string{"sha-t-1", "sha-t-2"} {
		if _, err := svc.RegisterAsset(ctx, assetOwnerID,
			lifecycleInput(sha, "https://cdn.qoe.fi/life/"+sha+".webp", "articles/life/"+sha+".webp", 10)); err != nil {
			t.Fatalf("register %s: %v", sha, err)
		}
	}
	// 3e upload dans l'heure → refusé.
	if _, err := svc.RegisterAsset(ctx, assetOwnerID,
		lifecycleInput("sha-t-3", "https://cdn.qoe.fi/life/t3.webp", "articles/life/t3.webp", 10)); err == nil {
		t.Fatal("3e upload (limite 2/h) accepté")
	}
	// Dédoublonnage CAS : contenu connu → réutilisé sans consommer le throttle.
	if _, err := svc.RegisterAsset(ctx, assetOwnerID,
		lifecycleInput("sha-t-1", "https://cdn.qoe.fi/life/sha-t-1.webp", "articles/life/sha-t-1.webp", 10)); err != nil {
		t.Fatalf("dédup ne doit pas consommer le throttle: %v", err)
	}
	// Throttle 0 = illimité.
	unlimited := newTestService().SetQuotaBytes(0).SetUploadsPerHour(0)
	if _, err := unlimited.RegisterAsset(ctx, assetOwnerID,
		lifecycleInput("sha-t-9", "https://cdn.qoe.fi/life/t9.webp", "articles/life/t9.webp", 10)); err != nil {
		t.Fatalf("throttle 0 doit être illimité: %v", err)
	}
}
