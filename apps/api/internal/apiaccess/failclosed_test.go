package apiaccess

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"
)

type rowResult struct {
	raw string
	err error
}

func (r rowResult) Scan(dest ...any) error {
	if r.err != nil {
		return r.err
	}
	if len(dest) > 0 {
		if target, ok := dest[0].(*string); ok {
			*target = r.raw
		}
	}
	return nil
}

type fixedQuerier struct{ row pgx.Row }

func (q fixedQuerier) QueryRow(context.Context, string, ...any) pgx.Row { return q.row }

// TestLoadEnabledFailClosed fige la règle : config absente → tout accordable ;
// config présente mais illisible ou vide → rien d'accordable (avant le
// correctif, un JSON tronqué rouvrait tous les modules).
func TestLoadEnabledFailClosed(t *testing.T) {
	ctx := context.Background()
	cases := []struct {
		name string
		row  rowResult
		want int
	}{
		{"config absente", rowResult{err: pgx.ErrNoRows}, len(ModuleKeys())},
		{"JSON tronqué", rowResult{raw: `["api:read"`}, 0},
		{"JSON d'un autre type", rowResult{raw: `{"modules":[]}`}, 0},
		{"liste vide explicite", rowResult{raw: `[]`}, 0},
		{"liste partielle", rowResult{raw: `["webhooks"]`}, 1},
	}
	for _, tc := range cases {
		got, err := LoadEnabled(ctx, fixedQuerier{row: tc.row})
		if err != nil {
			t.Fatalf("%s : erreur inattendue %v", tc.name, err)
		}
		if len(got) != tc.want {
			t.Errorf("%s : %d modules, attendu %d (%v)", tc.name, len(got), tc.want, got)
		}
	}
}

// TestIsEnabledFailClosed : une lecture impossible ferme le module.
func TestIsEnabledFailClosed(t *testing.T) {
	ctx := context.Background()
	broken := fixedQuerier{row: rowResult{err: errors.New("base indisponible")}}
	if IsEnabled(ctx, broken, ModuleWebhooks) {
		t.Fatal("une erreur de lecture doit fermer le module (fail-closed)")
	}
	partial := fixedQuerier{row: rowResult{raw: `["webhooks"]`}}
	if !IsEnabled(ctx, partial, ModuleWebhooks) {
		t.Fatal("module listé doit être ouvert")
	}
	if IsEnabled(ctx, partial, ModuleOAuth) {
		t.Fatal("module non listé doit être fermé")
	}
}
