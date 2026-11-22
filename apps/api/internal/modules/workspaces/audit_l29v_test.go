package workspaces

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/middleware"
)

// unreachablePool crée un pool pointé sur un port fermé : aucune connexion
// possible, sans dépendre de Docker.
func unreachablePool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, "postgres://qoe:qoe@127.0.0.1:1/qoe?connect_timeout=1")
	if err != nil {
		t.Fatalf("pool: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

// TestAuditL29V_DatabaseOutageIsNotAPersonalWorkspace : une base injoignable
// renvoyait un workspace PERSONAL avec *toutes* les permissions et aucune
// erreur. Le studio affichait alors un espace de travail complet au lieu
// d'une panne.
func TestAuditL29V_DatabaseOutageIsNotAPersonalWorkspace(t *testing.T) {
	svc := NewService(unreachablePool(t))
	ws, err := svc.GetActive(context.Background(), "00000000-0000-0000-0000-0000000000aa", "media_001")
	if err == nil {
		t.Fatalf("base injoignable → workspace %q avec %d permissions et err = nil",
			ws.Type, len(ws.Permissions))
	}
}

// TestAuditL29V_HandlerReportsOutage : la route doit répondre 500, pas 200
// avec un workspace fabriqué.
func TestAuditL29V_HandlerReportsOutage(t *testing.T) {
	h := NewHandler(NewService(unreachablePool(t)))
	r := chi.NewRouter()
	h.Register(r)

	req := httptest.NewRequest(http.MethodGet, "/v1/workspaces/active?mediaId=media_001", nil)
	req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey,
		"00000000-0000-0000-0000-0000000000aa"))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("base injoignable → %d (%s), attendu 500", w.Code, strings.TrimSpace(w.Body.String()))
	}
}
