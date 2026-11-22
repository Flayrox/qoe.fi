package adminauthz

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
)

// flakyExecer échoue sur certaines lignes et compte les tentatives.
type flakyExecer struct {
	failOn map[int]bool
	calls  int
}

func (f *flakyExecer) Exec(_ context.Context, _ string, _ ...any) (pgconn.CommandTag, error) {
	f.calls++
	if f.failOn[f.calls] {
		return pgconn.CommandTag{}, errors.New("base indisponible")
	}
	return pgconn.CommandTag{}, nil
}

// TestRecorderFlushContinueApresErreur : une ligne en échec n'abandonne plus le
// reste du lot, et chaque perte est comptée (l'ancien `return` stoppait le lot
// et laissait Dropped à 0).
func TestRecorderFlushContinueApresErreur(t *testing.T) {
	db := &flakyExecer{failOn: map[int]bool{1: true}}
	r := &Recorder{db: db}
	batch := []DecisionRecord{
		{Capability: "console.view", Method: "GET", Path: "/admin"},
		{Capability: "console.view", Method: "GET", Path: "/admin/users"},
		{Capability: "console.view", Method: "GET", Path: "/admin/roles"},
	}
	r.flush(batch)

	if db.calls != len(batch) {
		t.Fatalf("tentatives = %d, attendu %d (le lot doit continuer après une erreur)", db.calls, len(batch))
	}
	if got := r.Written(); got != int64(len(batch)-1) {
		t.Errorf("Written = %d, attendu %d", got, len(batch)-1)
	}
	if got := r.Dropped(); got != 1 {
		t.Errorf("Dropped = %d, attendu 1", got)
	}
}

// TestRecorderFlushToutEchoue : toutes les décisions perdues sont comptées.
func TestRecorderFlushToutEchoue(t *testing.T) {
	db := &flakyExecer{failOn: map[int]bool{1: true, 2: true, 3: true}}
	r := &Recorder{db: db}
	r.flush([]DecisionRecord{
		{Capability: "a"}, {Capability: "b"}, {Capability: "c"},
	})
	if got := r.Dropped(); got != 3 {
		t.Errorf("Dropped = %d, attendu 3", got)
	}
	if got := r.Written(); got != 0 {
		t.Errorf("Written = %d, attendu 0", got)
	}
}
