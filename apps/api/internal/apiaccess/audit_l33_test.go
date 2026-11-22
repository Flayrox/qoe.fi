package apiaccess

// Audit L33 — rouge de reproduction (exécuté à f51e63e0 avant correctif).

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5"
)

// keyedQuerier rend une ligne différente par clé SystemConfig lue.
type keyedQuerier struct{ byKey map[string]rowResult }

func (q keyedQuerier) QueryRow(_ context.Context, _ string, args ...any) pgx.Row {
	key, _ := args[0].(string)
	if row, ok := q.byKey[key]; ok {
		return row
	}
	return rowResult{err: pgx.ErrNoRows}
}

// `API_ACCESS_DISABLED` illisible (autre chose que true/false) était lu comme
// « API ouverte » : une valeur corrompue rouvrait l'API que l'admin croyait
// avoir coupée. `LoadEnabled` ferme dans ce cas ; le coupe-feu général doit
// suivre la même doctrine.
func TestAuditL33_CorruptKillSwitchIsAnError(t *testing.T) {
	q := keyedQuerier{byKey: map[string]rowResult{
		AccessDisabledKey: {raw: "yes please"},
	}}
	if _, err := LoadAccessControl(context.Background(), q); err == nil {
		t.Fatal("valeur de coupure illisible acceptée en silence : l'API reste ouverte")
	}
}

// Une liste d'endpoints tronquée était ignorée sans erreur : les endpoints que
// l'admin avait coupés redevenaient joignables, et rien ne le signalait.
func TestAuditL33_CorruptEndpointListIsAnError(t *testing.T) {
	q := keyedQuerier{byKey: map[string]rowResult{
		DisabledEndpointsKey: {raw: `["/v1/articles"`},
	}}
	cfg, err := LoadAccessControl(context.Background(), q)
	if err == nil {
		t.Fatalf("liste tronquée ignorée : coupure d'endpoints perdue (cfg=%+v)", cfg.DisabledEndpoints)
	}
}
