// Commande abuse-codes (lot 4) : génère les unions TypeScript des
// vocabulaires fermés anti-abus + support, depuis les constantes Go
// (source unique — jamais l'inverse).
//
// Usage : go run ./cmd/abuse-codes > ../../packages/sdk/src/abuse-codes.generated.ts
// (depuis apps/api). Les maps TS de libellés se typent Record<Union, string> :
// un code ajouté côté Go sans régénération casse tsc (clé manquante), une
// faute de frappe casse aussi — jamais de dérive silencieuse Go↔TS.
// Les codes humains (human:<…>) sont un pattern, pas une énumération.
package main

import (
	"fmt"
	"os"
	"sort"
	"strings"

	"github.com/qoefi/api/internal/abuse"
	"github.com/qoefi/api/internal/support"
)

func union(name string, values []string) string {
	sorted := append([]string{}, values...)
	sort.Strings(sorted)
	quoted := make([]string, len(sorted))
	for i, v := range sorted {
		quoted[i] = fmt.Sprintf("'%s'", v)
	}
	// Format EXACT de prettier (vérifié --check) : union multi-lignes,
	// indentée de 2 espaces, `|` en tête — le généré est idempotent au
	// commit, sans diff parasite de reformatage.
	return fmt.Sprintf("export type %s =\n  | %s;", name, strings.Join(quoted, "\n  | "))
}

func main() {
	type section struct {
		name   string
		values []string
	}
	sections := []section{
		{"AbuseDecision", abuse.Decisions()},
		{"AbuseReasonCode", abuse.ReasonCodes()},
		{"AbuseIncidentKind", abuse.IncidentKinds()},
		{"AbuseIncidentStatus", abuse.IncidentStatuses()},
		{"AbuseAppealStatus", abuse.AppealStatuses()},
		{"AbuseAppealOutcome", abuse.AppealOutcomes()},
		{"SupportKind", support.Kinds()},
		{"SupportStatus", support.Statuses()},
	}
	var b strings.Builder
	b.WriteString("// =====================================================================\n")
	b.WriteString("// ⚠️ GÉNÉRÉ — ne pas éditer (lot 4). Source : constantes Go\n")
	b.WriteString("// (abuse.Decisions/ReasonCodes/IncidentKinds/... + support.Kinds/Statuses).\n")
	b.WriteString("// Régénérer : depuis apps/api,\n")
	b.WriteString("//   go run ./cmd/abuse-codes > ../../packages/sdk/src/abuse-codes.generated.ts\n")
	b.WriteString("// Les maps de libellés se typent Record<Union, string> : tout écart\n")
	b.WriteString("// Go↔TS casse tsc au lieu de diverger silencieusement.\n")
	b.WriteString("// =====================================================================\n\n")
	for i, s := range sections {
		if i > 0 {
			b.WriteString("\n")
		}
		b.WriteString(union(s.name, s.values))
		b.WriteString("\n")
	}
	if _, err := os.Stdout.WriteString(b.String()); err != nil {
		panic(err)
	}
}
