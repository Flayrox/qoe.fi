package abuse

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// fakeBudget imite le comportement de ConsumeBudget (UPSERT conditionnel :
// 0 ligne = plafond) et de RefundBudget (GREATEST(consumed - n, 0)).
type fakeBudget struct {
	consumed map[string]int
}

func newFakeBudget() *fakeBudget { return &fakeBudget{consumed: map[string]int{}} }

type fakeRow struct {
	f       *fakeBudget
	scopeID string
	cap     int
	n       int
}

func (r fakeRow) Scan(dest ...any) error {
	cur := r.f.consumed[r.scopeID]
	if cur+r.n > r.cap {
		return pgx.ErrNoRows // plafond atteint : pas une erreur, un refus
	}
	r.f.consumed[r.scopeID] = cur + r.n
	if len(dest) == 1 {
		if p, ok := dest[0].(*bool); ok {
			*p = true
		}
	}
	return nil
}

func (f *fakeBudget) QueryRow(_ context.Context, sql string, args ...any) pgx.Row {
	_ = sql
	return fakeRow{f: f, scopeID: args[1].(string), cap: args[4].(int), n: args[5].(int)}
}

func (f *fakeBudget) Exec(_ context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	if strings.Contains(sql, "GREATEST") {
		key := args[1].(string)
		n := args[4].(int)
		f.consumed[key] -= n
		if f.consumed[key] < 0 {
			f.consumed[key] = 0
		}
	}
	return pgconn.CommandTag{}, nil
}

// Quand le plafond de la publication est atteint, aucun e-mail ne part — mais
// le budget par (adresse, publication) du demandeur était déjà consommé : un
// lecteur légitime perd une de ses 3 demandes du jour pour un envoi qui n'a
// jamais eu lieu (et le plafond, lui, n'est pas près de se libérer).
func TestConfirmAllowed_RembourseLeBudgetDejaConsomme(t *testing.T) {
	f := newFakeBudget()
	email, publisher := "lecteur@example.com", "pub_1"
	emailScope := email + "|" + publisher
	f.consumed[publisher] = ConfirmCapPerPublisher // plafond publication déjà atteint

	allowed := ConfirmAllowed(context.Background(), f, email, publisher, time.Now())
	if allowed {
		t.Fatal("envoi autorisé alors que le plafond publication est atteint")
	}
	if got := f.consumed[emailScope]; got != 0 {
		t.Fatalf("budget (adresse, publication) = %d, attendu 0 après remboursement", got)
	}
}

// Contre-épreuve : quand tout passe, les deux budgets restent consommés.
func TestConfirmAllowed_ConsommeLesDeuxBudgets(t *testing.T) {
	f := newFakeBudget()
	email, publisher := "ok@example.com", "pub_2"
	if !ConfirmAllowed(context.Background(), f, email, publisher, time.Now()) {
		t.Fatal("envoi refusé alors que les plafonds sont libres")
	}
	if f.consumed[email+"|"+publisher] != 1 || f.consumed[publisher] != 1 {
		t.Fatalf("budgets = %v, attendu 1 et 1", f.consumed)
	}
}
