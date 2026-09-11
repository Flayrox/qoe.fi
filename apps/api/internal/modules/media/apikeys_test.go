package media

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/permissions"
)

// TestMediaApiKeys_OwnerCreate vérifie le scénario 1 :
// L'owner peut créer une clé API média avec les scopes READ et WRITE,
// et la clé est bien rattachée au publicationId du média avec userId NULL.
func TestMediaApiKeys_OwnerCreate(t *testing.T) {
	ctx := context.Background()
	seedMedia(t, ctx)
	svc := newTestService()

	body := map[string]any{
		"name":   "CI Key",
		"scopes": []string{"READ", "WRITE"},
	}
	w := doMedia(t, svc, http.MethodPost, "/v1/media/media_001/api-keys", mediaOwnerID, body)
	if w.Code != http.StatusCreated {
		t.Fatalf("create api key: code = %d, attendu 201 (body %s)", w.Code, w.Body.String())
	}

	var res MediaApiKeyCreated
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("decode json: %v", err)
	}

	if res.ID == "" || res.Name != "CI Key" {
		t.Fatalf("id ou name invalide: %+v", res)
	}
	if !bytes.HasPrefix([]byte(res.Secret), []byte("qoe_live_")) {
		t.Fatalf("le secret doit commencer par qoe_live_: %s", res.Secret)
	}
	if res.KeyPrefix != res.Secret[:16] {
		t.Fatalf("keyPrefix (%s) ne correspond pas au secret (%s)", res.KeyPrefix, res.Secret)
	}

	// Vérification en base : publicationId = pub_media_001, userId = NULL, createdByUserId = mediaOwnerID
	var pubID, createdBy *string
	var isUserNull bool
	err := poolTest.QueryRow(ctx, `
		SELECT "publicationId", "createdByUserId"::text, ("userId" IS NULL)
		FROM "ApiKey" WHERE id = $1`, res.ID).Scan(&pubID, &createdBy, &isUserNull)
	if err != nil {
		t.Fatalf("select apikey: %v", err)
	}
	if pubID == nil || *pubID != "pub_media_001" {
		t.Fatalf("publicationId = %v, attendu pub_media_001", pubID)
	}
	if createdBy == nil || *createdBy != mediaOwnerID {
		t.Fatalf("createdByUserId = %v, attendu %s", createdBy, mediaOwnerID)
	}
	if !isUserNull {
		t.Fatalf("userId doit être NULL pour une clé média")
	}
}

// TestMediaApiKeys_ForbiddenWithoutPermission vérifie le scénario 2 :
// Les membres sans la permission api_keys:manage reçoivent 403 Forbidden.
func TestMediaApiKeys_ForbiddenWithoutPermission(t *testing.T) {
	ctx := context.Background()
	seedMedia(t, ctx)
	svc := newTestService()

	// 1. Writer sans permission de gestion
	w1 := doMedia(t, svc, http.MethodGet, "/v1/media/media_001/api-keys", mediaWriterID, nil)
	if w1.Code != http.StatusForbidden {
		t.Fatalf("writer list api keys = %d, attendu 403", w1.Code)
	}

	w2 := doMedia(t, svc, http.MethodPost, "/v1/media/media_001/api-keys", mediaWriterID, map[string]any{
		"name": "Unauthorized Key",
	})
	if w2.Code != http.StatusForbidden {
		t.Fatalf("writer create api key = %d, attendu 403", w2.Code)
	}

	// 2. Viewer sans permission
	w3 := doMedia(t, svc, http.MethodGet, "/v1/media/media_001/api-keys", mediaViewerID, nil)
	if w3.Code != http.StatusForbidden {
		t.Fatalf("viewer list api keys = %d, attendu 403", w3.Code)
	}

	// 3. Utilisateur non-membre
	w4 := doMedia(t, svc, http.MethodGet, "/v1/media/media_001/api-keys", mediaStranger, nil)
	if w4.Code != http.StatusForbidden {
		t.Fatalf("stranger list api keys = %d, attendu 403", w4.Code)
	}
}

// TestMediaApiKeys_DelegatedManage vérifie le scénario 3 :
// Un membre auquel on a explicitement accordé api_keys:manage peut créer,
// lister, modifier, faire tourner et révoquer des clés média.
func TestMediaApiKeys_DelegatedManage(t *testing.T) {
	ctx := context.Background()
	seedMedia(t, ctx)
	svc := newTestService()

	// Owner accorde api_keys:manage au writer
	wPerm := doMedia(t, svc, http.MethodPatch, "/v1/media/media_001/members/"+mediaWriterID+"/permissions", mediaOwnerID, map[string]any{
		"permissions": []string{permissions.PermCreateArticles, permissions.PermManageApiKeys},
	})
	if wPerm.Code != http.StatusOK {
		t.Fatalf("grant permissions = %d, attendu 200", wPerm.Code)
	}

	// Writer crée une clé
	wCreate := doMedia(t, svc, http.MethodPost, "/v1/media/media_001/api-keys", mediaWriterID, map[string]any{
		"name":   "Delegated Key",
		"scopes": []string{"READ", "WRITE"},
	})
	if wCreate.Code != http.StatusCreated {
		t.Fatalf("delegated create = %d, attendu 201 (body %s)", wCreate.Code, wCreate.Body.String())
	}
	var created MediaApiKeyCreated
	_ = json.Unmarshal(wCreate.Body.Bytes(), &created)

	// Writer liste les clés
	wList := doMedia(t, svc, http.MethodGet, "/v1/media/media_001/api-keys", mediaWriterID, nil)
	if wList.Code != http.StatusOK {
		t.Fatalf("delegated list = %d, attendu 200", wList.Code)
	}
	var listRes struct {
		Keys []MediaApiKeyItem `json:"keys"`
	}
	_ = json.Unmarshal(wList.Body.Bytes(), &listRes)
	if len(listRes.Keys) != 1 || listRes.Keys[0].ID != created.ID {
		t.Fatalf("liste inattendue: %+v", listRes.Keys)
	}

	// Writer renomme la clé
	wPatch := doMedia(t, svc, http.MethodPatch, "/v1/media/media_001/api-keys/"+created.ID, mediaWriterID, map[string]any{
		"name": "Delegated Key Renamed",
	})
	if wPatch.Code != http.StatusOK {
		t.Fatalf("delegated patch = %d, attendu 200", wPatch.Code)
	}

	// Writer fait tourner la clé
	wRotate := doMedia(t, svc, http.MethodPost, "/v1/media/media_001/api-keys/"+created.ID+"/rotate", mediaWriterID, nil)
	if wRotate.Code != http.StatusOK {
		t.Fatalf("delegated rotate = %d, attendu 200", wRotate.Code)
	}
	var rotated MediaApiKeyRotated
	_ = json.Unmarshal(wRotate.Body.Bytes(), &rotated)
	if rotated.Secret == "" || rotated.Secret == created.Secret {
		t.Fatalf("nouveau secret attendu: rotated=%s, old=%s", rotated.Secret, created.Secret)
	}

	// Writer révoque la clé
	wDelete := doMedia(t, svc, http.MethodDelete, "/v1/media/media_001/api-keys/"+created.ID, mediaWriterID, nil)
	if wDelete.Code != http.StatusOK {
		t.Fatalf("delegated delete = %d, attendu 200", wDelete.Code)
	}

	// La clé ne doit plus apparaître dans le listing
	wListAfter := doMedia(t, svc, http.MethodGet, "/v1/media/media_001/api-keys", mediaWriterID, nil)
	_ = json.Unmarshal(wListAfter.Body.Bytes(), &listRes)
	if len(listRes.Keys) != 0 {
		t.Fatalf("la clé révoquée ne doit plus être listée: %+v", listRes.Keys)
	}
}

// TestMediaApiKeys_SecretVisibility vérifie le scénario 4 :
// Le secret n'est retourné que lors du POST de création et du POST de rotation,
// et n'apparaît jamais dans le GET de listing ou dans la base en clair.
func TestMediaApiKeys_SecretVisibility(t *testing.T) {
	ctx := context.Background()
	seedMedia(t, ctx)
	svc := newTestService()

	// Création
	wCreate := doMedia(t, svc, http.MethodPost, "/v1/media/media_001/api-keys", mediaOwnerID, map[string]any{
		"name": "Secret Test Key",
	})
	if wCreate.Code != http.StatusCreated {
		t.Fatalf("create = %d", wCreate.Code)
	}
	var created map[string]any
	_ = json.Unmarshal(wCreate.Body.Bytes(), &created)
	sec, ok := created["secret"].(string)
	if !ok || sec == "" {
		t.Fatalf("secret manquant à la création")
	}
	keyID := created["id"].(string)

	// Listing
	wList := doMedia(t, svc, http.MethodGet, "/v1/media/media_001/api-keys", mediaOwnerID, nil)
	var listRes map[string][]map[string]any
	_ = json.Unmarshal(wList.Body.Bytes(), &listRes)
	if len(listRes["keys"]) == 0 {
		t.Fatalf("clé absente du listing")
	}
	if _, hasSecret := listRes["keys"][0]["secret"]; hasSecret {
		t.Fatalf("le secret ne doit PAS être renvoyé dans le listing GET")
	}

	// Vérification stockage hash en base
	var keyHash string
	_ = poolTest.QueryRow(ctx, `SELECT "keyHash" FROM "ApiKey" WHERE id = $1`, keyID).Scan(&keyHash)
	if keyHash == sec {
		t.Fatalf("le secret ne doit PAS être stocké en clair")
	}
	hashed := sha256.Sum256([]byte(sec))
	if keyHash != hex.EncodeToString(hashed[:]) {
		t.Fatalf("le hash stocké ne correspond pas au SHA-256 du secret")
	}

	// Rotation
	wRotate := doMedia(t, svc, http.MethodPost, "/v1/media/media_001/api-keys/"+keyID+"/rotate", mediaOwnerID, nil)
	var rotated map[string]any
	_ = json.Unmarshal(wRotate.Body.Bytes(), &rotated)
	newSec, ok := rotated["secret"].(string)
	if !ok || newSec == "" || newSec == sec {
		t.Fatalf("nouveau secret attendu à la rotation")
	}
}

// TestMediaApiKeys_MultiTenantIsolation vérifie les scénarios 5 & 6 :
// - Une clé média est strictement isolée à son propre média/publication.
// - Un membre du média A ne peut pas gérer les clés du média B.
func TestMediaApiKeys_MultiTenantIsolation(t *testing.T) {
	ctx := context.Background()
	seedMedia(t, ctx)
	svc := newTestService()

	// Création d'un second média (media_002) avec stranger comme owner
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "Publication" (id, type, name, slug, "createdAt", "updatedAt")
		VALUES ('pub_media_002', 'MEDIA', 'Média Deux', 'media-deux', now(), now())`); err != nil {
		t.Fatalf("seed pub_media_002: %v", err)
	}
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "Media" (id, "publicationId", "createdAt", "updatedAt")
		VALUES ('media_002', 'pub_media_002', now(), now())`); err != nil {
		t.Fatalf("seed media_002: %v", err)
	}
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "MediaMember" (id, "mediaId", "userId", role, status, "updatedAt")
		VALUES ('mem_002_owner', 'media_002', $1, 'owner', 'active', now())`, mediaStranger); err != nil {
		t.Fatalf("seed media_002 member: %v", err)
	}

	// Owner du média 1 essaie de lister ou créer des clés pour média 2 -> 403
	wList := doMedia(t, svc, http.MethodGet, "/v1/media/media_002/api-keys", mediaOwnerID, nil)
	if wList.Code != http.StatusForbidden {
		t.Fatalf("owner1 accessing media2 keys = %d, attendu 403", wList.Code)
	}

	wCreate := doMedia(t, svc, http.MethodPost, "/v1/media/media_002/api-keys", mediaOwnerID, map[string]any{
		"name": "Hacked Key",
	})
	if wCreate.Code != http.StatusForbidden {
		t.Fatalf("owner1 creating key on media2 = %d, attendu 403", wCreate.Code)
	}

	// Stranger crée une clé sur media 2
	wStrangerCreate := doMedia(t, svc, http.MethodPost, "/v1/media/media_002/api-keys", mediaStranger, map[string]any{
		"name": "Media 2 Key",
	})
	if wStrangerCreate.Code != http.StatusCreated {
		t.Fatalf("stranger creating key on media2 = %d, attendu 201", wStrangerCreate.Code)
	}
	var key2 MediaApiKeyCreated
	_ = json.Unmarshal(wStrangerCreate.Body.Bytes(), &key2)

	// Owner du média 1 essaie de rotater ou révoquer la clé du média 2 -> 403/404
	wRotate := doMedia(t, svc, http.MethodPost, "/v1/media/media_001/api-keys/"+key2.ID+"/rotate", mediaOwnerID, nil)
	if wRotate.Code != http.StatusNotFound {
		t.Fatalf("owner1 rotating media2 key via media1 url = %d, attendu 404", wRotate.Code)
	}
}

// TestMediaApiKeys_InvalidScopes vérifie le scénario 8 :
// Les scopes inexistants ou non autorisés sont refusés avec 422 Unprocessable Entity.
func TestMediaApiKeys_InvalidScopes(t *testing.T) {
	ctx := context.Background()
	seedMedia(t, ctx)
	svc := newTestService()

	// 1. Scope fantaisiste
	w1 := doMedia(t, svc, http.MethodPost, "/v1/media/media_001/api-keys", mediaOwnerID, map[string]any{
		"name":   "Bad Scope Key",
		"scopes": []string{"READ", "UNKNOWN_SCOPE"},
	})
	if w1.Code != http.StatusUnprocessableEntity {
		t.Fatalf("unknown scope code = %d, attendu 422 (body %s)", w1.Code, w1.Body.String())
	}

	// 2. Writer avec api_keys:manage mais SANS permViewAnalytics essaie de demander ANALYTICS
	wPerm := doMedia(t, svc, http.MethodPatch, "/v1/media/media_001/members/"+mediaWriterID+"/permissions", mediaOwnerID, map[string]any{
		"permissions": []string{permissions.PermCreateArticles, permissions.PermManageApiKeys},
	})
	if wPerm.Code != http.StatusOK {
		t.Fatalf("grant permissions = %d", wPerm.Code)
	}

	w2 := doMedia(t, svc, http.MethodPost, "/v1/media/media_001/api-keys", mediaWriterID, map[string]any{
		"name":   "Analytics Key by Writer",
		"scopes": []string{"READ", "ANALYTICS"},
	})
	if w2.Code != http.StatusUnprocessableEntity {
		t.Fatalf("writer granting analytics = %d, attendu 422", w2.Code)
	}
}

// TestMediaApiKeys_AuditLogs vérifie le scénario 9 :
// Les opérations de gestion sont journalisées dans MediaAuditLog sans exposer le secret.
func TestMediaApiKeys_AuditLogs(t *testing.T) {
	ctx := context.Background()
	seedMedia(t, ctx)
	svc := newTestService()

	// 1. Création
	wCreate := doMedia(t, svc, http.MethodPost, "/v1/media/media_001/api-keys", mediaOwnerID, map[string]any{
		"name": "Audit Key",
	})
	var created MediaApiKeyCreated
	_ = json.Unmarshal(wCreate.Body.Bytes(), &created)

	// 2. Renommage
	doMedia(t, svc, http.MethodPatch, "/v1/media/media_001/api-keys/"+created.ID, mediaOwnerID, map[string]any{
		"name": "Audit Key 2",
	})

	// 3. Rotation
	doMedia(t, svc, http.MethodPost, "/v1/media/media_001/api-keys/"+created.ID+"/rotate", mediaOwnerID, nil)

	// 4. Révocation
	doMedia(t, svc, http.MethodDelete, "/v1/media/media_001/api-keys/"+created.ID, mediaOwnerID, nil)

	// Vérification dans MediaAuditLog
	rows, err := poolTest.Query(ctx, `
		SELECT action, metadata::text
		FROM "MediaAuditLog"
		WHERE "mediaId" = 'media_001'
		ORDER BY "createdAt" ASC`)
	if err != nil {
		t.Fatalf("query audit log: %v", err)
	}
	defer rows.Close()

	actions := map[string]bool{}
	for rows.Next() {
		var act, meta string
		if err := rows.Scan(&act, &meta); err != nil {
			t.Fatalf("scan audit log: %v", err)
		}
		actions[act] = true
		// Vérification stricte : le secret ne doit JAMAIS apparaître dans le metadata
		if bytes.Contains([]byte(meta), []byte("qoe_live_")) {
			t.Fatalf("le secret a été enregistré dans l'audit log ! metadata = %s", meta)
		}
	}

	for _, expected := range []string{"api_key.created", "api_key.updated", "api_key.rotated", "api_key.revoked"} {
		if !actions[expected] {
			t.Fatalf("action %s absente de MediaAuditLog: %+v", expected, actions)
		}
	}
}

// TestMediaApiKeys_LifecycleAndPlatformGrant vérifie le scénario 10 :
// - Si le créateur d'une clé média est retiré du média, la clé reste fonctionnelle.
// - La désactivation d'un module sur la plateforme désactive la capacité pour la clé.
func TestMediaApiKeys_LifecycleAndPlatformGrant(t *testing.T) {
	ctx := context.Background()
	seedMedia(t, ctx)
	svc := newTestService()

	// 1. Writer reçoit api_keys:manage et crée une clé avec READ et WRITE
	_ = doMedia(t, svc, http.MethodPatch, "/v1/media/media_001/members/"+mediaWriterID+"/permissions", mediaOwnerID, map[string]any{
		"permissions": []string{permissions.PermCreateArticles, permissions.PermManageApiKeys},
	})
	wCreate := doMedia(t, svc, http.MethodPost, "/v1/media/media_001/api-keys", mediaWriterID, map[string]any{
		"name":   "Lifecycle Key",
		"scopes": []string{"READ", "WRITE"},
	})
	var created MediaApiKeyCreated
	_ = json.Unmarshal(wCreate.Body.Bytes(), &created)

	// 2. L'owner retire le writer du média
	wRemove := doMedia(t, svc, http.MethodDelete, "/v1/media/media_001/members/"+mediaWriterID, mediaOwnerID, nil)
	if wRemove.Code != http.StatusOK {
		t.Fatalf("remove member = %d", wRemove.Code)
	}

	// 3. Le writer ne peut plus lister les clés (n'est plus membre)
	wListEx := doMedia(t, svc, http.MethodGet, "/v1/media/media_001/api-keys", mediaWriterID, nil)
	if wListEx.Code != http.StatusForbidden {
		t.Fatalf("ex-member listing keys = %d, attendu 403", wListEx.Code)
	}

	// 4. Mais la clé média reste 100% valide au runtime !
	// Testons via middleware.APIKeyAuth
	rKey := chi.NewRouter()
	rKey.Use(middleware.APIKeyAuth(svc.q))
	rKey.With(middleware.RequireAPIScope(middleware.ScopeWrite)).Post("/test-write", func(w http.ResponseWriter, r *http.Request) {
		p, ok := middleware.GetPrincipal(r.Context())
		if !ok || p.Type != middleware.PrincipalTypePublication {
			t.Fatalf("principal invalide: %+v", p)
		}
		pubID, _ := middleware.PublicationID(r.Context())
		if pubID != "pub_media_001" {
			t.Fatalf("publicationId = %s, attendu pub_media_001", pubID)
		}
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodPost, "/test-write", nil)
	req.Header.Set("Authorization", "Bearer "+created.Secret)
	rr := httptest.NewRecorder()
	rKey.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("la clé créée par l'ex-membre doit fonctionner: code = %d", rr.Code)
	}

	// 5. Désactivation plateforme du module api:write via SystemConfig
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "SystemConfig" (key, value, "updatedAt")
		VALUES ('API_ACCESS_MODULES', '["api:read"]', now())
		ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now()`); err != nil {
		t.Fatalf("disable api:write: %v", err)
	}

	// La même requête avec la même clé doit maintenant échouer avec 403 Forbidden ("Scope WRITE requis")
	rr2 := httptest.NewRecorder()
	req2 := httptest.NewRequest(http.MethodPost, "/test-write", nil)
	req2.Header.Set("Authorization", "Bearer "+created.Secret)
	rKey.ServeHTTP(rr2, req2)
	if rr2.Code != http.StatusForbidden {
		t.Fatalf("après coupure plateforme de api:write, attendu 403, reçu %d", rr2.Code)
	}
}

// TestMediaApiKeys_MaxLimit vérifie la constante centralisée MaxActiveMediaApiKeys (10 clés).
func TestMediaApiKeys_MaxLimit(t *testing.T) {
	ctx := context.Background()
	seedMedia(t, ctx)
	svc := newTestService()

	// On crée 10 clés (limite autorisée)
	for i := 1; i <= MaxActiveMediaApiKeys; i++ {
		w := doMedia(t, svc, http.MethodPost, "/v1/media/media_001/api-keys", mediaOwnerID, map[string]any{
			"name": "Key Batch",
		})
		if w.Code != http.StatusCreated {
			t.Fatalf("création de la clé %d échouée: code=%d", i, w.Code)
		}
	}

	// La 11ème clé doit être refusée
	w11 := doMedia(t, svc, http.MethodPost, "/v1/media/media_001/api-keys", mediaOwnerID, map[string]any{
		"name": "Overflow Key",
	})
	if w11.Code == http.StatusCreated {
		t.Fatalf("la 11ème clé aurait dû être refusée au-delà de MaxActiveMediaApiKeys (%d)", MaxActiveMediaApiKeys)
	}
}
