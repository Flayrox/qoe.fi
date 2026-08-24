package main

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/qoefi/api/internal/testutil"
)

// =====================================================================
// 🛡️ P3 — Campagne de sécurité au niveau du routeur de production :
//     isolation tenant, RBAC, validation des uploads (MediaAsset) et
//     signatures/injection webhook. Base de test isolée, base dev intacte.
// =====================================================================

// ─── Uploads MediaAsset : validation des entrées ────────────────────────────

func TestP3MediaAssetUploadValidation(t *testing.T) {
	ctx := context.Background()
	seedSecurityUsers(t, ctx)
	r := testRouter(t)
	ownerToken := routerJWT(securityOwnerID)

	// targetType hors allowlist → 400.
	w, _ := doReq(t, r, http.MethodPost, "/v1/media-assets", ownerToken, map[string]any{
		"sha256":      "sec-bad-target",
		"url":         "https://cdn.qoe.fi/x.webp",
		"storagePath": "sec/x.webp",
		"targetType":  "EXECUTABLE",
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("targetType invalide = %d, body=%s; attendu 400", w.Code, w.Body.String())
	}

	// sha256 manquant → 400.
	w, _ = doReq(t, r, http.MethodPost, "/v1/media-assets", ownerToken, map[string]any{
		"url":         "https://cdn.qoe.fi/y.webp",
		"storagePath": "sec/y.webp",
		"targetType":  "ARTICLE_BODY",
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("sha256 manquant = %d, body=%s; attendu 400", w.Code, w.Body.String())
	}

	// storagePath manquant → 400.
	w, _ = doReq(t, r, http.MethodPost, "/v1/media-assets", ownerToken, map[string]any{
		"sha256":     "sec-no-path",
		"url":        "https://cdn.qoe.fi/z.webp",
		"targetType": "ARTICLE_BODY",
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("storagePath manquant = %d, body=%s; attendu 400", w.Code, w.Body.String())
	}

	// JSON invalide → 400 (pas de 500).
	w, body := doContractReq(t, r, http.MethodPost, "/v1/media-assets", ownerToken, rawJSONBody("{bad"))
	if w.Code != http.StatusBadRequest {
		t.Fatalf("JSON invalide = %d, body=%s; attendu 400", w.Code, w.Body.String())
	}
	assertJSONError(t, w, body)
}

func TestP3MediaAssetDedupeKeepsOriginalOwner(t *testing.T) {
	ctx := context.Background()
	seedSecurityUsers(t, ctx)
	r := testRouter(t)
	ownerToken := routerJWT(securityOwnerID)
	attackerToken := routerJWT(securityReaderID)

	assetBody := map[string]any{
		"sha256":      "sec-dedupe-sha",
		"url":         "https://cdn.qoe.fi/dedupe.webp",
		"storagePath": "sec/dedupe.webp",
		"mimeType":    "image/webp",
		"sizeBytes":   2048,
		"targetType":  "ARTICLE_BODY",
	}

	w, body := doReq(t, r, http.MethodPost, "/v1/media-assets", ownerToken, assetBody)
	if w.Code != http.StatusCreated {
		t.Fatalf("register owner = %d, body=%s", w.Code, w.Body.String())
	}
	assetID, _ := body["id"].(string)
	if assetID == "" {
		t.Fatalf("asset sans id: %s", w.Body.String())
	}

	// Un autre utilisateur réenregistre le même sha256 → même asset, et le
	// propriétaire d'origine doit être conservé (pas de prise de contrôle).
	w, body = doReq(t, r, http.MethodPost, "/v1/media-assets", attackerToken, assetBody)
	if w.Code != http.StatusCreated || body["id"] != assetID {
		t.Fatalf("dedupe = %d, body=%s; attendu 201 même id %s", w.Code, w.Body.String(), assetID)
	}

	var owner string
	if err := poolTest.QueryRow(ctx,
		`SELECT "ownerId" FROM "MediaAsset" WHERE id = $1`, assetID).Scan(&owner); err != nil {
		t.Fatalf("owner: %v", err)
	}
	if owner != securityOwnerID {
		t.Fatalf("owner après dedupe = %s, attendu %s (conservation du propriétaire)", owner, securityOwnerID)
	}
}

// ─── Isolation tenant ────────────────────────────────────────────────────────

func TestP3TenantIsolation_ArticleNotLeakedAcrossPublications(t *testing.T) {
	ctx := context.Background()
	fx, err := testutil.SeedArticles(ctx, poolTest)
	if err != nil {
		t.Fatalf("seed articles: %v", err)
	}
	// Une seconde publication sans lien avec la première.
	otherPubID := "pub_sec_other"
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, "createdAt", "updatedAt")
		 VALUES ($1, 'PERSONAL', 'Autre', 'autre-sec', now(), now())`, otherPubID); err != nil {
		t.Fatalf("other publication: %v", err)
	}
	r := testRouter(t)

	// L'article existe (slug recette-pates) mais demandé sous la publication B :
	// le tenant B ne doit PAS voir le contenu du tenant A.
	w, _ := doReq(t, r, http.MethodGet, "/v1/articles/recette-pates?publicationId="+otherPubID, "", nil)
	if w.Code != http.StatusNotFound {
		t.Fatalf("article tenant A via tenant B = %d, body=%s; attendu 404", w.Code, w.Body.String())
	}

	// La liste créateur de B ne doit pas contenir l'article de A.
	bOwner := "00000000-0000-0000-0000-0000000000f1"
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "publicationId", "createdAt", "updatedAt")
		 VALUES ($1, 'owner-b-sec@test.dev', 'ownerbsec', 'Owner B', 'creator', $2, now(), now())`,
		bOwner, otherPubID); err != nil {
		t.Fatalf("owner B: %v", err)
	}
	w, _ = doReq(t, r, http.MethodGet, "/v1/articles?publicationId="+otherPubID, routerJWT(bOwner), nil)
	if w.Code != http.StatusOK {
		t.Fatalf("liste B = %d, body=%s", w.Code, w.Body.String())
	}
	if strings.Contains(w.Body.String(), "recette-pates") {
		t.Fatalf("liste B fuit l'article de A: %s", w.Body.String())
	}
	_ = fx
}

// ─── RBAC : rôles lecteur / créateur / superadmin ───────────────────────────

func TestP3RBAC_ReaderCannotWriteCreatorResources(t *testing.T) {
	ctx := context.Background()
	seedSecurityUsers(t, ctx)
	r := testRouter(t)
	readerToken := routerJWT(securityReaderID)

	// Un lecteur (rôle user, sans publication) ne peut pas créer d'article :
	// soit 400 (publicationId requis), soit 403/401 (autorisation) — en aucun
	// cas 201 et en aucun cas l'article n'est créé.
	w, _ := doReq(t, r, http.MethodPost, "/v1/articles", readerToken, map[string]any{
		"title":         "Reader article",
		"content":       "x",
		"contentFormat": "markdown",
	})
	if w.Code != http.StatusForbidden && w.Code != http.StatusUnauthorized && w.Code != http.StatusBadRequest {
		t.Fatalf("reader create article = %d, body=%s; attendu 400/403/401", w.Code, w.Body.String())
	}
	var count int
	if err := poolTest.QueryRow(context.Background(),
		`SELECT COUNT(*) FROM "Article"`).Scan(&count); err != nil {
		t.Fatalf("count articles: %v", err)
	}
	if count != 0 {
		t.Fatalf("articles créés par un lecteur = %d, attendu 0", count)
	}

	// Ni enregistrer un asset média… (401/403 attendu — la route exige au moins
	// une authentification valide, le lecteur l'a ; l'asset est autorisé pour
	// tout utilisateur authentifié → attendu 201 ici ; on vérifie plutôt que le
	// reader ne peut pas accéder aux endpoints creator suivants.)
	w, _ = doReq(t, r, http.MethodGet, "/v1/devtools/data", readerToken, nil)
	if w.Code != http.StatusForbidden {
		t.Fatalf("reader devtools = %d, body=%s; attendu 403", w.Code, w.Body.String())
	}
}

func TestP3RBAC_NonSuperadminBlockedFromAdminAuxEndpoints(t *testing.T) {
	ctx := context.Background()
	seedSecurityUsers(t, ctx)
	r := testRouter(t)
	creatorToken := routerJWT(securityCreatorID)

	aux := []struct {
		method, path string
	}{
		{http.MethodGet, "/v1/admin/widgets"},
		{http.MethodGet, "/v1/admin/config"},
		{http.MethodGet, "/v1/admin/oauth/clients"},
		{http.MethodGet, "/v1/admin/api-applicants"},
		{http.MethodGet, "/v1/admin/deliveries"},
		{http.MethodGet, "/v1/admin/users"},
	}
	for _, tt := range aux {
		w, body := doReq(t, r, tt.method, tt.path, creatorToken, nil)
		if w.Code != http.StatusForbidden {
			t.Fatalf("%s %s = %d, body=%s; attendu 403", tt.method, tt.path, w.Code, w.Body.String())
		}
		assertJSONError(t, w, body)
	}

	// Le superadmin, lui, accède à ces pages.
	adminToken := routerJWT(securityAdminID)
	w, _ := doReq(t, r, http.MethodGet, "/v1/admin/widgets", adminToken, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("superadmin widgets = %d, body=%s; attendu 200", w.Code, w.Body.String())
	}
	w, _ = doReq(t, r, http.MethodGet, "/v1/admin/deliveries", adminToken, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("superadmin deliveries = %d, body=%s; attendu 200", w.Code, w.Body.String())
	}
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const (
	securityOwnerID   = "00000000-0000-0000-0000-0000000000f5"
	securityReaderID  = "00000000-0000-0000-0000-0000000000f6"
	securityCreatorID = "00000000-0000-0000-0000-0000000000f7"
	securityAdminID   = "00000000-0000-0000-0000-0000000000f8"
)

func seedSecurityUsers(t *testing.T, ctx context.Context) {
	t.Helper()
	if _, err := poolTest.Exec(ctx, `TRUNCATE TABLE
		"MediaAsset", "MediaAuditLog", "MediaInvite", "MediaMember", "Media",
		"Article", "Publication", "User" CASCADE`); err != nil {
		t.Fatalf("truncate sécurité: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, "createdAt", "updatedAt") VALUES
		 ('pub_sec_main', 'PERSONAL', 'Média Sécurité', 'media-securite', now(), now()),
		 ('pub_sec_other_admin', 'PERSONAL', 'Autre Sécurité', 'autre-securite', now(), now())`); err != nil {
		t.Fatalf("publication: %v", err)
	}
	// owner (creator lié à la publication), reader (user), creator sans accès
	// admin (creator d'une autre publication), admin (superadmin).
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "publicationId", "createdAt", "updatedAt") VALUES
		($1, 'owner-sec@test.dev', 'ownersec', 'Owner', 'creator', 'pub_sec_main', now(), now()),
		($2, 'reader-sec@test.dev', 'readersec', 'Reader', 'user', NULL, now(), now()),
		($3, 'creator-sec@test.dev', 'creatorsec', 'Creator', 'creator', 'pub_sec_other_admin', now(), now()),
		($4, 'admin-sec@test.dev', 'adminsec', 'Admin', 'superadmin', NULL, now(), now())`,
		securityOwnerID, securityReaderID, securityCreatorID, securityAdminID); err != nil {
		t.Fatalf("users: %v", err)
	}
}

var _ = json.Valid
