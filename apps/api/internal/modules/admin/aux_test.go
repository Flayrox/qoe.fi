package admin

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"testing"
)

func TestSplitKeys(t *testing.T) {
	got := splitKeys("a,b, c ,,d")
	if len(got) != 4 || got[0] != "a" || got[3] != "d" {
		t.Fatalf("splitKeys = %v", got)
	}
	if got := splitKeys(""); len(got) != 0 {
		t.Fatalf("splitKeys(vide) = %v", got)
	}
}

// TestAdminTrendsPromosConfigs : routes auxiliaires (delete/update trend,
// delete/toggle promo, upsert configs) en superadmin.
func TestAdminTrendsPromosConfigs(t *testing.T) {
	seedAdmin(t, context.Background())
	r := newHTTPRouter()

	// Crée un trend + une promo pour récupérer leurs ids.
	w := do(r, http.MethodPost, "/v1/admin/widgets/trends", adminAdminID, `{"hashtag":"ia","count":5}`)
	if w.Code != http.StatusOK && w.Code != http.StatusCreated {
		t.Fatalf("add trend = %d %s", w.Code, w.Body.String())
	}
	var trend struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &trend)
	if trend.ID == "" {
		t.Fatalf("trend id vide: %s", w.Body.String())
	}

	// Update + delete du trend.
	w = do(r, http.MethodPatch, "/v1/admin/widgets/trends/"+trend.ID, adminAdminID, `{"count":42}`)
	if w.Code != http.StatusOK {
		t.Fatalf("update trend = %d %s", w.Code, w.Body.String())
	}
	w = do(r, http.MethodPatch, "/v1/admin/widgets/trends/"+trend.ID, adminAdminID, `{bad`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("update trend bad json = %d, attendu 400", w.Code)
	}
	w = do(r, http.MethodDelete, "/v1/admin/widgets/trends/"+trend.ID, adminAdminID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("delete trend = %d %s", w.Code, w.Body.String())
	}

	// Promo : save → toggle → delete.
	w = do(r, http.MethodPost, "/v1/admin/widgets/promos", adminAdminID,
		`{"title":"Promo Admin","description":"desc","ctaLabel":"Lire","ctaUrl":"https://x","imageUrl":"https://i/x"}`)
	if w.Code != http.StatusOK && w.Code != http.StatusCreated {
		t.Fatalf("save promo = %d %s", w.Code, w.Body.String())
	}
	var promo struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &promo)
	if promo.ID == "" {
		t.Fatalf("promo id vide: %s", w.Body.String())
	}
	w = do(r, http.MethodPatch, "/v1/admin/widgets/promos/"+promo.ID, adminAdminID, `{"isActive":false}`)
	if w.Code != http.StatusOK {
		t.Fatalf("toggle promo = %d %s", w.Code, w.Body.String())
	}
	w = do(r, http.MethodDelete, "/v1/admin/widgets/promos/"+promo.ID, adminAdminID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("delete promo = %d %s", w.Code, w.Body.String())
	}

	// Configs : upsert d'une liste, liste vide → 400, JSON invalide → 400.
	w = do(r, http.MethodPut, "/v1/admin/config", adminAdminID,
		`[{"key":"feature_x","value":"true","type":"BOOLEAN"}]`)
	if w.Code != http.StatusOK {
		t.Fatalf("upsert config = %d %s", w.Code, w.Body.String())
	}
	w = do(r, http.MethodPut, "/v1/admin/config", adminAdminID, `[]`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("upsert config vide = %d, attendu 400", w.Code)
	}
	w = do(r, http.MethodPut, "/v1/admin/config", adminAdminID, `{bad`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("upsert config bad json = %d, attendu 400", w.Code)
	}
	// Lecture filtrée par clés.
	w = do(r, http.MethodGet, "/v1/admin/config?keys=feature_x,autre", adminAdminID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("config par clés = %d %s", w.Code, w.Body.String())
	}
}

// TestAdminStorageUsage : supervision du bucket images (superadmin uniquement).
func TestAdminStorageUsage(t *testing.T) {
	seedAdmin(t, context.Background())
	r := newHTTPRouter()

	// Deux assets : un actif, un purgé (exclu des totaux).
	if _, err := poolTest.Exec(context.Background(),
		`INSERT INTO "MediaAsset" (id, sha256, url, "storagePath", bucket, "mimeType", "sizeBytes",
		                           "ownerId", "targetType", status, "purgeDueAt", "updatedAt")
		 VALUES ('stor_adm_1', 'sha-stor-1', 'https://cdn.qoe.fi/life/s1.webp', 'articles/life/s1.webp',
		         'articles-media', 'image/webp', 1000, $1, 'ARTICLE_BODY',
		         'ATTACHED', NULL, now()),
		        ('stor_adm_2', 'sha-stor-2', 'https://cdn.qoe.fi/life/s2.webp', 'articles/life/s2.webp',
		         'articles-media', 'image/webp', 500, $1, 'ARTICLE_BODY',
		         'PURGED', NULL, now())`, adminCreator); err != nil {
		t.Fatalf("assets: %v", err)
	}

	w := do(r, http.MethodGet, "/v1/admin/storage/usage", adminAdminID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("storage usage = %d %s", w.Code, w.Body.String())
	}
	var out struct {
		TotalBytes int64            `json:"totalBytes"`
		AssetCount int64            `json:"assetCount"`
		ByStatus   map[string]int64 `json:"byStatus"`
		TopUsers   []struct {
			OwnerID    string `json:"ownerId"`
			TotalBytes int64  `json:"totalBytes"`
		} `json:"topUsers"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("json: %v", err)
	}
	if out.TotalBytes != 1000 || out.AssetCount != 1 {
		t.Fatalf("totaux = (%d, %d), attendu (1000, 1) — le PURGED doit être exclu",
			out.TotalBytes, out.AssetCount)
	}
	if out.ByStatus["ATTACHED"] != 1 || out.ByStatus["PURGED"] != 1 {
		t.Fatalf("byStatus = %v", out.ByStatus)
	}
	if len(out.TopUsers) != 1 || out.TopUsers[0].OwnerID != adminCreator || out.TopUsers[0].TotalBytes != 1000 {
		t.Fatalf("topUsers = %+v", out.TopUsers)
	}

	// Non-superadmin → 403.
	w2 := do(r, http.MethodGet, "/v1/admin/storage/usage", adminReaderID, "")
	if w2.Code != http.StatusForbidden {
		t.Fatalf("reader storage usage = %d, attendu 403", w2.Code)
	}
}

// TestAdminAllowlist : CRUD des invitations d'inscription (superadmin).
func TestAdminAllowlist(t *testing.T) {
	seedAdmin(t, context.Background())
	r := newHTTPRouter()
	if _, err := poolTest.Exec(context.Background(), `DELETE FROM "RegistrationAllowlist"`); err != nil {
		t.Fatalf("cleanup: %v", err)
	}

	// Email invalide → 400.
	w := do(r, http.MethodPost, "/v1/admin/registrations/allowlist", adminAdminID, `{"email":"pas-un-email"}`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("email invalide = %d, attendu 400 (%s)", w.Code, w.Body.String())
	}

	// Ajout (normalisé : casse + espaces).
	w = do(r, http.MethodPost, "/v1/admin/registrations/allowlist", adminAdminID,
		`{"email":"  Invite@Test.Dev ","note":"beta"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("add = %d %s", w.Code, w.Body.String())
	}
	var entry struct {
		Email string  `json:"email"`
		Note  *string `json:"note"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &entry); err != nil {
		t.Fatalf("json: %v", err)
	}
	if entry.Email != "invite@test.dev" || entry.Note == nil || *entry.Note != "beta" {
		t.Fatalf("entry = %+v", entry)
	}

	// Liste : 1 entrée.
	w = do(r, http.MethodGet, "/v1/admin/registrations/allowlist", adminAdminID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("list = %d %s", w.Code, w.Body.String())
	}
	var list []struct {
		Email string `json:"email"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &list); err != nil {
		t.Fatalf("json list: %v", err)
	}
	if len(list) != 1 || list[0].Email != "invite@test.dev" {
		t.Fatalf("list = %+v", list)
	}

	// Suppression (email URL-encodé).
	w = do(r, http.MethodDelete, "/v1/admin/registrations/allowlist/"+url.PathEscape("invite@test.dev"), adminAdminID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("delete = %d %s", w.Code, w.Body.String())
	}
	w = do(r, http.MethodGet, "/v1/admin/registrations/allowlist", adminAdminID, "")
	var after []any
	if err := json.Unmarshal(w.Body.Bytes(), &after); err != nil {
		t.Fatalf("json after: %v", err)
	}
	if len(after) != 0 {
		t.Fatalf("allowlist non vide après suppression : %+v", after)
	}

	// Non-superadmin → 403 sur les trois routes.
	for _, tc := range []struct{ method, path, body string }{
		{http.MethodGet, "/v1/admin/registrations/allowlist", ""},
		{http.MethodPost, "/v1/admin/registrations/allowlist", `{"email":"x@y.z"}`},
		{http.MethodDelete, "/v1/admin/registrations/allowlist/" + url.PathEscape("x@y.z"), ""},
	} {
		ww := do(r, tc.method, tc.path, adminReaderID, tc.body)
		if ww.Code != http.StatusForbidden {
			t.Fatalf("%s %s reader = %d, attendu 403", tc.method, tc.path, ww.Code)
		}
	}
}

// TestAdminDeliveries : listing + retry d'une livraison échouée.
func TestAdminDeliveries(t *testing.T) {
	seedAdmin(t, context.Background())
	r := newHTTPRouter()

	// Insère une notification + une livraison échouée.
	if _, err := poolTest.Exec(context.Background(),
		`INSERT INTO "Notification" (id, "recipientId", "senderId", type, "createdAt")
		 VALUES ('notif_adm_1', $1, $1, 'FOLLOW', now())`, adminCreator); err != nil {
		t.Fatalf("notification: %v", err)
	}
	if _, err := poolTest.Exec(context.Background(),
		`INSERT INTO "NotificationDelivery" (id, "notificationId", channel, status, recipient, attempts, "lastError", "dedupeKey", "createdAt", "updatedAt")
		 VALUES ('deliv_adm_1', 'notif_adm_1', 'EMAIL', 'FAILED', 'creator-adm@test.dev', 3, 'smtp down', 'notif_adm_1', now(), now())`); err != nil {
		t.Fatalf("delivery: %v", err)
	}

	w := do(r, http.MethodGet, "/v1/admin/deliveries", adminAdminID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("deliveries = %d %s", w.Code, w.Body.String())
	}
	w2 := do(r, http.MethodPost, "/v1/admin/deliveries/deliv_adm_1/retry", adminAdminID, "")
	if w2.Code != http.StatusOK {
		t.Fatalf("retry = %d %s", w2.Code, w2.Body.String())
	}
	// Retry d'une livraison inconnue → no-op idempotent (200).
	w3 := do(r, http.MethodPost, "/v1/admin/deliveries/introuvable/retry", adminAdminID, "")
	if w3.Code != http.StatusOK {
		t.Fatalf("retry inconnu = %d, attendu 200 (no-op)", w3.Code)
	}
}
