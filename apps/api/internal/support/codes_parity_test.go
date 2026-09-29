package support

// Parité Go↔TS (lot 4) : miroir du test abuse — les kinds/statuts support
// sont générés dans le même fichier (go run ./cmd/abuse-codes).

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestGeneratedTS_CoversSupport(t *testing.T) {
	path := filepath.Join("..", "..", "..", "..", "packages", "sdk", "src", "abuse-codes.generated.ts")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("fichier généré illisible (%s) : %v", path, err)
	}
	content := string(raw)
	for typeName, values := range map[string][]string{
		"SupportKind":   Kinds(),
		"SupportStatus": Statuses(),
	} {
		if !strings.Contains(content, "export type "+typeName+" =") {
			t.Errorf("type %s manquant du généré — régénérer", typeName)
		}
		for _, v := range values {
			if !strings.Contains(content, `"`+v+`"`) {
				t.Errorf("code %q (%s) absent du généré — go run ./cmd/abuse-codes", v, typeName)
			}
		}
	}
}
