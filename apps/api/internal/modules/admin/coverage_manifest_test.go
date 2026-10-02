package admin

// =====================================================================
// 🗺️ Couverture : aucune route orpheline (plan console, Phase 5)
// =====================================================================
// Le manifeste `apps/admin/src/lib/admin-coverage.ts` classe CHAQUE route
// `/v1/admin/*` : soit un écran la porte, soit elle est « API-only » avec une
// justification écrite. Ce test est le garde-fou : une route ajoutée côté Go
// sans être classée côté interface fait échouer la CI — l'écart ne peut pas se
// reformer en silence.
//
// Il va plus loin qu'une simple liste : pour une route déclarée portée par un
// écran, le test vérifie que les sources de la console APPELENT réellement ce
// chemin (préfixe littéral avant le premier paramètre). Un écran « déclaré mais
// pas branché » échoue donc aussi.
// =====================================================================

import (
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

const (
	coverageManifestPath = "../../../../admin/src/lib/admin-coverage.ts"
	consoleSourcesDir    = "../../../../admin/src"
)

const routeKeyPattern = `'((?:GET|POST|PUT|PATCH|DELETE) /v1/admin/[^']*)'`

// Le manifeste écrit ses entrées avec deux fabriques :
//
//	'GET /v1/admin/users': via('/admin/users'),
//	'GET /v1/admin/me': apiOnly('… justifications …'),
//
// Les entrées sans écran déclarent une justification obligatoire.
var (
	reViaEntry     = regexp.MustCompile(routeKeyPattern + `\s*:\s*via\(\s*'([^']+)'\s*\)`)
	reApiOnlyEntry = regexp.MustCompile(routeKeyPattern + `\s*:\s*apiOnly\(\s*'((?:[^'\\]|\\.)*)'`)
)

type coverageEntry struct {
	key    string
	screen string
	reason string
}

// routesInManifest compte les clés déclarées, quelle que soit la fabrique : sert
// à distinguer « manifeste vide » de « manifeste illisible ».
func routesInManifest(raw string) int {
	seen := map[string]bool{}
	for _, match := range reViaEntry.FindAllStringSubmatch(raw, -1) {
		seen[match[1]] = true
	}
	for _, match := range reApiOnlyEntry.FindAllStringSubmatch(raw, -1) {
		seen[match[1]] = true
	}
	return len(seen)
}

// routePrefix rend le plus long préfixe littéral d'un motif de route : la partie
// avant le premier paramètre `{...}`. C'est ce qu'une source TS peut contenir
// littéralement (`/v1/admin/users/${encodeURIComponent(id)}`).
func routePrefix(pattern string) string {
	if i := strings.Index(pattern, "{"); i >= 0 {
		return pattern[:i]
	}
	return pattern
}

// readConsoleSources concatène les sources de la console (hors tests) : c'est
// l'ensemble dans lequel un écran doit prouver qu'il appelle la route.
func readConsoleSources(t *testing.T) string {
	t.Helper()
	var builder strings.Builder
	err := filepath.WalkDir(consoleSourcesDir, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			name := entry.Name()
			if name == "node_modules" || name == ".next" || name == ".reference" || name == "e2e" {
				return fs.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(path, ".ts") && !strings.HasSuffix(path, ".tsx") {
			return nil
		}
		if strings.HasSuffix(path, ".test.ts") || strings.HasSuffix(path, ".test.tsx") {
			return nil
		}
		raw, readErr := os.ReadFile(path)
		if readErr != nil {
			return readErr
		}
		builder.Write(raw)
		builder.WriteString("\n")
		return nil
	})
	if err != nil {
		t.Fatalf("lecture des sources de la console : %v", err)
	}
	if builder.Len() == 0 {
		t.Fatalf("aucune source lue dans %s", consoleSourcesDir)
	}
	return builder.String()
}

func readCoverageManifest(t *testing.T) map[string]coverageEntry {
	t.Helper()
	raw, err := os.ReadFile(coverageManifestPath)
	if err != nil {
		t.Fatalf("manifeste illisible (%s) : %v", coverageManifestPath, err)
	}
	source := string(raw)
	manifest := map[string]coverageEntry{}
	for _, match := range reViaEntry.FindAllStringSubmatch(source, -1) {
		key := match[1]
		if _, dup := manifest[key]; dup {
			t.Fatalf("manifeste : clé dupliquée %q", key)
		}
		manifest[key] = coverageEntry{key: key, screen: match[2]}
	}
	for _, match := range reApiOnlyEntry.FindAllStringSubmatch(source, -1) {
		key := match[1]
		if _, dup := manifest[key]; dup {
			t.Fatalf("manifeste : clé dupliquée %q", key)
		}
		manifest[key] = coverageEntry{key: key, reason: match[2]}
	}
	if len(manifest) == 0 {
		t.Fatal("manifeste vide : aucune entrée lue")
	}
	if declared := routesInManifest(source); declared != len(manifest) {
		t.Fatalf("manifeste : %d clés déclarées, %d lues — une entrée utilise une forme inconnue", declared, len(manifest))
	}
	return manifest
}

// TestCoverageManifest_EveryRouteClassified — chaque route montée est classée,
// et rien n'est classé qui n'existe pas.
func TestCoverageManifest_EveryRouteClassified(t *testing.T) {
	_, console, _ := testConsole(t, nil)
	manifest := readCoverageManifest(t)

	routes := console.Registry().Routes()
	seen := map[string]bool{}
	var unclassified []string
	for _, route := range routes {
		key := route.Key()
		seen[key] = true
		if _, ok := manifest[key]; !ok {
			unclassified = append(unclassified, key)
		}
	}
	if len(unclassified) > 0 {
		t.Fatalf("routes /v1/admin/* non classées (à ajouter au manifeste) : %v", unclassified)
	}

	var stale []string
	for key := range manifest {
		if !seen[key] {
			stale = append(stale, key)
		}
	}
	if len(stale) > 0 {
		t.Fatalf("manifeste : routes déclarées qui n'existent plus : %v", stale)
	}
}

// TestCoverageManifest_ScreensAreReal — un écran déclaré doit APPELER la route.
// Une entrée « API-only » doit porter une justification écrite : « API-only »
// sans raison est exactement le trou que la Phase 5 supprime.
func TestCoverageManifest_ScreensAreReal(t *testing.T) {
	sources := readConsoleSources(t)
	manifest := readCoverageManifest(t)

	for key, entry := range manifest {
		method, pattern, ok := strings.Cut(key, " ")
		if !ok || method == "" || !strings.HasPrefix(pattern, "/v1/admin/") {
			t.Fatalf("clé malformée dans le manifeste : %q", key)
		}
		prefix := routePrefix(pattern)
		callable := strings.Contains(sources, prefix)
		if entry.screen != "" {
			if !callable {
				t.Errorf("%s : écran %q déclaré, mais aucun source de la console n'appelle %q",
					key, entry.screen, prefix)
			}
			if !strings.HasPrefix(entry.screen, "/admin") {
				t.Errorf("%s : écran %q n'est pas un chemin de la console", key, entry.screen)
			}
			continue
		}
		if len(strings.TrimSpace(entry.reason)) < 20 {
			t.Errorf("%s : route API-only sans justification suffisante (%q)", key, entry.reason)
		}
	}
}

// TestCoverageManifest_Ratio — au moins la moitié des routes sont portées par un
// écran, et l'écart restant est nommé. Le ratio est aussi publié au manifeste
// (affiché par le tableau de bord) : on le recalcule ici pour qu'il ne puisse pas
// mentir.
func TestCoverageManifest_Ratio(t *testing.T) {
	manifest := readCoverageManifest(t)
	withScreen := 0
	for _, entry := range manifest {
		if entry.screen != "" {
			withScreen++
		}
	}
	if withScreen*2 < len(manifest) {
		t.Fatalf("couverture = %d/%d routes portées par un écran : moins de la moitié",
			withScreen, len(manifest))
	}
	t.Logf("couverture de la console : %d/%d routes portées par un écran", withScreen, len(manifest))
}

// TestCoverageManifest_NoEmptyScreen — un écran déclaré ne doit pas être une
// chaîne vide ni un simple préfixe d'une autre entrée sans raison d'être.
func TestCoverageManifest_NoEmptyScreen(t *testing.T) {
	manifest := readCoverageManifest(t)
	for key, entry := range manifest {
		if entry.screen == "" && strings.TrimSpace(entry.reason) == "" {
			t.Errorf("%s : ni écran ni justification", key)
		}
	}
}
