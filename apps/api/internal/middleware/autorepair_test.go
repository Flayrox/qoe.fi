package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// handler404 renvoie un 404 « Utilisateur introuvable » (le crash du login démo).
func handler404(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusNotFound)
	_, _ = w.Write([]byte(`{"error":"Utilisateur introuvable"}`))
}

func handlerOK(w http.ResponseWriter, _ *http.Request) {
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"ok":true}`))
}

// authedCtx injecte un sub + claims dans le contexte (comme CombinedAuth le fait).
func authedCtx(req *http.Request) *http.Request {
	ctx := context.WithValue(req.Context(), UserIDKey, "00000000-0000-0000-0000-000000000001")
	ctx = context.WithValue(ctx, ClaimsKey, map[string]any{"email": "reader@test.dev"})
	return req.WithContext(ctx)
}

func TestAutoRepairReaderUser_404ThenRepair(t *testing.T) {
	// Première requête (ligne absente) → handler 404 ; après réparation (created=true),
	// le handler rejoué retourne 200.
	calls := 0
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if calls == 1 {
			handler404(w, r)
			return
		}
		handlerOK(w, r)
	})

	repair := func(_ context.Context, _ string, _ map[string]any) (bool, error) {
		return true, nil // ligne créée
	}

	h := AutoRepairReaderUser(repair)(handler)
	req := httptest.NewRequest(http.MethodGet, "/v1/me", nil)
	req = authedCtx(req)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("code = %d, attendu 200 (après réparation), body = %s", w.Code, w.Body.String())
	}
	if calls != 2 {
		t.Fatalf("handler appelé %d fois, attendu 2 (404 puis rejoué)", calls)
	}
}

func TestAutoRepairReaderUser_NoRepairOn200(t *testing.T) {
	calls := 0
	handler := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls++
		handlerOK(w, nil)
	})
	repaired := false
	repair := func(_ context.Context, _ string, _ map[string]any) (bool, error) {
		repaired = true
		return true, nil
	}

	h := AutoRepairReaderUser(repair)(handler)
	req := httptest.NewRequest(http.MethodGet, "/v1/me", nil)
	req = authedCtx(req)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusOK || calls != 1 {
		t.Fatalf("code = %d, calls = %d, attendu 200/1", w.Code, calls)
	}
	if repaired {
		t.Fatalf("repair appelé sur une réponse 200 (ne doit pas l'être)")
	}
}

func TestAutoRepairReaderUser_404NoCreateKeeps404(t *testing.T) {
	const body = `{"error":"Utilisateur introuvable"}`
	handler := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(body))
	})
	repair := func(_ context.Context, _ string, _ map[string]any) (bool, error) {
		return false, nil // ligne non créée (404 pour une autre raison)
	}

	h := AutoRepairReaderUser(repair)(handler)
	req := httptest.NewRequest(http.MethodGet, "/v1/things", nil)
	req = authedCtx(req)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("code = %d, attendu 404 (aucune réparation)", w.Code)
	}
	var got map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &got)
	if got["error"] != "Utilisateur introuvable" {
		t.Fatalf("body = %s", w.Body.String())
	}
}

func TestAutoRepairReaderUser_AnonPassesThrough(t *testing.T) {
	calls := 0
	handler := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls++
		handler404(w, nil)
	})
	repair := func(context.Context, string, map[string]any) (bool, error) {
		t.Fatal("repair ne doit pas être appelé sans sub")
		return false, nil
	}

	h := AutoRepairReaderUser(repair)(handler)
	req := httptest.NewRequest(http.MethodGet, "/v1/me", nil) // pas de contexte auth
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound || calls != 1 {
		t.Fatalf("code = %d, calls = %d, attendu 404/1", w.Code, calls)
	}
}
