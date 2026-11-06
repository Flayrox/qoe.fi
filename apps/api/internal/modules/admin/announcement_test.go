package admin

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/adminauthz"
)

func TestAdminAnnouncementEndpoints(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	seedAdmin(t, ctx)

	// Nettoyage préalable
	_, _ = poolTest.Exec(ctx, `DELETE FROM "SystemConfig" WHERE key = 'GLOBAL_ANNOUNCEMENT'`)
	t.Cleanup(func() {
		_, _ = poolTest.Exec(context.Background(), `DELETE FROM "SystemConfig" WHERE key = 'GLOBAL_ANNOUNCEMENT'`)
	})

	svc := NewService(poolTest)
	lookup := &fakeLookup{
		access: adminauthz.Access{
			UserID:       adminReaderID,
			Roles:        []string{adminauthz.RoleSuperadmin},
			Capabilities: adminauthz.AllCapabilities(),
		},
	}

	router := chi.NewRouter()
	console := adminauthz.NewConsole(router, lookup, nil)
	h := NewHandler(svc)
	h.SetConsole(console)
	h.Register(router)

	// 1. GET sans annonce existante -> 200 OK null
	w := doClaims(router, http.MethodGet, "/v1/admin/announcement", adminReaderID, freshSession(), "")
	if w.Code != http.StatusOK {
		t.Fatalf("GET /v1/admin/announcement sans config = %d, attendu %d", w.Code, http.StatusOK)
	}
	if w.Body.String() != "null\n" {
		t.Fatalf("GET body = %s, attendu null", w.Body.String())
	}

	// 2. PUT annonce valide avec preuve N2
	payload := SetAnnouncementInput{
		ID:       "ann_test_123",
		Active:   true,
		Message:  "Maintenance programmée à 22h",
		Type:     "warning",
		LinkURL:  strPtr("/status"),
		LinkText: strPtr("Voir le statut"),
	}
	bodyBytes, _ := json.Marshal(payload)
	wPut := doClaims(router, http.MethodPut, "/v1/admin/announcement", adminReaderID, freshSession(), string(bodyBytes))

	if wPut.Code != http.StatusOK {
		t.Fatalf("PUT /v1/admin/announcement = %d %s, attendu %d", wPut.Code, wPut.Body.String(), http.StatusOK)
	}

	var res GlobalAnnouncementDTO
	if err := json.Unmarshal(wPut.Body.Bytes(), &res); err != nil {
		t.Fatalf("unmarshal PUT response: %v (%s)", err, wPut.Body.String())
	}
	if res.ID != "ann_test_123" || !res.Active || res.Message != "Maintenance programmée à 22h" || res.Type != "warning" {
		t.Fatalf("résultat PUT inattendu: %+v", res)
	}

	// Vérifie que l'audit a bien été enregistré
	var auditCount int
	err := poolTest.QueryRow(ctx, `
		SELECT count(*) FROM "AdminAuditLog"
		WHERE action = 'announcement.update' AND "targetId" = 'GLOBAL_ANNOUNCEMENT'`).Scan(&auditCount)
	if err != nil {
		t.Fatalf("query audit log: %v", err)
	}
	if auditCount == 0 {
		t.Fatal("aucun audit log enregistré pour announcement.update")
	}

	// 3. GET retourne l'annonce sauvegardée
	wGet2 := doClaims(router, http.MethodGet, "/v1/admin/announcement", adminReaderID, freshSession(), "")
	if wGet2.Code != http.StatusOK {
		t.Fatalf("GET /v1/admin/announcement après save = %d, attendu %d", wGet2.Code, http.StatusOK)
	}
	var resGet GlobalAnnouncementDTO
	if err := json.Unmarshal(wGet2.Body.Bytes(), &resGet); err != nil {
		t.Fatalf("unmarshal GET response: %v (%s)", err, wGet2.Body.String())
	}
	if resGet.ID != "ann_test_123" || resGet.Message != "Maintenance programmée à 22h" {
		t.Fatalf("résultat GET inattendu: %+v", resGet)
	}

	// 4. PUT annonce active avec message vide -> 400 Bad Request
	badPayload := SetAnnouncementInput{
		Active:  true,
		Message: "   ",
		Type:    "promo",
	}
	badBytes, _ := json.Marshal(badPayload)
	wBad := doClaims(router, http.MethodPut, "/v1/admin/announcement", adminReaderID, freshSession(), string(badBytes))
	if wBad.Code != http.StatusBadRequest {
		t.Fatalf("PUT annonce invalide = %d, attendu %d", wBad.Code, http.StatusBadRequest)
	}
}

func strPtr(s string) *string {
	return &s
}
