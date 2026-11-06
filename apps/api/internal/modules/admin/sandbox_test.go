package admin

import (
	"context"
	"testing"
)

func TestService_SandboxScenariosAndSeed(t *testing.T) {
	svcNil := &Service{}
	_, err := svcNil.ExecuteSeedScenario(context.Background(), adminAdminID, "cold_start_reader", 1)
	if err == nil {
		t.Fatalf("expected error on nil pool, got nil")
	}

	if poolTest != nil {
		svc := &Service{pool: poolTest}
		res, err := svc.ExecuteSeedScenario(context.Background(), adminAdminID, "cold_start_reader", 1)
		if err != nil {
			t.Fatalf("ExecuteSeedScenario(cold_start_reader) failed: %v", err)
		}
		if !res.Success || res.GeneratedCount != 1 {
			t.Errorf("unexpected seed result: %+v", res)
		}

		// Test impersonation avec motif
		imp, err := svc.ImpersonateUser(context.Background(), adminAdminID, "admin-adm@test.dev", "Test audit impersonation")
		if err != nil {
			t.Fatalf("ImpersonateUser failed: %v", err)
		}
		if !imp.Impersonated || imp.UserID == "" {
			t.Errorf("unexpected impersonation result: %+v", imp)
		}

		// Test impersonation sans motif (doit refuser)
		_, err = svc.ImpersonateUser(context.Background(), adminAdminID, "admin-adm@test.dev", "")
		if err == nil {
			t.Errorf("expected error when reason is empty")
		}
	}
}
