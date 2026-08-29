package admin

import (
	"context"
	"encoding/json"
	"net/http"
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
