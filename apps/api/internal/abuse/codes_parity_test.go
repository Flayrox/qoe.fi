package abuse

// Parité Go↔TS (lot 4) : les vocabulaires fermés sont générés vers
// packages/sdk/src/abuse-codes.generated.ts (go run ./cmd/abuse-codes).
// Ce test casse si un code est ajouté côté Go sans régénérer — la dérive
// silencieuse est interdite dans les deux sens (l'autre sens est couvert
// par tsc : les maps Record<Union> exigent l'exhaustivité).

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func generatedTS(t *testing.T) string {
	t.Helper()
	// Chemin stable : les tests Go s'exécutent dans le répertoire du paquet.
	path := filepath.Join("..", "..", "..", "..", "packages", "sdk", "src", "abuse-codes.generated.ts")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("fichier généré illisible (%s) : %v — régénérer via go run ./cmd/abuse-codes", path, err)
	}
	return string(raw)
}

func TestGeneratedTS_CoversVocabularies(t *testing.T) {
	// Normalisation des guillemets : prettier (hook pre-commit) reformate
	// en simples — le test vérifie les VALEURS, pas le style (le style est
	// l'affaire de prettier, vérifiée par format:check).
	raw := strings.ReplaceAll(generatedTS(t), "'", `"`)
	lists := map[string][]string{
		"AbuseDecision":       Decisions(),
		"AbuseReasonCode":     ReasonCodes(),
		"AbuseIncidentKind":   IncidentKinds(),
		"AbuseIncidentStatus": IncidentStatuses(),
		"AbuseAppealStatus":   AppealStatuses(),
		"AbuseAppealOutcome":  AppealOutcomes(),
	}
	for typeName, values := range lists {
		if !strings.Contains(raw, "export type "+typeName+" =") {
			t.Errorf("type %s manquant du généré — régénérer", typeName)
		}
		for _, v := range values {
			if !strings.Contains(raw, `"`+v+`"`) {
				t.Errorf("code %q (%s) absent du généré — go run ./cmd/abuse-codes", v, typeName)
			}
		}
	}
}
