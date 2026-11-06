package admin

import (
	"context"
	"testing"
)

func TestService_GetPlatformSLOReport(t *testing.T) {
	// 1. Service sans pool (dégradé / non raccordé)
	svcNil := &Service{}
	reportNil := svcNil.GetPlatformSLOReport(context.Background())

	if reportNil == nil {
		t.Fatalf("GetPlatformSLOReport returned nil")
	}
	if len(reportNil.Surfaces) != 4 {
		t.Errorf("expected 4 surfaces, got %d", len(reportNil.Surfaces))
	}
	if reportNil.GlobalStatus != SLOCritical {
		t.Errorf("expected global status critical when pool is nil, got %s", reportNil.GlobalStatus)
	}

	// 2. Service avec pool de test (s'il existe dans le package)
	if poolTest != nil {
		svc := &Service{pool: poolTest}
		report := svc.GetPlatformSLOReport(context.Background())

		if report == nil {
			t.Fatalf("expected non-nil report with poolTest")
		}
		if len(report.Surfaces) != 4 {
			t.Fatalf("expected 4 surfaces, got %d", len(report.Surfaces))
		}

		// Vérification de la surface latence
		lat := report.Surfaces[0]
		if lat.ID != "api_latency" {
			t.Errorf("expected api_latency, got %s", lat.ID)
		}
		if lat.Status != SLONominal {
			t.Errorf("expected nominal latency in test container, got %s", lat.Status)
		}

		// Vérification de la surface schéma
		mig := report.Surfaces[3]
		if mig.ID != "migration" {
			t.Errorf("expected migration surface, got %s", mig.ID)
		}
		if mig.Status != SLONominal {
			t.Errorf("expected nominal migration status (v73 applied in tests), got %s", mig.Status)
		}
	}
}
