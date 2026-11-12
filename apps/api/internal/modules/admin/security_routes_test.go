package admin

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/qoefi/api/internal/adminauthz"
)

func TestSecurityRoutes_RegisteredWithCapabilities(t *testing.T) {
	_, console, _ := testConsole(t, nil)

	expected := map[string]adminauthz.Capability{
		"GET /v1/admin/security/overview":                  adminauthz.AbuseRead,
		"POST /v1/admin/security/trust/{userId}/recompute": adminauthz.AbuseDecide,
	}

	got := map[string]adminauthz.Capability{}
	for _, rt := range console.Registry().Routes() {
		got[rt.Key()] = rt.Capability
	}

	for key, wantCap := range expected {
		capGot, ok := got[key]
		if !ok {
			t.Errorf("route %s absente du registre adminauthz", key)
			continue
		}
		if capGot != wantCap {
			t.Errorf("route %s : capacité = %q, attendu %q", key, capGot, wantCap)
		}
	}
}

func TestSecurityRoutes_EnforcesAbuseCapabilities(t *testing.T) {
	t.Run("overview refuse sans admin.abuse.read et répond 200 avec", func(t *testing.T) {
		rDenied, _, _ := testConsole(t, &enforcingLookup{
			access: adminauthz.Access{
				UserID:       "staff-1",
				Roles:        []string{adminauthz.RoleSupport},
				Capabilities: adminauthz.Set{adminauthz.SupportRead: true},
			},
		})
		wDenied := do(rDenied, http.MethodGet, "/v1/admin/security/overview", "staff-1", "")
		if wDenied.Code != http.StatusForbidden {
			t.Fatalf("GET /v1/admin/security/overview sans capacité = %d, attendu 403", wDenied.Code)
		}

		rAllowed, _, _ := testConsole(t, &enforcingLookup{
			access: adminauthz.Access{
				UserID:       "staff-2",
				Roles:        []string{adminauthz.RoleModeration},
				Capabilities: adminauthz.Set{adminauthz.AbuseRead: true},
			},
		})
		wAllowed := do(rAllowed, http.MethodGet, "/v1/admin/security/overview", "staff-2", "")
		if wAllowed.Code != http.StatusOK {
			t.Fatalf("GET /v1/admin/security/overview avec AbuseRead = %d, attendu 200 (%s)", wAllowed.Code, wAllowed.Body.String())
		}

		var body SecurityOverview
		if err := json.Unmarshal(wAllowed.Body.Bytes(), &body); err != nil {
			t.Fatalf("JSON overview invalide: %v", err)
		}
		if len(body.PolicyV3) != 6 {
			t.Fatalf("len(PolicyV3) = %d, attendu 6", len(body.PolicyV3))
		}
	})

	t.Run("recompute refuse sans admin.abuse.decide et atteint le handler avec", func(t *testing.T) {
		rDenied, _, _ := testConsole(t, &enforcingLookup{
			access: adminauthz.Access{
				UserID:       "staff-1",
				Roles:        []string{adminauthz.RoleModeration},
				Capabilities: adminauthz.Set{adminauthz.AbuseRead: true},
			},
		})
		wDenied := do(rDenied, http.MethodPost, "/v1/admin/security/trust/00000000-0000-0000-0000-0000000000b7/recompute", "staff-1", "")
		if wDenied.Code != http.StatusForbidden {
			t.Fatalf("POST recompute sans capacité = %d, attendu 403", wDenied.Code)
		}

		rAllowed, _, _ := testConsole(t, &enforcingLookup{
			access: adminauthz.Access{
				UserID:       "staff-2",
				Roles:        []string{adminauthz.RoleModeration},
				Capabilities: adminauthz.Set{adminauthz.AbuseDecide: true},
			},
		})
		wAllowed := do(rAllowed, http.MethodPost, "/v1/admin/security/trust/00000000-0000-0000-0000-0000000000b7/recompute", "staff-2", "")
		if wAllowed.Code != http.StatusServiceUnavailable {
			t.Fatalf("POST recompute avec AbuseDecide (trustSvc nil) = %d, attendu 503 (%s)", wAllowed.Code, wAllowed.Body.String())
		}
	})
}
