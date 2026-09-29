package placements

import (
	"context"
	"log"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/testutil"
)

var poolTest *pgxpool.Pool

func TestMain(m *testing.M) {
	p, err := testutil.TryPool(context.Background())
	if err != nil {
		log.Printf("testcontainers indisponible, tests DB skippés: %v", err)
		poolTest = nil
	} else {
		poolTest = p
	}
	code := m.Run()
	if poolTest != nil {
		testutil.Cleanup()
	}
	os.Exit(code)
}

func requirePool(t *testing.T) {
	t.Helper()
	if poolTest == nil {
		t.Skip("DB de test indisponible")
	}
}

func TestPlacementValidation(t *testing.T) {
	svc := NewService(nil)
	ctx := context.Background()

	// Slot vide
	_, err := svc.GetActivePlacementForSlot(ctx, "", "", time.Now())
	if err == nil {
		t.Fatal("attend une erreur pour slot vide")
	}

	// Dismiss sans identifiant
	err = svc.DismissPlacement(ctx, "", "user_1", time.Now())
	if err == nil {
		t.Fatal("attend une erreur pour placementID vide")
	}

	// Création invalide
	_, err = svc.CreatePlacement(ctx, &Placement{Slot: ""})
	if err == nil {
		t.Fatal("attend une erreur pour création sans slot")
	}
}

func TestPlacementsLifecycle(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	svc := NewService(poolTest)

	slot := "test.slot.custom"
	now := time.Now().UTC()

	// 1. Créer deux placements avec priorités distinctes
	p1, err := svc.CreatePlacement(ctx, &Placement{
		Slot:           slot,
		Format:         "card",
		Type:           "promo",
		Title:          "Low priority promo",
		Body:           "Contenu low",
		TargetAudience: "all",
		Priority:       5,
		IsActive:       true,
		Dismissible:    true,
	})
	if err != nil {
		t.Fatalf("create p1: %v", err)
	}

	p2, err := svc.CreatePlacement(ctx, &Placement{
		Slot:           slot,
		Format:         "card",
		Type:           "warning",
		Title:          "High priority warning",
		Body:           "Contenu high",
		TargetAudience: "all",
		Priority:       20,
		IsActive:       true,
		Dismissible:    true,
	})
	if err != nil {
		t.Fatalf("create p2: %v", err)
	}

	// 2. Vérifier que la plus haute priorité sort en premier
	active, err := svc.GetActivePlacementForSlot(ctx, slot, "", now)
	if err != nil {
		t.Fatalf("get active: %v", err)
	}
	if active == nil || active.ID != p2.ID {
		t.Fatalf("attendu %s, reçu %+v", p2.ID, active)
	}

	// 3. Simuler l'acquittement de p2 par l'utilisateur user_42
	testUser := "user_42"
	if err := svc.DismissPlacement(ctx, p2.ID, testUser, now); err != nil {
		t.Fatalf("dismiss p2: %v", err)
	}

	// 4. Pour user_42, p2 doit maintenant être ignoré et p1 doit prendre le relais
	activeForUser, err := svc.GetActivePlacementForSlot(ctx, slot, testUser, now)
	if err != nil {
		t.Fatalf("get active for user: %v", err)
	}
	if activeForUser == nil || activeForUser.ID != p1.ID {
		t.Fatalf("attendu fallback sur p1 (%s), reçu %+v", p1.ID, activeForUser)
	}

	// 5. Nettoyage
	_ = svc.DeletePlacement(ctx, p1.ID)
	_ = svc.DeletePlacement(ctx, p2.ID)
}
