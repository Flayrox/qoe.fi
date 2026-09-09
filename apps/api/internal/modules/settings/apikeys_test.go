package settings

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/testutil"
)

// Cycle de vie des clés API créateur : génération (accès approuvé
// requis), scopes optionnels, listing sans fuite de hash, révocation.

func newKeysRouter() http.Handler {
	h := NewHandler(NewService(poolTest))
	r := chi.NewRouter()
	h.RegisterProtected(r)
	return r
}

func doKeys(r http.Handler, method, path, userID, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if userID != "" {
		ctx := context.WithValue(req.Context(), middleware.UserIDKey, userID)
		req = req.WithContext(ctx)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestApiKeyLifecycle(t *testing.T) {
	fx, err := testutil.SeedOAuth(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed oauth: %v", err)
	}
	r := newKeysRouter()

	// ── Génération refusée sans accès API approuvé.
	w := doKeys(r, http.MethodPost, "/v1/settings/api-keys", fx.ViewerID,
		`{"name":"Pirate"}`)
	if w.Code != http.StatusForbidden {
		t.Fatalf("non-approuvé = %d %s, attendu 403", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "approuvée") {
		t.Fatalf("message d'accès manquant : %s", w.Body.String())
	}

	// ── Génération nominale (créateur approuvé) : clé en clair une seule fois.
	w = doKeys(r, http.MethodPost, "/v1/settings/api-keys", fx.OwnerID,
		`{"name":"Intégration","scopes":["READ"]}`)
	if w.Code != http.StatusOK {
		t.Fatalf("create = %d %s", w.Code, w.Body.String())
	}
	var gen struct {
		APIKey string `json:"apiKey"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &gen); err != nil || !strings.HasPrefix(gen.APIKey, "qoe_live_") {
		t.Fatalf("clé absente ou malformée : %s (%v)", w.Body.String(), err)
	}

	// Scope inconnu filtré ; tous invalides → 403 avec message dédié.
	w = doKeys(r, http.MethodPost, "/v1/settings/api-keys", fx.OwnerID,
		`{"name":"Bad","scopes":["SUPERUSER"]}`)
	if w.Code != http.StatusForbidden || !strings.Contains(w.Body.String(), "scope") {
		t.Fatalf("scopes invalides = %d %s, attendu 403 scope", w.Code, w.Body.String())
	}

	// ── Listing : métadonnées visibles, hash ET clé en clair absents.
	w = doKeys(r, http.MethodGet, "/v1/settings/api-keys", fx.OwnerID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("list = %d %s", w.Code, w.Body.String())
	}
	blob := w.Body.String()
	if strings.Contains(blob, "keyHash") || strings.Contains(blob, gen.APIKey) {
		t.Fatal("fuite de hash/clé dans le listing")
	}
	var listed struct {
		Keys []struct {
			Name   string `json:"name"`
			Scopes []any  `json:"scopes"`
		} `json:"keys"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &listed); err != nil || len(listed.Keys) == 0 {
		t.Fatalf("liste vide ou invalide : %s (%v)", blob, err)
	}

	// ── Révocation : la clé ne doit plus authentifier.
	rows, err := poolTest.Query(context.Background(),
		`SELECT id FROM "ApiKey" WHERE "userId" = $1`, fx.OwnerID)
	if err != nil {
		t.Fatalf("select keys: %v", err)
	}
	defer rows.Close()
	var keyID string
	for rows.Next() {
		if err := rows.Scan(&keyID); err != nil {
			t.Fatalf("scan: %v", err)
		}
		break
	}
	w = doKeys(r, http.MethodDelete, "/v1/settings/api-keys/"+keyID, fx.OwnerID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("revoke = %d %s", w.Code, w.Body.String())
	}

	// La clé révoquée n'apparaît plus.
	w = doKeys(r, http.MethodGet, "/v1/settings/api-keys", fx.OwnerID, "")
	if strings.Contains(w.Body.String(), "Intégration") {
		t.Fatal("clé révoquée toujours listée")
	}
}

// Rotation : même id, nouveau secret ; l'ancienne clé est immédiatement
// invalide (auth par hash), les autres utilisateurs ne peuvent pas rotater.
func TestApiKeyRotation(t *testing.T) {
	ctx := context.Background()
	fx, err := testutil.SeedOAuth(ctx, poolTest)
	if err != nil {
		t.Fatalf("seed oauth: %v", err)
	}
	r := newKeysRouter()

	// Génération nominale.
	w := doKeys(r, http.MethodPost, "/v1/settings/api-keys", fx.OwnerID,
		`{"name":"À rotater"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("create = %d %s", w.Code, w.Body.String())
	}
	var gen struct {
		APIKey string `json:"apiKey"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &gen); err != nil || !strings.HasPrefix(gen.APIKey, "qoe_live_") {
		t.Fatalf("clé absente : %s (%v)", w.Body.String(), err)
	}

	// Id de la clé en base.
	var keyID string
	if err := poolTest.QueryRow(ctx,
		`SELECT id FROM "ApiKey" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
		fx.OwnerID).Scan(&keyID); err != nil {
		t.Fatalf("select key id: %v", err)
	}

	// La clé fraîche authentifie (APIKeyContext OK).
	if _, ok := middleware.APIKeyContext(db.New(poolTest), bearer(gen.APIKey)); !ok {
		t.Fatal("clé fraîche doit authentifier")
	}

	// Rotation : nouvelle clé en clair, différente de l'ancienne.
	w = doKeys(r, http.MethodPost, "/v1/settings/api-keys/"+keyID+"/rotate", fx.OwnerID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("rotate = %d %s", w.Code, w.Body.String())
	}
	var rot struct {
		APIKey string `json:"apiKey"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &rot); err != nil || !strings.HasPrefix(rot.APIKey, "qoe_live_") {
		t.Fatalf("nouvelle clé absente : %s (%v)", w.Body.String(), err)
	}
	if rot.APIKey == gen.APIKey {
		t.Fatal("la rotation doit produire un secret différent")
	}

	// Le hash en base correspond à la NOUVELLE clé (l'ancienne ne passe plus).
	var storedHash string
	if err := poolTest.QueryRow(ctx,
		`SELECT "keyHash" FROM "ApiKey" WHERE id = $1`, keyID).Scan(&storedHash); err != nil {
		t.Fatalf("select hash: %v", err)
	}
	sum := sha256.Sum256([]byte(rot.APIKey))
	if storedHash != hex.EncodeToString(sum[:]) {
		t.Fatal("le hash en base ne correspond pas à la nouvelle clé")
	}
	if _, ok := middleware.APIKeyContext(db.New(poolTest), bearer(gen.APIKey)); ok {
		t.Fatal("l'ancienne clé doit être invalide après rotation")
	}
	if _, ok := middleware.APIKeyContext(db.New(poolTest), bearer(rot.APIKey)); !ok {
		t.Fatal("la nouvelle clé doit authentifier")
	}

	// Un autre utilisateur (approuvé API, pour franchir le check d'accès) ne
	// peut pas rotater une clé qui ne lui appartient pas → 404 (isolation).
	if _, err := poolTest.Exec(ctx,
		`UPDATE "User" SET "apiAccessStatus" = 'approved' WHERE id = $1`, fx.ViewerID); err != nil {
		t.Fatalf("approve viewer: %v", err)
	}
	w = doKeys(r, http.MethodPost, "/v1/settings/api-keys/"+keyID+"/rotate", fx.ViewerID, "")
	if w.Code != http.StatusNotFound {
		t.Fatalf("rotate par un tiers = %d, attendu 404", w.Code)
	}

	// Rotation d'une clé inexistante → 404.
	w = doKeys(r, http.MethodPost, "/v1/settings/api-keys/inexistante/rotate", fx.OwnerID, "")
	if w.Code != http.StatusNotFound {
		t.Fatalf("rotate inconnue = %d, attendu 404", w.Code)
	}
}

// bearer construit une requête GET avec l'en-tête Authorization Bearer.
func bearer(token string) *http.Request {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	return req
}
