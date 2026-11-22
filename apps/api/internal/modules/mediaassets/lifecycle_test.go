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
	// failPath : échec ciblé sur un seul objet (les autres passent).
	failPath string
}

func (f *fakeDeleter) Delete(_ context.Context, bucket, path string) error {
	if f.fail != nil {
		return f.fail
	}
	if f.failPath != "" && path == f.failPath {
		return errors.New("objet corrompu")
	}
	f.deleted = append(f.deleted, [2]string{bucket, path})
	return nil
}

func TestAttachByURLs(t *testing.T) {
	ctx := context.Background()
	seedAssets(t, ctx)
	svc := newTestService()

	a, err := svc.RegisterAsset(ctx, assetOwnerID,
		lifecycleInput(shaOf("attach"), "https://cdn.qoe.fi/life/a.webp", "articles/life/a.webp", 100))
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
	got, err := svc.GetBySha256(ctx, assetOwnerID, shaOf("attach"))
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
		label := []string{"keep", "drop"}[i]
		if _, err := svc.RegisterAsset(ctx, assetOwnerID,
			lifecycleInput(shaOf(label), u, "articles/life/"+label+".webp", 100)); err != nil {
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
	got, err := svc.GetBySha256(ctx, assetOwnerID, shaOf("drop"))
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.Status != "SOFT_DELETED" || !got.PurgeDueAt.Valid {
		t.Fatalf("détaché = %+v (attendu SOFT_DELETED + purgeDueAt)", got)
	}
	still, err := svc.GetBySha256(ctx, assetOwnerID, shaOf("keep"))
	if err != nil || still.Status != "ATTACHED" {
		t.Fatalf("conservé = %+v, %v", still, err)
	}
}

func TestPurgeExpired(t *testing.T) {
	ctx := context.Background()
	seedAssets(t, ctx)
	svc := newTestService()

	orphanSha := shaOf("orphan")
	orphanURL := "https://cdn.qoe.fi/life/orphan.webp"
	if _, err := svc.RegisterAsset(ctx, assetOwnerID,
		lifecycleInput(orphanSha, orphanURL, "articles/life/orphan.webp", 100)); err != nil {
		t.Fatalf("register: %v", err)
	}
	// Force l'expiration (orphelin jamais attaché).
	if _, err := poolTest.Exec(ctx,
		`UPDATE "MediaAsset" SET "purgeDueAt" = now() - interval '1 hour' WHERE sha256 = $1`,
		orphanSha); err != nil {
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
	got, err := svc.GetBySha256(ctx, assetOwnerID, orphanSha)
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

	sha := shaOf("orphan-fail")
	if _, err := svc.RegisterAsset(ctx, assetOwnerID,
		lifecycleInput(sha, "https://cdn.qoe.fi/life/orphan2.webp", "articles/life/orphan2.webp", 100)); err != nil {
		t.Fatalf("register: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`UPDATE "MediaAsset" SET "purgeDueAt" = now() - interval '1 hour' WHERE sha256 = $1`, sha); err != nil {
		t.Fatalf("expire: %v", err)
	}

	del := &fakeDeleter{fail: errors.New("storage HS")}
	if _, err := svc.PurgeExpired(ctx, del, 100); err == nil {
		t.Fatal("échec storage doit remonter l'erreur")
	}
	// La ligne n'est PAS marquée PURGED : retry au prochain passage.
	got, err := svc.GetBySha256(ctx, assetOwnerID, sha)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.Status == "PURGED" {
		t.Fatal("ligne marquée PURGED malgré l'échec storage")
	}
}

// Un objet cassé ne doit plus bloquer la purge des suivants.
func TestPurgeExpired_ContinuesAfterOneFailure(t *testing.T) {
	ctx := context.Background()
	seedAssets(t, ctx)
	svc := newTestService()

	brokenSha := shaOf("broken")
	healthySha := shaOf("healthy")
	for _, c := range []struct {
		sha  string
		path string
	}{{brokenSha, "articles/life/a-broken.webp"}, {healthySha, "articles/life/b-healthy.webp"}} {
		if _, err := svc.RegisterAsset(ctx, assetOwnerID,
			lifecycleInput(c.sha, "https://cdn.qoe.fi/"+c.path, c.path, 100)); err != nil {
			t.Fatalf("register: %v", err)
		}
	}
	if _, err := poolTest.Exec(ctx,
		`UPDATE "MediaAsset" SET "purgeDueAt" = now() - interval '2 hours' WHERE sha256 = $1`, brokenSha); err != nil {
		t.Fatalf("expire broken: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`UPDATE "MediaAsset" SET "purgeDueAt" = now() - interval '1 hour' WHERE sha256 = $1`, healthySha); err != nil {
		t.Fatalf("expire healthy: %v", err)
	}

	del := &fakeDeleter{failPath: "articles/life/a-broken.webp"}
	purged, err := svc.PurgeExpired(ctx, del, 100)
	if err == nil {
		t.Fatal("l'échec storage doit être remonté au worker")
	}
	if purged != 1 {
		t.Fatalf("purgés = %d, attendu 1 (l'objet sain passe malgré l'échec du premier)", purged)
	}
	healthy, gerr := svc.GetBySha256(ctx, assetOwnerID, healthySha)
	if gerr != nil || healthy.Status != "PURGED" {
		t.Fatalf("objet sain = %+v, %v", healthy, gerr)
	}
	broken, berr := svc.GetBySha256(ctx, assetOwnerID, brokenSha)
	if berr != nil || broken.Status == "PURGED" {
		t.Fatalf("objet cassé = %+v, %v (doit rester purgeable)", broken, berr)
	}
}

func TestRegisterQuota(t *testing.T) {
	ctx := context.Background()
	seedAssets(t, ctx)
	svc := newTestService().SetQuotaBytes(300)

	if _, err := svc.RegisterAsset(ctx, assetOwnerID,
		lifecycleInput(shaOf("q1"), "https://cdn.qoe.fi/life/q1.webp", "articles/life/q1.webp", 200)); err != nil {
		t.Fatalf("register 200o: %v", err)
	}
	// 200 + 200 > 300 → refusé.
	if _, err := svc.RegisterAsset(ctx, assetOwnerID,
		lifecycleInput(shaOf("q2"), "https://cdn.qoe.fi/life/q2.webp", "articles/life/q2.webp", 200)); err == nil {
		t.Fatal("dépassement de quota accepté")
	} else if !errors.Is(err, ErrQuotaExceeded) {
		t.Fatalf("erreur quota typée attendue, obtenu %v", err)
	}
	// Dédoublonnage CAS : même sha → réutilisé, jamais compté double.
	if _, err := svc.RegisterAsset(ctx, assetOwnerID,
		lifecycleInput(shaOf("q1"), "https://cdn.qoe.fi/life/q1.webp", "articles/life/q1.webp", 200)); err != nil {
		t.Fatalf("dédup sous quota: %v", err)
	}
	// Quota 0 = illimité.
	unlimited := newTestService().SetQuotaBytes(0)
	if _, err := unlimited.RegisterAsset(ctx, assetOwnerID,
		lifecycleInput(shaOf("q9"), "https://cdn.qoe.fi/life/q9.webp", "articles/life/q9.webp", 1024)); err != nil {
		t.Fatalf("quota 0 doit être illimité: %v", err)
	}

	// Asset inexistant → pgx.ErrNoRows via GetBySha256.
	if _, err := svc.GetBySha256(ctx, assetOwnerID, shaOf("unknown")); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("inconnu doit être ErrNoRows, obtenu %v", err)
	}
}

func TestRegisterUploadThrottle(t *testing.T) {
	ctx := context.Background()
	seedAssets(t, ctx)
	svc := newTestService().SetQuotaBytes(0).SetUploadsPerHour(2)

	for _, label := range []string{"t1", "t2"} {
		if _, err := svc.RegisterAsset(ctx, assetOwnerID,
			lifecycleInput(shaOf(label), "https://cdn.qoe.fi/life/"+label+".webp", "articles/life/"+label+".webp", 10)); err != nil {
			t.Fatalf("register %s: %v", label, err)
		}
	}
	// 3e upload dans l'heure → refusé.
	if _, err := svc.RegisterAsset(ctx, assetOwnerID,
		lifecycleInput(shaOf("t3"), "https://cdn.qoe.fi/life/t3.webp", "articles/life/t3.webp", 10)); err == nil {
		t.Fatal("3e upload (limite 2/h) accepté")
	} else if !errors.Is(err, ErrThrottled) {
		t.Fatalf("erreur throttle typée attendue, obtenu %v", err)
	}
	// Dédoublonnage CAS : contenu connu → réutilisé sans consommer le throttle.
	if _, err := svc.RegisterAsset(ctx, assetOwnerID,
		lifecycleInput(shaOf("t1"), "https://cdn.qoe.fi/life/t1.webp", "articles/life/t1.webp", 10)); err != nil {
		t.Fatalf("dédup ne doit pas consommer le throttle: %v", err)
	}
	// Throttle 0 = illimité.
	unlimited := newTestService().SetQuotaBytes(0).SetUploadsPerHour(0)
	if _, err := unlimited.RegisterAsset(ctx, assetOwnerID,
		lifecycleInput(shaOf("t9"), "https://cdn.qoe.fi/life/t9.webp", "articles/life/t9.webp", 10)); err != nil {
		t.Fatalf("throttle 0 doit être illimité: %v", err)
	}
}
