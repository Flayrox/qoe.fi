package shortcode

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"
)

type errRow struct{}

func (errRow) Scan(...any) error { return errors.New("db injoignable") }

// failingQuerier compte les requêtes émises et échoue toujours.
type failingQuerier struct{ calls int }

func (q *failingQuerier) QueryRow(context.Context, string, ...any) pgx.Row {
	q.calls++
	return errRow{}
}

// existsQuerier répond « le code existe déjà » (collision réelle).
type existsQuerier struct{ calls int }

func (q *existsQuerier) QueryRow(context.Context, string, ...any) pgx.Row {
	q.calls++
	return boolRow{true}
}

type boolRow struct{ v bool }

func (r boolRow) Scan(dest ...any) error {
	if p, ok := dest[0].(*bool); ok {
		*p = r.v
	}
	return nil
}

// F774 — `Generate` traite une erreur de requête comme une collision : il
// retente jusqu'à `attempts` fois avant de rendre un code non vérifié. Sur une
// base lente ou coupée, une création d'article émet donc 20 requêtes
// séquentielles (10 s de `statement_timeout` chacune) avant d'échouer à
// l'INSERT — 20 appels inutiles sur le chemin de la requête.
func TestAuditL34_GenerateStopsOnDBError(t *testing.T) {
	q := &failingQuerier{}
	code := Generate(context.Background(), q)
	if code == "" {
		t.Fatal("Generate doit toujours rendre un code court")
	}
	if q.calls > 1 {
		t.Errorf("Generate a émis %d requêtes alors que la base est en erreur (attendu 1)", q.calls)
	}
}

// Une collision réelle, elle, doit bien être retentée.
func TestAuditL34_GenerateRetriesOnCollision(t *testing.T) {
	q := &existsQuerier{}
	_ = Generate(context.Background(), q)
	if q.calls != attempts {
		t.Errorf("collision : %d tentatives, attendu %d", q.calls, attempts)
	}
}
