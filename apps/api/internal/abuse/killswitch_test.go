package abuse

// Coupe-feu inscriptions (fiche 06 §10) : la clé lue doit être celle que la
// console affiche (parité avec le registre flags), et l'effet doit être
// immédiat (pas de cache).

import (
	"context"
	"testing"

	"github.com/qoefi/api/internal/flags"
)

func TestSignupKillFlagParity(t *testing.T) {
	// flags n'importe pas abuse : l'import n'existe que dans ce test, aucun
	// cycle à l'exécution. Si quelqu'un renomme la clé d'un côté, ce test
	// casse avant que la console et le coupe-feu divergent.
	if SignupKillFlag != flags.AbuseSignupKill {
		t.Fatalf("divergence coupe-feu/registre : %q vs %q", SignupKillFlag, flags.AbuseSignupKill)
	}
}

func TestSignupKillEngaged_NilPool_Open(t *testing.T) {
	if SignupKillEngaged(context.Background(), nil) {
		t.Fatal("pool nil : coupe-feu désengagé attendu")
	}
}

func TestSignupKillEngaged_FlagFlip(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	// État initial : clé absente → désengagé (défaut false du registre).
	if SignupKillEngaged(ctx, poolTest) {
		t.Fatal("clé absente : désengagé attendu")
	}
	setKill := func(on bool) {
		t.Helper()
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "feature_flags" ("key", "is_enabled") VALUES ($1, $2)
			 ON CONFLICT ("key") DO UPDATE SET "is_enabled" = EXCLUDED."is_enabled"`,
			SignupKillFlag, on); err != nil {
			t.Fatalf("bascule flag : %v", err)
		}
	}
	setKill(true)
	if !SignupKillEngaged(ctx, poolTest) {
		t.Fatal("flag true : engagé attendu (effet immédiat, sans cache)")
	}
	setKill(false)
	if SignupKillEngaged(ctx, poolTest) {
		t.Fatal("flag false : désengagé attendu")
	}
}
