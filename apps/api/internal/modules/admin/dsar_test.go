package admin

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/qoefi/api/internal/adminauthz"
)

func TestAdminDSAR_Endpoints(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	seedAdmin(t, ctx)

	const doomedUserID = "00000000-0000-0000-0000-00000000d5a1"
	const doomedEmail = "dsar-doomed@test.dev"

	// Préparation de l'utilisateur à exporter puis effacer
	_, _ = poolTest.Exec(ctx, `DELETE FROM "User" WHERE id = $1`, doomedUserID)
	_, _ = poolTest.Exec(ctx, `DELETE FROM "EmailSuppression" WHERE email = $1`, doomedEmail)
	t.Cleanup(func() {
		_, _ = poolTest.Exec(context.Background(), `DELETE FROM "User" WHERE id = $1`, doomedUserID)
		_, _ = poolTest.Exec(context.Background(), `DELETE FROM "EmailSuppression" WHERE email = $1`, doomedEmail)
	})

	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
		VALUES ($1, $2, 'dsardoomed', 'DSAR Doomed User', 'user', now(), now())`,
		doomedUserID, doomedEmail); err != nil {
		t.Fatalf("seed user: %v", err)
	}

	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "UserSettings" (id, "userId", "updatedAt")
		VALUES (gen_random_uuid()::text, $1, now())`, doomedUserID); err != nil {
		t.Fatalf("seed settings: %v", err)
	}

	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "AccountDeletionRequest" (id, "userId", status, reason, "requestedAt")
		VALUES ('del_req_test_1', $1, 'PENDING', 'Droit a l oubli RGPD Art 17', now())`,
		doomedUserID); err != nil {
		t.Fatalf("seed deletion request: %v", err)
	}

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

	// 1. GET /v1/admin/compliance/deletion-requests -> liste avec délai RGPD
	wList := doClaims(router, http.MethodGet, "/v1/admin/compliance/deletion-requests", adminReaderID, freshSession(), "")
	if wList.Code != http.StatusOK {
		t.Fatalf("GET /v1/admin/compliance/deletion-requests = %d, attendu %d", wList.Code, http.StatusOK)
	}
	var listRes struct {
		Requests []DeletionRequestDTO `json:"requests"`
	}
	if err := json.Unmarshal(wList.Body.Bytes(), &listRes); err != nil {
		t.Fatalf("unmarshal list response: %v (%s)", err, wList.Body.String())
	}
	var found bool
	for _, req := range listRes.Requests {
		if req.ID == "del_req_test_1" {
			found = true
			if req.UserID != doomedUserID || req.UserEmail != doomedEmail || req.Status != "PENDING" {
				t.Fatalf("demande invalide: %+v", req)
			}
			if req.DaysRemaining < 28 || req.DaysRemaining > 31 {
				t.Fatalf("délai restant inattendu: %d jours", req.DaysRemaining)
			}
			break
		}
	}
	if !found {
		t.Fatal("demande del_req_test_1 non trouvée dans la liste")
	}

	// 2. POST /v1/admin/users/{userID}/dsar-export -> paquet scellé
	exportBody := `{"reason":"Demande officielle RGPD Art. 15"}`
	wExp := doClaims(router, http.MethodPost, "/v1/admin/users/"+doomedUserID+"/dsar-export", adminReaderID, freshSession(), exportBody)
	if wExp.Code != http.StatusOK {
		t.Fatalf("POST dsar-export = %d %s, attendu %d", wExp.Code, wExp.Body.String(), http.StatusOK)
	}
	dsarHash := wExp.Header().Get("X-Qoe-DSAR-Hash")
	if dsarHash == "" {
		t.Fatal("en-tête X-Qoe-DSAR-Hash absent")
	}
	var exportData DSARExportDTO
	if err := json.Unmarshal(wExp.Body.Bytes(), &exportData); err != nil {
		t.Fatalf("unmarshal export: %v", err)
	}
	if exportData.UserID != doomedUserID || exportData.ChecksumSha256 != dsarHash {
		t.Fatalf("export incomplet ou hash discordant: %+v", exportData)
	}

	// 3. POST /v1/admin/users/{userID}/erase -> purge en cascade + liste d'opposition
	reqId := "del_req_test_1"
	erasePayload := EraseUserInput{
		Reason:    "Demande d'effacement confirmée par le staff",
		RequestID: &reqId,
	}
	eraseBytes, _ := json.Marshal(erasePayload)
	wErase := doClaims(router, http.MethodPost, "/v1/admin/users/"+doomedUserID+"/erase", adminReaderID, freshSession(), string(eraseBytes))
	if wErase.Code != http.StatusOK {
		t.Fatalf("POST erase = %d %s, attendu %d", wErase.Code, wErase.Body.String(), http.StatusOK)
	}
	var receipt ErasureReceiptDTO
	if err := json.Unmarshal(wErase.Body.Bytes(), &receipt); err != nil {
		t.Fatalf("unmarshal receipt: %v", err)
	}
	if receipt.UserID != doomedUserID || receipt.ProofSha256 == "" || receipt.EmailHash == "" {
		t.Fatalf("attestation d'effacement invalide: %+v", receipt)
	}

	// Vérifie que l'utilisateur n'existe plus en base
	var dummy string
	err := poolTest.QueryRow(ctx, `SELECT email FROM "User" WHERE id = $1`, doomedUserID).Scan(&dummy)
	if !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("l'utilisateur devrait avoir été purgé, trouvé err: %v", err)
	}

	// Vérifie que l'email est bien en liste d'opposition
	var suppCount int
	err = poolTest.QueryRow(ctx, `SELECT count(*) FROM "EmailSuppression" WHERE email = $1`, doomedEmail).Scan(&suppCount)
	if err != nil || suppCount == 0 {
		t.Fatalf("adresse email non inscrite en liste d'opposition: %v (count=%d)", err, suppCount)
	}

	// Vérifie la journalisation d'audit
	var auditCount int
	err = poolTest.QueryRow(ctx, `
		SELECT count(*) FROM "AdminAuditLog"
		WHERE action = 'dsar.erasure' AND "targetId" = $1`, doomedUserID).Scan(&auditCount)
	if err != nil || auditCount == 0 {
		t.Fatalf("audit log dsar.erasure manquant: %v", err)
	}
}
