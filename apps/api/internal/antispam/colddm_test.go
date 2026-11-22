package antispam

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/qoefi/api/internal/trust"
	"github.com/redis/go-redis/v9"
)

// scriptRecorder est un double de `*redis.Client` limité à Eval : il enregistre
// chaque script émis. Le chemin cold-DM doit produire UN SEUL appel.
type scriptRecorder struct {
	calls  int
	script string
	keys   []string
	args   []interface{}
	result int64
	err    error
}

func (r *scriptRecorder) Eval(_ context.Context, script string, keys []string, args ...interface{}) *redis.Cmd {
	r.calls++
	r.script = script
	r.keys = keys
	r.args = args
	cmd := redis.NewCmd(context.Background())
	if r.err != nil {
		cmd.SetErr(r.err)
		return cmd
	}
	cmd.SetVal(r.result)
	return cmd
}

// TestColdDMUnSeulScriptAtomique : le plafond passe par un script Lua unique
// portant les quatre opérations. Une séquence SCARD puis SADD séparée ne
// compilerait même plus (l'interface n'expose que Eval), ce test vérifie en plus
// la commande réellement émise et ses arguments.
func TestColdDMUnSeulScriptAtomique(t *testing.T) {
	rec := &scriptRecorder{result: 1}
	err := CheckColdDM(context.Background(), "sender-1", "recipient-1", false, trust.TierStandard, rec)
	if err != nil {
		t.Fatalf("sous le plafond : %v", err)
	}
	if rec.calls != 1 {
		t.Fatalf("appels Redis = %d, attendu 1 (script atomique unique)", rec.calls)
	}
	for _, op := range []string{"SISMEMBER", "SCARD", "SADD", "EXPIRE"} {
		if !strings.Contains(rec.script, op) {
			t.Errorf("script émis sans %s :\n%s", op, rec.script)
		}
	}
	if len(rec.keys) != 1 || !strings.HasPrefix(rec.keys[0], "sec:dm:cold:sender-1:") {
		t.Fatalf("clés = %v, attendu une clé sec:dm:cold:sender-1:<jour>", rec.keys)
	}
	if len(rec.args) != 3 {
		t.Fatalf("args = %v, attendu (destinataire, plafond, ttl)", rec.args)
	}
	if rec.args[0] != "recipient-1" {
		t.Errorf("destinataire émis = %v", rec.args[0])
	}
	if rec.args[1] != coldDMLimitForTier(trust.TierStandard) {
		t.Errorf("plafond émis = %v, attendu %d", rec.args[1], coldDMLimitForTier(trust.TierStandard))
	}
}

// TestColdDMPlaid atteint : le script répond -1 → refus avec le code de cooldown.
func TestColdDMPlafondAtteint(t *testing.T) {
	rec := &scriptRecorder{result: -1}
	err := CheckColdDM(context.Background(), "sender-2", "recipient-2", false, trust.TierLow, rec)
	if err == nil {
		t.Fatal("au plafond, un refus est attendu")
	}
	var tooMany *RejectionError
	if !errors.As(err, &tooMany) {
		t.Fatalf("erreur = %T (%v), attendu un refus de quota", err, err)
	}
	if tooMany.Code != CodeWriteCooldown {
		t.Errorf("code = %q, attendu %q", tooMany.Code, CodeWriteCooldown)
	}
	if tooMany.HTTPStatus != 429 {
		t.Errorf("status = %d, attendu 429", tooMany.HTTPStatus)
	}
	if rec.calls != 1 {
		t.Errorf("appels = %d, attendu 1 même en refus", rec.calls)
	}
}

// TestColdDMDestinataireDejaCompte : le script répond 0 → autorisé sans erreur.
func TestColdDMDestinataireDejaCompte(t *testing.T) {
	rec := &scriptRecorder{result: 0}
	if err := CheckColdDM(context.Background(), "sender-3", "recipient-3", false, trust.TierTrusted, rec); err != nil {
		t.Fatalf("destinataire déjà compté : %v", err)
	}
}

// TestColdDMFailOpen : client absent ou en erreur → l'envoi n'est pas bloqué
// (comportement historique), et aucun appel séparé n'est tenté.
func TestColdDMFailOpen(t *testing.T) {
	if err := CheckColdDM(context.Background(), "s", "r", false, trust.TierStandard, nil); err != nil {
		t.Fatalf("client nil doit être toléré : %v", err)
	}
	rec := &scriptRecorder{err: errors.New("redis indisponible")}
	if err := CheckColdDM(context.Background(), "s", "r", false, trust.TierStandard, rec); err != nil {
		t.Fatalf("Redis en panne doit rester fail-open : %v", err)
	}
	if rec.calls != 1 {
		t.Errorf("appels = %d, attendu 1", rec.calls)
	}
}

// TestColdDMFollowerIgnore : un abonné ne consomme pas de quota et n'appelle
// jamais Redis.
func TestColdDMFollowerIgnore(t *testing.T) {
	rec := &scriptRecorder{result: 1}
	if err := CheckColdDM(context.Background(), "s", "r", true, trust.TierStandard, rec); err != nil {
		t.Fatalf("abonné : %v", err)
	}
	if rec.calls != 0 {
		t.Fatalf("appels = %d, attendu 0 pour un abonné", rec.calls)
	}
}

// TestGuardColdDMNilClientSansPanic : le Guard avec client nil ne doit pas
// passer un pointeur typé nil dans l'interface (panic).
func TestGuardColdDMNilClientSansPanic(t *testing.T) {
	g := &Guard{}
	if err := g.CheckColdDM(context.Background(), "s", "r", false, trust.TierStandard); err != nil {
		t.Fatalf("guard sans Redis : %v", err)
	}
}
