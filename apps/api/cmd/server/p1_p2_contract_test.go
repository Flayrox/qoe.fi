package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"testing"

	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/testutil"
)

func TestP1AuthenticatedReaderContracts(t *testing.T) {
	ctx := context.Background()
	seedReaderContract(t, ctx)
	r := testRouter(t)
	token := routerJWT(readerContractID)

	w, body := doReq(t, r, http.MethodGet, "/v1/me", token, nil)
	if w.Code != http.StatusOK || body["id"] != readerContractID {
		t.Fatalf("GET /v1/me = %d, body=%s", w.Code, w.Body.String())
	}

	w, body = doReq(t, r, http.MethodGet, "/v1/me/billing", token, nil)
	if w.Code != http.StatusOK || body["walletBalanceCents"] != float64(750) {
		t.Fatalf("GET /v1/me/billing = %d, body=%s", w.Code, w.Body.String())
	}

	w, body = doReq(t, r, http.MethodPatch, "/v1/me/profile", token, map[string]any{
		"name": "Lecteur modifie",
	})
	if w.Code != http.StatusOK || body["name"] != "Lecteur modifie" {
		t.Fatalf("PATCH /v1/me/profile = %d, body=%s", w.Code, w.Body.String())
	}

	w, body = doReq(t, r, http.MethodGet, "/v1/settings/preferences", token, nil)
	if w.Code != http.StatusOK || body == nil {
		t.Fatalf("GET /v1/settings/preferences = %d, body=%s", w.Code, w.Body.String())
	}

	w, body = doReq(t, r, http.MethodPatch, "/v1/settings/preferences", token, map[string]any{
		"emailNotifications": false,
	})
	if w.Code != http.StatusOK || body == nil {
		t.Fatalf("PATCH /v1/settings/preferences = %d, body=%s", w.Code, w.Body.String())
	}
}

func TestP1CreatorPublicationIsolation(t *testing.T) {
	ctx := context.Background()
	fx, err := testutil.SeedArticles(ctx, poolTest)
	if err != nil {
		t.Fatalf("seed articles: %v", err)
	}
	otherUserID := "00000000-0000-0000-0000-0000000000d1"
	otherPubID := "pub_contract_other"
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, "createdAt", "updatedAt")
		 VALUES ($1, 'PERSONAL', 'Autre publication', 'autre-publication', now(), now())`, otherPubID); err != nil {
		t.Fatalf("other publication: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "publicationId", "createdAt", "updatedAt")
		 VALUES ($1, 'other-contract@test.dev', 'othercontract', 'Autre', 'creator', $2, now(), now())`, otherUserID, otherPubID); err != nil {
		t.Fatalf("other user: %v", err)
	}

	r := testRouter(t)
	otherToken := routerJWT(otherUserID)

	w, _ := doReq(t, r, http.MethodGet, "/v1/articles?publicationId="+fx.PublicationID, otherToken, nil)
	if w.Code != http.StatusForbidden {
		t.Fatalf("other creator list = %d, body=%s; expected 403", w.Code, w.Body.String())
	}

	w, _ = doReq(t, r, http.MethodPost, "/v1/articles", otherToken, map[string]any{
		"publicationId": fx.PublicationID,
		"title":         "Cross tenant",
		"content":       "must be rejected",
		"contentFormat": "markdown",
	})
	if w.Code != http.StatusForbidden {
		t.Fatalf("cross-tenant create = %d, body=%s; expected 403", w.Code, w.Body.String())
	}
}

func TestP1AdminRBACContracts(t *testing.T) {
	ctx := context.Background()
	seedAdminContract(t, ctx)
	r := testRouter(t)

	creatorToken := routerJWT(adminContractCreatorID)
	w, _ := doReq(t, r, http.MethodGet, "/v1/admin/dashboard", creatorToken, nil)
	if w.Code != http.StatusForbidden {
		t.Fatalf("creator admin dashboard = %d, body=%s; expected 403", w.Code, w.Body.String())
	}

	adminToken := routerJWT(adminContractID)
	w, body := doReq(t, r, http.MethodGet, "/v1/admin/dashboard", adminToken, nil)
	if w.Code != http.StatusOK || body["users"] != float64(3) {
		t.Fatalf("admin dashboard = %d, body=%s", w.Code, w.Body.String())
	}

	w, body = doReq(t, r, http.MethodPatch, "/v1/admin/users/"+adminContractCreatorID, adminToken, map[string]any{
		"isSuspended":   true,
		"suspendReason": "test moderation",
	})
	if w.Code != http.StatusOK || body["isSuspended"] != true {
		t.Fatalf("admin moderation = %d, body=%s", w.Code, w.Body.String())
	}
}

func TestP1MediaWorkspaceAndAssetContracts(t *testing.T) {
	ctx := context.Background()
	seedMediaContract(t, ctx)
	r := testRouter(t)
	ownerToken := routerJWT(mediaContractOwnerID)
	viewerToken := routerJWT(mediaContractViewerID)

	w, body := doReq(t, r, http.MethodGet, "/v1/media/workspaces", ownerToken, nil)
	if w.Code != http.StatusOK || body == nil {
		t.Fatalf("media workspaces = %d, body=%s", w.Code, w.Body.String())
	}

	w, body = doReq(t, r, http.MethodPost, "/v1/media/", ownerToken, map[string]any{
		"name": "Nouveau média HTTP",
		"slug": "nouveau-media-http",
		"bio":  "Média de contrat",
	})
	if w.Code != http.StatusCreated {
		t.Fatalf("media create = %d, body=%s", w.Code, w.Body.String())
	}
	mediaID, _ := body["id"].(string)
	if mediaID == "" {
		t.Fatalf("media create has no id: %s", w.Body.String())
	}

	w, _ = doReq(t, r, http.MethodGet, "/v1/media/"+mediaID, ownerToken, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("owner media detail = %d, body=%s", w.Code, w.Body.String())
	}
	w, _ = doReq(t, r, http.MethodGet, "/v1/media/"+mediaID, viewerToken, nil)
	if w.Code != http.StatusForbidden {
		t.Fatalf("viewer media detail = %d, body=%s; expected 403", w.Code, w.Body.String())
	}

	assetBody := map[string]any{
		"sha256":      "contract-asset-sha256",
		"url":         "https://cdn.qoe.fi/contract.webp",
		"storagePath": "contract/contract.webp",
		"mimeType":    "image/webp",
		"sizeBytes":   4096,
		"targetType":  "ARTICLE_BODY",
	}
	w, body = doReq(t, r, http.MethodPost, "/v1/media-assets", ownerToken, assetBody)
	if w.Code != http.StatusCreated || body["status"] != "DRAFT_ORPHAN" {
		t.Fatalf("asset register = %d, body=%s", w.Code, w.Body.String())
	}
	assetID, _ := body["id"].(string)
	if assetID == "" {
		t.Fatalf("asset response has no id: %s", w.Body.String())
	}

	// CAS dedupe through the HTTP contract: a second registration reuses the
	// same asset instead of creating a duplicate row.
	w, body = doReq(t, r, http.MethodPost, "/v1/media-assets", ownerToken, assetBody)
	if w.Code != http.StatusCreated || body["id"] != assetID {
		t.Fatalf("asset dedupe = %d, body=%s", w.Code, w.Body.String())
	}
}

func TestP1ApiKeyScopesAndOwnershipContracts(t *testing.T) {
	ctx := context.Background()
	fx, err := testutil.SeedArticles(ctx, poolTest)
	if err != nil {
		t.Fatalf("seed articles: %v", err)
	}
	r := testRouter(t)

	readOnly := insertContractAPIKey(t, fx.AuthorID, []string{middleware.ScopeRead})
	w, _ := doReq(t, r, http.MethodGet, "/v1/articles/article-payant", readOnly, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("read-only key read = %d, body=%s", w.Code, w.Body.String())
	}
	w, _ = doReq(t, r, http.MethodPost, "/v1/articles", readOnly, map[string]any{
		"publicationId": fx.PublicationID,
		"title":         "write denied",
		"content":       "x",
		"contentFormat": "markdown",
	})
	if w.Code != http.StatusForbidden {
		t.Fatalf("read-only key write = %d, body=%s; expected 403", w.Code, w.Body.String())
	}

	writeOnly := insertContractAPIKey(t, fx.AuthorID, []string{middleware.ScopeWrite})
	w, _ = doReq(t, r, http.MethodGet, "/v1/articles/article-payant", writeOnly, nil)
	if w.Code != http.StatusForbidden {
		t.Fatalf("write-only key read = %d, body=%s; expected 403", w.Code, w.Body.String())
	}
}

func TestP2CorsAndSecurityContracts(t *testing.T) {
	r := testRouter(t)

	w, _ := doReq(t, r, http.MethodOptions, "/v1/me", "", nil)
	if w.Code != http.StatusNoContent {
		t.Fatalf("OPTIONS = %d, body=%s", w.Code, w.Body.String())
	}
	if w.Header().Get("Access-Control-Allow-Methods") == "" || w.Header().Get("Access-Control-Allow-Headers") == "" {
		t.Fatal("CORS preflight headers are incomplete")
	}

	reqPath := "/search/articles?q=" + strings.Repeat("x", 20000)
	w, _ = doReq(t, r, http.MethodGet, reqPath, "", nil)
	if w.Code == http.StatusInternalServerError {
		t.Fatalf("large public query caused 500: %s", w.Body.String())
	}

	w, body := doReq(t, r, http.MethodGet, "/v1/articles/missing?publicationId=missing", "not-a-jwt", nil)
	if w.Code != http.StatusOK && w.Code != http.StatusNotFound {
		t.Fatalf("invalid optional JWT changed public contract: %d, body=%s", w.Code, w.Body.String())
	}
	if w.Code == http.StatusNotFound && body["error"] == nil {
		t.Fatalf("invalid JWT 404 response has no JSON error: %s", w.Body.String())
	}
}

func TestP2NewsletterSubscriptionConcurrentIdempotence(t *testing.T) {
	ctx := context.Background()
	const pubID = "pub_concurrent_newsletter"
	if _, err := poolTest.Exec(ctx,
		`TRUNCATE TABLE "Subscriber", "Publication", "User" CASCADE`); err != nil {
		t.Fatalf("truncate newsletter: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, "createdAt", "updatedAt")
		 VALUES ($1, 'PERSONAL', 'Concurrent', 'concurrent', now(), now())`, pubID); err != nil {
		t.Fatalf("seed publication: %v", err)
	}

	r := testRouter(t)
	const workers = 8
	var wg sync.WaitGroup
	errs := make(chan error, workers)
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			w, _ := doReq(t, r, http.MethodPost, "/v1/home/subscribe", "", map[string]any{
				"email":         "Concurrent@Test.dev",
				"publicationId": pubID,
			})
			if w.Code != http.StatusOK {
				errs <- fmt.Errorf("status %d: %s", w.Code, w.Body.String())
			}
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		t.Error(err)
	}

	var count int
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM "Subscriber" WHERE email = 'concurrent@test.dev' AND "publicationId" = $1`, pubID).Scan(&count); err != nil {
		t.Fatalf("subscriber count: %v", err)
	}
	if count != 1 {
		t.Fatalf("concurrent subscriptions = %d, expected 1", count)
	}
}

const (
	readerContractID      = "00000000-0000-0000-0000-0000000000e1"
	mediaContractOwnerID  = "00000000-0000-0000-0000-0000000000e5"
	mediaContractViewerID = "00000000-0000-0000-0000-0000000000e6"

	adminContractID        = "00000000-0000-0000-0000-0000000000e2"
	adminContractCreatorID = "00000000-0000-0000-0000-0000000000e3"
)

func seedMediaContract(t *testing.T, ctx context.Context) {
	t.Helper()
	if _, err := poolTest.Exec(ctx,
		`TRUNCATE TABLE "MediaAuditLog", "MediaInvite", "MediaMember", "Media", "MediaAsset", "Publication", "User" CASCADE`); err != nil {
		t.Fatalf("media fixture truncate: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, "createdAt", "updatedAt")
		 VALUES ('pub_contract_media', 'MEDIA', 'Média Contrat', 'media-contrat', now(), now())`); err != nil {
		t.Fatalf("media fixture publication: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt") VALUES
		($1, 'media-owner-contract@test.dev', 'mediaownercontract', 'Media Owner', 'user', now(), now()),
		($2, 'media-viewer-contract@test.dev', 'mediaviewercontract', 'Media Viewer', 'user', now(), now())`,
		mediaContractOwnerID, mediaContractViewerID); err != nil {
		t.Fatalf("media fixture users: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Media" (id, "publicationId", "createdAt", "updatedAt")
		 VALUES ('media_contract_001', 'pub_contract_media', now(), now())`); err != nil {
		t.Fatalf("media fixture media: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "MediaMember" (id, "mediaId", "userId", role, permissions, status, "createdAt", "updatedAt")
		 VALUES (gen_random_uuid()::text, 'media_contract_001', $1, 'owner', ARRAY[]::text[], 'active', now(), now()),
		        (gen_random_uuid()::text, 'media_contract_001', $2, 'viewer', ARRAY[]::text[], 'active', now(), now())`,
		mediaContractOwnerID, mediaContractViewerID); err != nil {
		t.Fatalf("media fixture members: %v", err)
	}
}

func seedReaderContract(t *testing.T, ctx context.Context) {
	t.Helper()
	if _, err := poolTest.Exec(ctx,
		`TRUNCATE TABLE "UserSettings", "WalletTransaction", "Subscriber", "Follows", "MutedWord", "Publication", "User" CASCADE`); err != nil {
		t.Fatalf("reader fixture truncate: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "walletBalanceCents", "createdAt", "updatedAt")
		 VALUES ($1, 'reader-contract@test.dev', 'readercontract', 'Lecteur Contrat', 'user', 750, now(), now())`, readerContractID); err != nil {
		t.Fatalf("reader fixture user: %v", err)
	}
}

func seedAdminContract(t *testing.T, ctx context.Context) {
	t.Helper()
	if _, err := poolTest.Exec(ctx,
		`TRUNCATE TABLE "WalletTransaction", "Article", "Publication", "User" CASCADE`); err != nil {
		t.Fatalf("admin fixture truncate: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt") VALUES
		($1, 'admin-contract@test.dev', 'admincontract', 'Admin Contract', 'superadmin', now(), now()),
		($2, 'creator-contract@test.dev', 'creatorcontract', 'Creator Contract', 'creator', now(), now()),
		('00000000-0000-0000-0000-0000000000e4', 'reader-contract-admin@test.dev', 'readeradmincontract', 'Reader', 'user', now(), now())`, adminContractID, adminContractCreatorID); err != nil {
		t.Fatalf("admin fixture users: %v", err)
	}
}

func insertContractAPIKey(t *testing.T, userID string, scopes []string) string {
	t.Helper()
	raw := "qoe_live_" + strings.Repeat("e", 32) + t.Name() + strings.Join(scopes, "_")
	sum := sha256.Sum256([]byte(raw))
	if _, err := poolTest.Exec(context.Background(), `
		INSERT INTO "ApiKey" (id, name, "keyPrefix", "keyHash", scopes, "userId", "createdAt")
		VALUES (gen_random_uuid()::text, 'contract', 'qoe_live', $1, $2, $3, now())`,
		hex.EncodeToString(sum[:]), scopes, userID); err != nil {
		t.Fatalf("api key: %v", err)
	}
	return raw
}

var _ = json.Valid
