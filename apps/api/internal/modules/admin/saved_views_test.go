package admin

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/testutil"
)

func TestSavedViewsServiceAndEndpoints(t *testing.T) {
	ctx := context.Background()
	pool := testutil.MustPool(t)

	svc := NewService(pool)

	staffUserA := adminAdminID
	staffUserB := adminReaderID

	t.Run("Save, list and delete saved views", func(t *testing.T) {
		// 1. Sauvegarder une vue personnelle pour User A
		viewA, err := svc.SaveView(ctx, staffUserA, "admin.work", SaveViewInput{
			Name:     "Mes urgences",
			IsShared: false,
			State:    json.RawMessage(`{"sort":{"column":"sla","direction":"ascending"},"facets":{"priority":["urgent"]}}`),
		})
		if err != nil {
			t.Fatalf("SaveView(A, personal) failed: %v", err)
		}
		if viewA.Name != "Mes urgences" || viewA.IsShared != false || !viewA.IsMine {
			t.Errorf("unexpected viewA: %+v", viewA)
		}

		// 2. Sauvegarder une vue partagée pour User A
		viewShared, err := svc.SaveView(ctx, staffUserA, "admin.work", SaveViewInput{
			Name:     "Vue équipe SLA",
			IsShared: true,
			State:    json.RawMessage(`{"sort":{"column":"due","direction":"ascending"},"facets":{"sla":["breached"]}}`),
		})
		if err != nil {
			t.Fatalf("SaveView(A, shared) failed: %v", err)
		}
		if !viewShared.IsShared {
			t.Errorf("expected isShared=true, got %v", viewShared.IsShared)
		}

		// 3. Lister pour User B : doit voir la vue partagée de A, mais PAS la vue personnelle de A
		viewsForB, err := svc.ListSavedViews(ctx, staffUserB, "admin.work")
		if err != nil {
			t.Fatalf("ListSavedViews(B) failed: %v", err)
		}

		hasPersonalA := false
		hasSharedA := false
		for _, v := range viewsForB {
			if v.Name == "Mes urgences" {
				hasPersonalA = true
			}
			if v.Name == "Vue équipe SLA" {
				hasSharedA = true
				if v.IsMine {
					t.Errorf("viewShared should not be marked as IsMine for User B")
				}
			}
		}
		if hasPersonalA {
			t.Errorf("User B should NOT see User A's private view")
		}
		if !hasSharedA {
			t.Errorf("User B should see User A's shared view")
		}

		// 4. Mise à jour de la vue par User A (même nom -> upsert)
		updatedA, err := svc.SaveView(ctx, staffUserA, "admin.work", SaveViewInput{
			Name:     "Mes urgences",
			IsShared: true, // passe en partagée
			State:    json.RawMessage(`{"sort":{"column":"sla","direction":"descending"}}`),
		})
		if err != nil {
			t.Fatalf("UpdateView(A) failed: %v", err)
		}
		if updatedA.ID != viewA.ID {
			t.Errorf("expected upsert with same ID, got %s vs %s", updatedA.ID, viewA.ID)
		}
		if !updatedA.IsShared {
			t.Errorf("expected updated view to be shared")
		}

		// 5. Suppression de la vue par User A
		if err := svc.DeleteSavedView(ctx, staffUserA, "admin.work", viewA.ID, false); err != nil {
			t.Fatalf("DeleteSavedView(A, own) failed: %v", err)
		}

		// Vérification qu'elle n'existe plus
		viewsAfterDelete, err := svc.ListSavedViews(ctx, staffUserA, "admin.work")
		if err != nil {
			t.Fatalf("ListSavedViews after delete failed: %v", err)
		}
		for _, v := range viewsAfterDelete {
			if v.ID == viewA.ID {
				t.Errorf("viewA should have been deleted")
			}
		}

		// 6. Nettoyage de la vue partagée
		if err := svc.DeleteSavedView(ctx, staffUserA, "admin.work", viewShared.ID, false); err != nil {
			t.Fatalf("cleanup viewShared failed: %v", err)
		}
	})

	t.Run("HTTP endpoints route test", func(t *testing.T) {
		h := NewHandler(svc)
		r := chi.NewRouter()
		h.Register(r)

		// GET /v1/admin/views/admin.users
		wGet := do(r, http.MethodGet, "/v1/admin/views/admin.users", staffUserA, "")
		if wGet.Code != http.StatusOK {
			t.Fatalf("GET /views returned %d: %s", wGet.Code, wGet.Body.String())
		}

		// POST /v1/admin/views/admin.users
		body, _ := json.Marshal(SaveViewInput{
			Name:     "Test HTTP View",
			IsShared: false,
			State:    json.RawMessage(`{"sort":{"column":"name"}}`),
		})
		wPost := do(r, http.MethodPost, "/v1/admin/views/admin.users", staffUserA, string(body))
		if wPost.Code != http.StatusOK {
			t.Fatalf("POST /views returned %d: %s", wPost.Code, wPost.Body.String())
		}

		var created SavedViewItem
		if err := json.Unmarshal(wPost.Body.Bytes(), &created); err != nil {
			t.Fatalf("decode created: %v", err)
		}

		// DELETE /v1/admin/views/admin.users/{id}
		wDel := do(r, http.MethodDelete, "/v1/admin/views/admin.users/"+created.ID, staffUserA, "")
		if wDel.Code != http.StatusOK {
			t.Fatalf("DELETE /views returned %d: %s", wDel.Code, wDel.Body.String())
		}
	})
}
