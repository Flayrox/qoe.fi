package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/observability"
	"github.com/qoefi/api/internal/response"
)

// F773 — `normalizeMetricRouteGroup` découpe le PREMIER segment après `/v1/`
// en label Prometheus. Un chemin inconnu (`/v1/<nimporte-quoi>`) crée donc une
// série de métriques par valeur : un client qui balaie `/v1/a1`, `/v1/a2`, …
// fait croître la `sync.Map` et le rendu Prometheus sans borne (fuite mémoire
// sur le chemin de requête, avant même l'authentification).
func TestAuditL34_MetricRouteGroupStaysBounded(t *testing.T) {
	router := chi.NewRouter()
	router.Use(httpMetricsMiddleware())
	router.Handle("/*", http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		response.NotFound(w, "route inconnue")
	}))

	paths := []string{"/v1/scan-" + strings.Repeat("a", 8), "/v1/scan-" + strings.Repeat("b", 8)}
	for _, p := range paths {
		router.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, p, nil))
	}

	render := observability.Default().Render()
	for _, p := range paths {
		if strings.Contains(render, `route_group="`+p+`"`) {
			t.Errorf("chemin non routé promu en label de métrique : %s", p)
		}
	}
}
