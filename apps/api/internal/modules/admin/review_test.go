package admin

// =====================================================================
// 🧪 Revue périodique des accès staff — tests de contrat (Phase 8)
// =====================================================================
// Ce que cette suite verrouille :
//   1. le calcul en direct de la revue : rôles actifs, échus, échéances
//      imminentes à 30 jours, distribution par rôle ;
//   2. l'instantané mensuel immuable et son idempotence stricte par mois ;
//   3. le rejet des formats de période invalides (CHECK base + Go) ;
//   4. les routes HTTP : contrôle par capacité (`admin.access.read`,
//      `admin.access.grant`) et journalisation d'audit sur déclenchement manuel.
// =====================================================================

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"testing"
	"time"

	"github.com/qoefi/api/internal/adminauthz"
)

const (
	reviewTestExpiringUser = "00000000-0000-0000-0000-0000000000e1"
	reviewTestExpiredUser  = "00000000-0000-0000-0000-0000000000e2"
	reviewTestFutureUser   = "00000000-0000-0000-0000-0000000000e3"
)

func seedReviewEnvironment(t *testing.T, ctx context.Context) {
	t.Helper()
	seedAdmin(t, ctx)
	// Nettoie AdminAccessReview et AdminUserRole pour garantir l'isolation
	if _, err := poolTest.Exec(ctx, `DELETE FROM "AdminAccessReview"`); err != nil {
		t.Fatalf("clean reviews: %v", err)
	}
	if _, err := poolTest.Exec(ctx, `DELETE FROM "AdminUserRole"`); err != nil {
		t.Fatalf("clean user roles: %v", err)
	}

	seedUser(t, ctx, reviewTestExpiringUser, "expiring@test.dev", "user")
	seedUser(t, ctx, reviewTestExpiredUser, "expired@test.dev", "user")
	seedUser(t, ctx, reviewTestFutureUser, "future@test.dev", "user")

	// 1. Un superadmin actif sans fin (adminAdminID)
	seedGrant(t, ctx, adminAdminID, adminauthz.RoleSuperadmin, "")

	// 2. Un analyste expirant dans 15 jours (doit être compté dans ExpiringSoon)
	in15Days := time.Now().UTC().Add(15 * 24 * time.Hour).Format("2006-01-02 15:04:05")
	seedGrant(t, ctx, reviewTestExpiringUser, adminauthz.RoleAnalyst, in15Days)

	// 3. Un modérateur déjà expiré (doit être dans ExpiredGrants et ExpiredList)
	pastExpiry := time.Now().UTC().Add(-2 * 24 * time.Hour)
	pastGranted := pastExpiry.Add(-10 * 24 * time.Hour)
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "AdminUserRole" ("userId", "roleKey", "grantedAt", "expiresAt")
		 VALUES ($1::uuid, $2, $3, $4)`,
		reviewTestExpiredUser, adminauthz.RoleModeration, pastGranted, pastExpiry); err != nil {
		t.Fatalf("seed expired moderation: %v", err)
	}

	// 4. Un support expirant dans 60 jours (actif, mais PAS dans ExpiringSoon car > 30 jours)
	in60Days := time.Now().UTC().Add(60 * 24 * time.Hour).Format("2006-01-02 15:04:05")
	seedGrant(t, ctx, reviewTestFutureUser, adminauthz.RoleSupport, in60Days)
}

func TestAccessReview_ComputeReport(t *testing.T) {
	ctx := context.Background()
	seedReviewEnvironment(t, ctx)
	svc := newTestService()

	report, err := svc.ComputeAccessReviewReport(ctx, "2026-10")
	if err != nil {
		t.Fatalf("ComputeAccessReviewReport: %v", err)
	}

	if report.Period != "2026-10" {
		t.Errorf("period = %q, attendu 2026-10", report.Period)
	}
	// Actifs : superadmin (sans fin), analyst (15j), support (60j) = 3
	if report.ActiveGrants != 3 {
		t.Errorf("ActiveGrants = %d, attendu 3", report.ActiveGrants)
	}
	// Échus : moderation = 1
	if report.ExpiredGrants != 1 {
		t.Errorf("ExpiredGrants = %d, attendu 1", report.ExpiredGrants)
	}
	// Échéance imminente (<= 30j) : analyst seul = 1
	if report.ExpiringSoon != 1 {
		t.Errorf("ExpiringSoon = %d, attendu 1", report.ExpiringSoon)
	}
	if len(report.ExpiringList) != 1 || report.ExpiringList[0].RoleKey != adminauthz.RoleAnalyst {
		t.Errorf("ExpiringList = %+v, attendu analyste", report.ExpiringList)
	}
	if len(report.ExpiredList) != 1 || report.ExpiredList[0].RoleKey != adminauthz.RoleModeration {
		t.Errorf("ExpiredList = %+v, attendu modérateur", report.ExpiredList)
	}
	if report.TotalStaff < 3 {
		t.Errorf("TotalStaff = %d, attendu >= 3", report.TotalStaff)
	}
}

func TestAccessReview_SnapshotIdempotenceAndForce(t *testing.T) {
	ctx := context.Background()
	seedReviewEnvironment(t, ctx)
	svc := newTestService()

	// Première capture pour 2026-10
	rev1, err := svc.SnapshotAccessReview(ctx, "2026-10", false)
	if err != nil {
		t.Fatalf("Snapshot 1: %v", err)
	}
	if rev1.Period != "2026-10" || rev1.ID == "" {
		t.Fatalf("rev1 invalide: %+v", rev1)
	}

	// Seconde capture idempotente : doit renvoyer rev1 sans modifier l'ID
	rev2, err := svc.SnapshotAccessReview(ctx, "2026-10", false)
	if err != nil {
		t.Fatalf("Snapshot 2: %v", err)
	}
	if rev2.ID != rev1.ID {
		t.Errorf("idempotence violée : rev1.ID=%s, rev2.ID=%s", rev1.ID, rev2.ID)
	}

	// Capture avec force = true : met à jour le rapport
	rev3, err := svc.SnapshotAccessReview(ctx, "2026-10", true)
	if err != nil {
		t.Fatalf("Snapshot 3 (force): %v", err)
	}
	if rev3.Period != "2026-10" {
		t.Errorf("rev3 period = %q", rev3.Period)
	}

	// Liste des revues
	list, err := svc.ListAccessReviews(ctx, 10)
	if err != nil {
		t.Fatalf("ListAccessReviews: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("nombre de revues = %d, attendu 1", len(list))
	}

	// Lecture directe par période
	got, err := svc.GetAccessReview(ctx, "2026-10")
	if err != nil {
		t.Fatalf("GetAccessReview: %v", err)
	}
	if got.ID != rev3.ID {
		t.Errorf("GetAccessReview id = %s, attendu %s", got.ID, rev3.ID)
	}
}

func TestAccessReview_InvalidPeriodFormat(t *testing.T) {
	ctx := context.Background()
	requirePool(t)
	svc := newTestService()

	invalidPeriods := []string{
		"2026-13",
		"2026-00",
		"2026/10",
		"invalid",
		"26-10",
		"2026-1",
	}

	for _, p := range invalidPeriods {
		if _, err := svc.ComputeAccessReviewReport(ctx, p); !errors.Is(err, ErrInvalidPeriod) {
			t.Errorf("Compute(%q) = %v, attendu ErrInvalidPeriod", p, err)
		}
		if _, err := svc.SnapshotAccessReview(ctx, p, false); !errors.Is(err, ErrInvalidPeriod) {
			t.Errorf("Snapshot(%q) = %v, attendu ErrInvalidPeriod", p, err)
		}
		if _, err := svc.GetAccessReview(ctx, p); !errors.Is(err, ErrInvalidPeriod) {
			t.Errorf("Get(%q) = %v, attendu ErrInvalidPeriod", p, err)
		}
	}
}

func TestAccessReview_HTTP_CapabilitiesAndAudit(t *testing.T) {
	ctx := context.Background()
	seedReviewEnvironment(t, ctx)

	analyst := &enforcingLookup{access: adminauthz.Access{
		UserID:       adminReaderID,
		Roles:        []string{adminauthz.RoleAnalyst},
		Capabilities: adminauthz.Set{adminauthz.AccessRead: true},
	}}
	superadmin := &enforcingLookup{access: adminauthz.Access{
		UserID:       adminAdminID,
		Roles:        []string{adminauthz.RoleSuperadmin},
		Capabilities: adminauthz.AllCapabilities(),
	}}

	rAnalyst := accessRouter(t, analyst)
	rSuper := accessRouter(t, superadmin)

	// 1. GET /v1/admin/access/reviews sans authentification -> 401
	if w := do(rAnalyst, http.MethodGet, "/v1/admin/access/reviews", "", ""); w.Code != http.StatusUnauthorized {
		t.Errorf("sans auth = %d, attendu 401", w.Code)
	}

	// 2. GET /v1/admin/access/reviews avec analyste (admin.access.read) -> 200
	{
		w := do(rAnalyst, http.MethodGet, "/v1/admin/access/reviews", adminReaderID, "")
		if w.Code != http.StatusOK {
			t.Errorf("analyste GET /reviews = %d, attendu 200 (corps: %s)", w.Code, w.Body.String())
		}
		var body struct {
			Current AccessReviewReport `json:"current"`
			Items   []AccessReview     `json:"items"`
			Total   int                `json:"total"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if body.Current.ActiveGrants != 3 {
			t.Errorf("current.ActiveGrants = %d, attendu 3", body.Current.ActiveGrants)
		}
	}

	// 3. POST /v1/admin/access/reviews/snapshot avec analyste -> 403 (manque admin.access.grant)
	{
		w := do(rAnalyst, http.MethodPost, "/v1/admin/access/reviews/snapshot", adminReaderID, `{"period":"2026-10"}`)
		if w.Code != http.StatusForbidden {
			t.Errorf("analyste POST /reviews/snapshot = %d, attendu 403", w.Code)
		}
	}

	// 4. POST /v1/admin/access/reviews/snapshot avec superadmin -> 201 + trace d'audit
	{
		bodyJSON := `{"period":"2026-10","force":true,"reason":"Vérification manuelle trimestrielle"}`
		w := do(rSuper, http.MethodPost, "/v1/admin/access/reviews/snapshot", adminAdminID, bodyJSON)
		if w.Code != http.StatusCreated {
			t.Fatalf("superadmin POST /reviews/snapshot = %d, attendu 201 (corps: %s)", w.Code, w.Body.String())
		}

		// Vérifie l'audit écrit
		var auditCount int
		err := poolTest.QueryRow(ctx,
			`SELECT COUNT(*) FROM "AdminAuditLog" WHERE action = 'access.review.snapshot' AND "actorId" = $1::uuid`,
			adminAdminID).Scan(&auditCount)
		if err != nil || auditCount == 0 {
			t.Fatalf("trace d'audit absente pour le snapshot: count=%d, err=%v", auditCount, err)
		}
	}

	// 5. GET /v1/admin/access/reviews/2026-10 -> 200
	{
		w := do(rAnalyst, http.MethodGet, "/v1/admin/access/reviews/2026-10", adminReaderID, "")
		if w.Code != http.StatusOK {
			t.Errorf("GET /reviews/2026-10 = %d, attendu 200", w.Code)
		}
	}

	// 6. GET /v1/admin/access/reviews/1999-01 (inexistant) -> 404
	{
		w := do(rAnalyst, http.MethodGet, "/v1/admin/access/reviews/1999-01", adminReaderID, "")
		if w.Code != http.StatusNotFound {
			t.Errorf("GET /reviews/1999-01 = %d, attendu 404", w.Code)
		}
	}
}
