package main

import (
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

var (
	sdkRoutePattern = regexp.MustCompile("['`](\\/v1\\/[^'`?\\s]+)")
	sdkInterpRegexp = regexp.MustCompile(`\$\{[^}]+\}`)
	chiParamRegexp  = regexp.MustCompile(`\{[^}]+\}`)
)

// normalizeRouteSegment remplace tout paramètre dynamique (`{id}` ou `${...}`)
// par `{param}` afin de comparer les routes chi et les appels du SDK TS.
func normalizeRoute(path string) string {
	path = strings.TrimSuffix(path, "${qs}")
	path = strings.TrimSuffix(path, "${queryString}")
	path = sdkInterpRegexp.ReplaceAllString(path, "{param}")
	path = chiParamRegexp.ReplaceAllString(path, "{param}")
	path = strings.TrimRight(path, "/")
	return path
}

func collectChiRoutes(t *testing.T, r *chi.Mux) map[string]bool {
	t.Helper()
	routes := map[string]bool{}
	err := chi.Walk(r, func(_ string, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		norm := normalizeRoute(route)
		if norm != "" {
			routes[norm] = true
		}
		return nil
	})
	if err != nil {
		t.Fatalf("chi.Walk: %v", err)
	}
	return routes
}

func TestRouter_SDKContractParity(t *testing.T) {
	r := newRouter(RouterDeps{})
	routes := collectChiRoutes(t, r)

	// 1. Routes de sécurité, observabilité et sondes indispensables.
	required := []string{
		"/healthz",
		"/health",
		"/livez",
		"/readyz",
		"/metrics",
		"/v1/security/challenge",
		"/v1/admin/security/overview",
		"/v1/admin/security/trust/{param}/recompute",
	}
	for _, want := range required {
		if !routes[want] {
			t.Errorf("route critique manquante sur le routeur Go : %s", want)
		}
	}

	// 2. Parité automatique avec les routes /v1/* déclarées dans packages/sdk/src/client.ts.
	sdkPath := filepath.Join("..", "..", "..", "..", "packages", "sdk", "src", "client.ts")
	raw, err := os.ReadFile(sdkPath)
	if err != nil {
		t.Fatalf("lecture %s: %v", sdkPath, err)
	}

	matches := sdkRoutePattern.FindAllStringSubmatch(string(raw), -1)
	if len(matches) < 20 {
		t.Fatalf("trop peu de routes extraites de client.ts (%d)", len(matches))
	}

	// Routes connues comme alias historiques ou optionnelles dans client.ts si besoin.
	allowList := map[string]bool{}

	for _, m := range matches {
		norm := normalizeRoute(m[1])
		if norm == "" || allowList[norm] {
			continue
		}
		if !routes[norm] {
			t.Errorf("dérive SDK ↔ Go : client.ts appelle %q (normalisé: %q) absent du routeur Go", m[1], norm)
		}
	}
}
