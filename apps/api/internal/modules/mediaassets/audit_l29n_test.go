package mediaassets

// Tests du lot d'audit L29n : chaque cas reproduit un défaut constaté sur le
// code d'avant correction (worktree à HEAD) et doit y échouer.
//
// Ils n'utilisent que des signatures présentes à HEAD (RegisterAsset,
// ListByOwner, PurgeExpired, handler) et des URLs relatives : la politique
// média par défaut (fail-closed, aucune origine) les accepte, sans devoir
// configurer le service — le test d'origine étrangère en profite.

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/middleware"
)

func auditL29NSHA(label string) string {
	sum := sha256.Sum256([]byte("audit-l29n/" + label))
	return hex.EncodeToString(sum[:])
}

func auditL29NReset(t *testing.T, ctx context.Context) {
	t.Helper()
	requirePool(t)
	if _, err := poolTest.Exec(ctx, `TRUNCATE TABLE "MediaAsset" CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
}

func auditL29NInput(label, path string) RegisterInput {
	return RegisterInput{
		Sha256:      auditL29NSHA(label),
		Url:         "/storage/" + path,
		StoragePath: "articles/" + path,
		MimeType:    "image/webp",
		SizeBytes:   1024,
		TargetType:  "ARTICLE_BODY",
	}
}

// F609 : le dédoublonnage CAS ignorait le propriétaire — l'asset d'un autre
// compte (id, URL, statut, chemin storage) était rendu tel quel.
func TestAuditL29N_DedupeIsPerOwner(t *testing.T) {
	ctx := context.Background()
	auditL29NReset(t, ctx)
	svc := NewService(poolTest)

	first, err := svc.RegisterAsset(ctx, "owner-a", auditL29NInput("shared", "shared.webp"))
	if err != nil {
		t.Fatalf("register A: %v", err)
	}
	second, err := svc.RegisterAsset(ctx, "owner-b", auditL29NInput("shared", "shared.webp"))
	if err != nil {
		t.Fatalf("register B: %v", err)
	}
	if second.OwnerId != "owner-b" {
		t.Fatalf("asset rendu à B appartient à %q (id %s)", second.OwnerId, second.ID)
	}
	if second.ID == first.ID {
		t.Fatalf("B reçoit la ligne de A (%s)", first.ID)
	}

	// La bibliothèque de B ne montre que son asset, pas celui de A.
	items, err := svc.ListByOwner(ctx, "owner-b", ListOptions{})
	if err != nil {
		t.Fatalf("list B: %v", err)
	}
	if len(items) != 1 || items[0].ID != second.ID {
		t.Fatalf("bibliothèque de B = %+v", items)
	}
}

// F610 : chemin de stockage arbitraire accepté (traversée de bucket/chemin
// pilotée ensuite par le worker de purge).
func TestAuditL29N_RejectsPathTraversal(t *testing.T) {
	ctx := context.Background()
	auditL29NReset(t, ctx)
	svc := NewService(poolTest)

	in := auditL29NInput("traversal", "x.webp")
	in.StoragePath = "../../another-bucket/secret.webp"
	if _, err := svc.RegisterAsset(ctx, "owner-a", in); err == nil {
		t.Fatal("storagePath '../../another-bucket/secret.webp' accepté")
	}
}

// F611 : MIME actif (SVG) enregistrable — un SVG servi inline exécute du script.
func TestAuditL29N_RejectsActiveMime(t *testing.T) {
	ctx := context.Background()
	auditL29NReset(t, ctx)
	svc := NewService(poolTest)

	in := auditL29NInput("svg", "x.svg")
	in.MimeType = "image/svg+xml"
	if _, err := svc.RegisterAsset(ctx, "owner-a", in); err == nil {
		t.Fatal("mimeType image/svg+xml accepté")
	}
	in.MimeType = "text/html"
	if _, err := svc.RegisterAsset(ctx, "owner-a", in); err == nil {
		t.Fatal("mimeType text/html accepté")
	}
}

// F612 : URL d'un hôte étranger enregistrable sans passer par la
// plateforme (image non modérée / pixel de pistage).
func TestAuditL29N_RejectsForeignURL(t *testing.T) {
	ctx := context.Background()
	auditL29NReset(t, ctx)
	svc := NewService(poolTest)

	in := auditL29NInput("foreign", "y.webp")
	in.Url = "https://evil.example/y.webp"
	if _, err := svc.RegisterAsset(ctx, "owner-a", in); err == nil {
		t.Fatal("URL d'un hôte non autorisé acceptée")
	}
	in.Url = "javascript:alert(1)"
	if _, err := svc.RegisterAsset(ctx, "owner-a", in); err == nil {
		t.Fatal("URL javascript: acceptée")
	}
}

// F613 : taille négative/nulle (contournement du quota) et bucket imposé par
// le client (suppression d'objets d'un autre bucket par le worker).
func TestAuditL29N_RejectsNegativeSizeAndForeignBucket(t *testing.T) {
	ctx := context.Background()
	auditL29NReset(t, ctx)
	svc := NewService(poolTest).SetQuotaBytes(1000)

	neg := auditL29NInput("neg", "neg.webp")
	neg.SizeBytes = -5000
	if _, err := svc.RegisterAsset(ctx, "owner-a", neg); err == nil {
		t.Fatal("sizeBytes négatif accepté (contourne le quota)")
	}

	foreign := auditL29NInput("bucket", "bucket.webp")
	foreign.Bucket = "victim-bucket"
	if _, err := svc.RegisterAsset(ctx, "owner-a", foreign); err == nil {
		t.Fatal("bucket client-imposé accepté")
	}
}

// F614 : recherche ILIKE non échappée — « % » ramenait toute la bibliothèque.
func TestAuditL29N_LibrarySearchIsLiteral(t *testing.T) {
	ctx := context.Background()
	auditL29NReset(t, ctx)
	svc := NewService(poolTest)

	for _, label := range []string{"one", "two"} {
		if _, err := svc.RegisterAsset(ctx, "owner-a",
			auditL29NInput(label, label+".webp")); err != nil {
			t.Fatalf("register %s: %v", label, err)
		}
	}
	items, err := svc.ListByOwner(ctx, "owner-a", ListOptions{Query: "%"})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(items) != 0 {
		t.Fatalf("q=%% ramène %d assets (recherche littérale attendue)", len(items))
	}
}

// F615 : troncature du filtre `q` par octets → UTF-8 invalide refusé par
// Postgres sur une recherche accentuée un peu longue.
func TestAuditL29N_LibrarySearchUTF8Safe(t *testing.T) {
	ctx := context.Background()
	auditL29NReset(t, ctx)
	svc := NewService(poolTest)

	if _, err := svc.RegisterAsset(ctx, "owner-a", auditL29NInput("utf8", "utf8.webp")); err != nil {
		t.Fatalf("register: %v", err)
	}
	// 40 « € » = 120 octets : une coupe à 100 octets tombe au milieu d'une rune.
	query := strings.Repeat("€", 40)
	if _, err := svc.ListByOwner(ctx, "owner-a", ListOptions{Query: query}); err != nil {
		t.Fatalf("recherche accentuée: %v", err)
	}
}

// F616 : purge sans deleter marquait PURGED en laissant l'objet dans le bucket
// (fuite de stockage silencieuse) ; chemin/bucket hérité invalide pilotait une
// suppression arbitraire.
func TestAuditL29N_PurgeRequiresDeleterAndSafePath(t *testing.T) {
	ctx := context.Background()
	auditL29NReset(t, ctx)
	svc := NewService(poolTest)

	in := auditL29NInput("purge-nil", "nil.webp")
	asset, err := svc.RegisterAsset(ctx, "owner-a", in)
	if err != nil {
		t.Fatalf("register: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`UPDATE "MediaAsset" SET "purgeDueAt" = now() - interval '1 hour' WHERE id = $1`, asset.ID); err != nil {
		t.Fatalf("expire: %v", err)
	}
	if _, err := svc.PurgeExpired(ctx, nil, 10); err == nil {
		t.Fatal("PurgeExpired sans deleter doit échouer")
	}
	var status string
	if err := poolTest.QueryRow(ctx,
		`SELECT status::text FROM "MediaAsset" WHERE id = $1`, asset.ID).Scan(&status); err != nil {
		t.Fatalf("statut: %v", err)
	}
	if status != "DRAFT_ORPHAN" {
		t.Fatalf("statut = %s sans suppression storage (attendu DRAFT_ORPHAN)", status)
	}

	// Ligne héritée au chemin dangereux : jamais de Delete sur ce chemin.
	if _, err := poolTest.Exec(ctx,
		`UPDATE "MediaAsset" SET "storagePath" = '../../escape.webp' WHERE id = $1`, asset.ID); err != nil {
		t.Fatalf("corrupt path: %v", err)
	}
	del := &fakeDeleter{}
	if _, err := svc.PurgeExpired(ctx, del, 10); err == nil {
		t.Fatal("chemin de stockage invalide doit être refusé (et signalé)")
	}
	if len(del.deleted) != 0 {
		t.Fatalf("deleter appelé sur un chemin invalide: %v", del.deleted)
	}
}

// F617 : le dédoublonnage CAS partage un objet storage entre plusieurs lignes ;
// purger la ligne d'un propriétaire supprimait l'objet encore utilisé par un
// autre (asset cassé silencieusement).
func TestAuditL29N_PurgeKeepsSharedObject(t *testing.T) {
	ctx := context.Background()
	auditL29NReset(t, ctx)
	svc := NewService(poolTest)

	a, err := svc.RegisterAsset(ctx, "owner-a", auditL29NInput("shared-object", "shared.webp"))
	if err != nil {
		t.Fatalf("register A: %v", err)
	}
	b, err := svc.RegisterAsset(ctx, "owner-b", auditL29NInput("shared-object", "shared.webp"))
	if err != nil {
		t.Fatalf("register B: %v", err)
	}
	if a.ID == b.ID {
		t.Fatalf("une seule ligne pour deux propriétaires (%s)", a.ID)
	}
	if _, err := poolTest.Exec(ctx,
		`UPDATE "MediaAsset" SET "purgeDueAt" = now() - interval '1 hour' WHERE id = $1`, a.ID); err != nil {
		t.Fatalf("expire A: %v", err)
	}

	del := &fakeDeleter{}
	if _, err := svc.PurgeExpired(ctx, del, 10); err != nil {
		t.Fatalf("purge: %v", err)
	}
	if len(del.deleted) != 0 {
		t.Fatalf("objet partagé supprimé du storage: %v", del.deleted)
	}
	var ownerBStatus string
	if err := poolTest.QueryRow(ctx,
		`SELECT status::text FROM "MediaAsset" WHERE id = $1`, b.ID).Scan(&ownerBStatus); err != nil {
		t.Fatalf("statut B: %v", err)
	}
	if ownerBStatus != "DRAFT_ORPHAN" {
		t.Fatalf("asset de B = %s (objet supprimé derrière lui)", ownerBStatus)
	}
}

// F618 : panne base rendue en 400 avec le message interne (« closed pool »).
func TestAuditL29N_HandlerInternalErrorIs500(t *testing.T) {
	pool, err := pgxpool.New(context.Background(), "postgres://127.0.0.1:1/none?sslmode=disable")
	if err != nil {
		t.Fatalf("pool: %v", err)
	}
	pool.Close()

	h := NewHandler(NewService(pool))
	r := chi.NewRouter()
	h.Register(r)
	req := httptest.NewRequest(http.MethodGet, "/v1/media-assets", nil)
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, "owner-a"))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("panne base = %d (%s), attendu 500", w.Code, w.Body.String())
	}
}
