package creator

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	db "github.com/qoefi/api/internal/database"
	authmw "github.com/qoefi/api/internal/middleware"
)

// insertMediaAPIKey insère une clé API rattachée directement à une publication (Média).
func insertMediaAPIKey(t *testing.T, pubID, name string, scopes []string) string {
	t.Helper()
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		t.Fatalf("rand: %v", err)
	}
	key := "qoe_live_" + hex.EncodeToString(raw)
	sum := sha256.Sum256([]byte(key))
	if _, err := poolTest.Exec(context.Background(),
		`INSERT INTO "ApiKey" (id, name, "keyPrefix", "keyHash", scopes, "publicationId")
		 VALUES (gen_random_uuid()::text, $1, 'qoe_live', $2, $3, $4)`,
		name, hex.EncodeToString(sum[:]), scopes, pubID); err != nil {
		t.Fatalf("insert media api key: %v", err)
	}
	return key
}

// newSubscribersTestRouter crée un routeur avec APIKeyAuth et routes publiques.
func newSubscribersTestRouter() http.Handler {
	h := NewHandler(poolTest, nil, "")
	r := chi.NewRouter()
	r.Group(func(api chi.Router) {
		api.Use(authmw.APIKeyAuth(db.New(poolTest)))
		h.RegisterAPIKey(api)
	})
	h.RegisterPublic(r)
	return r
}

func TestCreatorAPI_Subscribers_Lifecycle(t *testing.T) {
	alicePubID, aliceUserID, _, _ := seedFollows(t)
	r := newSubscribersTestRouter()
	key := insertAPIKey(t, aliceUserID, "sub-test", authmw.AllScopes)

	// 1. Inscription d'un premier abonné
	body, _ := json.Marshal(map[string]string{"email": "reader1@example.com"})
	req := httptest.NewRequest(http.MethodPost, "/v1/creator/subscribers", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created, got %d: %s", rec.Code, rec.Body.String())
	}
	var created apiSubscriberItem
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if created.Email != "reader1@example.com" || !created.IsActive {
		t.Fatalf("unexpected subscriber: %+v", created)
	}

	// 2. Erreur sur email invalide
	badReq := httptest.NewRequest(http.MethodPost, "/v1/creator/subscribers", bytes.NewReader([]byte(`{"email":"pas-un-email"}`)))
	badReq.Header.Set("Authorization", "Bearer "+key)
	badReq.Header.Set("Content-Type", "application/json")
	badRec := httptest.NewRecorder()
	r.ServeHTTP(badRec, badReq)
	if badRec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request, got %d", badRec.Code)
	}

	// 3. Ré-inscription (idempotence)
	req2 := httptest.NewRequest(http.MethodPost, "/v1/creator/subscribers", bytes.NewReader(body))
	req2.Header.Set("Authorization", "Bearer "+key)
	req2.Header.Set("Content-Type", "application/json")
	rec2 := httptest.NewRecorder()
	r.ServeHTTP(rec2, req2)
	if rec2.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created on idempotent upsert, got %d", rec2.Code)
	}

	// 4. Liste des abonnés
	listReq := httptest.NewRequest(http.MethodGet, "/v1/creator/subscribers", nil)
	listReq.Header.Set("Authorization", "Bearer "+key)
	listRec := httptest.NewRecorder()
	r.ServeHTTP(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", listRec.Code, listRec.Body.String())
	}
	var listResp apiSubscribersPage
	if err := json.Unmarshal(listRec.Body.Bytes(), &listResp); err != nil {
		t.Fatalf("unmarshal list: %v", err)
	}
	if listResp.Total != 1 || len(listResp.Items) != 1 {
		t.Fatalf("expected 1 subscriber, got total=%d, len=%d", listResp.Total, len(listResp.Items))
	}

	// 5. Statistiques abonnés
	statsReq := httptest.NewRequest(http.MethodGet, "/v1/creator/subscribers/stats", nil)
	statsReq.Header.Set("Authorization", "Bearer "+key)
	statsRec := httptest.NewRecorder()
	r.ServeHTTP(statsRec, statsReq)
	if statsRec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", statsRec.Code, statsRec.Body.String())
	}
	var statsResp apiSubscribersStatsResponse
	if err := json.Unmarshal(statsRec.Body.Bytes(), &statsResp); err != nil {
		t.Fatalf("unmarshal stats: %v", err)
	}
	if statsResp.Total != 1 || statsResp.Active != 1 || statsResp.Premium != 0 {
		t.Fatalf("unexpected stats: %+v", statsResp)
	}

	// 6. Désinscription par email
	delReq := httptest.NewRequest(http.MethodDelete, "/v1/creator/subscribers/reader1@example.com", nil)
	delReq.Header.Set("Authorization", "Bearer "+key)
	delRec := httptest.NewRecorder()
	r.ServeHTTP(delRec, delReq)
	if delRec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on delete, got %d: %s", delRec.Code, delRec.Body.String())
	}

	// 7. Vérification des stats après désinscription
	statsRec2 := httptest.NewRecorder()
	r.ServeHTTP(statsRec2, statsReq)
	json.Unmarshal(statsRec2.Body.Bytes(), &statsResp)
	if statsResp.Total != 1 || statsResp.Active != 0 {
		t.Fatalf("expected 1 total, 0 active after unsubscribe, got: %+v", statsResp)
	}

	// Nettoyage publication
	_ = alicePubID
}

func TestCreatorAPI_PublicSubscribe_CORS(t *testing.T) {
	_, _, _, _ = seedFollows(t)
	r := newSubscribersTestRouter()

	// 1. Preflight OPTIONS avec CORS
	optReq := httptest.NewRequest(http.MethodOptions, "/v1/publications/alice/subscribe", nil)
	optRec := httptest.NewRecorder()
	r.ServeHTTP(optRec, optReq)
	if optRec.Code != http.StatusNoContent {
		t.Fatalf("expected 204 No Content for OPTIONS, got %d", optRec.Code)
	}
	if optRec.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Fatalf("missing Access-Control-Allow-Origin header")
	}

	// 2. Inscription publique
	body, _ := json.Marshal(map[string]string{"email": "fan@custom-domain.org"})
	postReq := httptest.NewRequest(http.MethodPost, "/v1/publications/alice/subscribe", bytes.NewReader(body))
	postReq.Header.Set("Content-Type", "application/json")
	postRec := httptest.NewRecorder()
	r.ServeHTTP(postRec, postReq)
	if postRec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", postRec.Code, postRec.Body.String())
	}
	if postRec.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Fatalf("missing Access-Control-Allow-Origin on POST")
	}

	// 3. Publication inexistante
	errReq := httptest.NewRequest(http.MethodPost, "/v1/publications/inconnue/subscribe", bytes.NewReader(body))
	errReq.Header.Set("Content-Type", "application/json")
	errRec := httptest.NewRecorder()
	r.ServeHTTP(errRec, errReq)
	if errRec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 Not Found for unknown publication, got %d", errRec.Code)
	}
}

func TestCreatorAPI_PublicationMetadata(t *testing.T) {
	alicePubID, aliceUserID, _, _ := seedFollows(t)
	r := newSubscribersTestRouter()
	key := insertAPIKey(t, aliceUserID, "meta-test", authmw.AllScopes)

	req := httptest.NewRequest(http.MethodGet, "/v1/creator/publication", nil)
	req.Header.Set("Authorization", "Bearer "+key)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", rec.Code, rec.Body.String())
	}
	var data map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &data); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if data["id"] != alicePubID || data["name"] != "Alice" || data["slug"] != "alice" {
		t.Fatalf("unexpected publication metadata: %+v", data)
	}
}

func TestCreatorAPI_MediaKey_Highlights(t *testing.T) {
	ctx := context.Background()

	// 1. Créer une publication média et un média
	mediaPubID := "pub-media-news-001"
	mediaID := "media-news-001"
	ownerUserID := "00000000-0000-0000-0000-000000000200"

	_, _ = poolTest.Exec(ctx, `DELETE FROM "Publication" WHERE id = $1`, mediaPubID)
	_, _ = poolTest.Exec(ctx, `DELETE FROM "User" WHERE id = $1`, ownerUserID)

	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
		 VALUES ($1, 'owner@medianews.dev', 'medianews_owner', 'Media Owner', 'creator', now(), now())`,
		ownerUserID); err != nil {
		t.Fatalf("insert user: %v", err)
	}

	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, "createdAt", "updatedAt")
		 VALUES ($1, 'MEDIA', 'Media News', 'medianews', now(), now())`,
		mediaPubID); err != nil {
		t.Fatalf("insert publication: %v", err)
	}

	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Media" (id, "publicationId", "createdAt", "updatedAt")
		 VALUES ($1, $2, now(), now())`,
		mediaID, mediaPubID); err != nil {
		t.Fatalf("insert media: %v", err)
	}

	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "MediaMember" (id, "mediaId", "userId", role, permissions, status, "joinedAt", "updatedAt")
		 VALUES (gen_random_uuid()::text, $1, $2, 'owner', ARRAY['api_keys:manage'], 'active', now(), now())`,
		mediaID, ownerUserID); err != nil {
		t.Fatalf("insert media member: %v", err)
	}

	// 2. Créer un article publié pour ce média
	articleID := "art-media-001"
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Article" (id, title, slug, content, published, status, "publicationId", "authorId", "createdAt", "updatedAt")
		 VALUES ($1, 'Grand Reportage', 'grand-reportage', '<p>Texte</p>', true, 'PUBLISHED', $2, $3, now(), now())`,
		articleID, mediaPubID, ownerUserID); err != nil {
		t.Fatalf("insert article: %v", err)
	}

	// 3. Créer un Highlight public sur cet article
	highlightID := "hl-media-001"
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Highlight" (id, text, note, "isPublic", "articleId", "readerId", "createdAt")
		 VALUES ($1, 'Passage marquant', 'Note du lecteur', true, $2, $3, now())`,
		highlightID, articleID, ownerUserID); err != nil {
		t.Fatalf("insert highlight: %v", err)
	}

	// 4. Clé API Média (sans userId)
	mediaKey := insertMediaAPIKey(t, mediaPubID, "media-key", authmw.AllScopes)

	// 5. Requête GET /v1/creator/highlights avec la clé média
	r := newSubscribersTestRouter()
	req := httptest.NewRequest(http.MethodGet, "/v1/creator/highlights", nil)
	req.Header.Set("Authorization", "Bearer "+mediaKey)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for media key on highlights, got %d: %s", rec.Code, rec.Body.String())
	}

	var hlResp apiHighlightsPage
	if err := json.Unmarshal(rec.Body.Bytes(), &hlResp); err != nil {
		t.Fatalf("unmarshal highlights: %v", err)
	}
	if len(hlResp.Items) != 1 || hlResp.Items[0].ID != highlightID {
		t.Fatalf("expected highlight %s, got: %+v", highlightID, hlResp.Items)
	}
}
