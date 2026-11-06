package admin

import (
	"context"
	"testing"
)

func TestService_GetOutboxMetrics(t *testing.T) {
	svcNil := &Service{}
	metrics, err := svcNil.GetOutboxMetrics(context.Background(), adminAdminID)
	if err != nil {
		t.Fatalf("expected nil error on nil pool, got %v", err)
	}
	if metrics == nil {
		t.Fatalf("expected non-nil metrics")
	}
	if metrics.Status != "healthy" {
		t.Errorf("expected healthy status on empty metrics, got %s", metrics.Status)
	}

	if poolTest != nil {
		svc := &Service{pool: poolTest}
		m, err := svc.GetOutboxMetrics(context.Background(), adminAdminID)
		if err != nil {
			t.Fatalf("GetOutboxMetrics failed: %v", err)
		}
		if m == nil {
			t.Fatalf("expected non-nil metrics with poolTest")
		}

		// Test unlock stuck (devrait retourner 0 sans erreur)
		unlocked, err := svc.UnlockStuckDeliveries(context.Background(), adminAdminID, "test-routine", 10)
		if err != nil {
			t.Errorf("UnlockStuckDeliveries: %v", err)
		}
		if unlocked < 0 {
			t.Errorf("expected non-negative unlocked count, got %d", unlocked)
		}

		// Test retry all failed
		retried, err := svc.RetryAllFailedDeliveries(context.Background(), adminAdminID, "test-routine", "")
		if err != nil {
			t.Errorf("RetryAllFailedDeliveries: %v", err)
		}
		if retried < 0 {
			t.Errorf("expected non-negative retried count, got %d", retried)
		}
	}
}
