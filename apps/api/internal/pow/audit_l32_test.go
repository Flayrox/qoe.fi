package pow

// Audit L32 — la vérification d'un challenge ne peut pas « réussir » sans
// pouvoir le marquer comme consommé.

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestAuditL32_NoReplayWithoutStore(t *testing.T) {
	const secret = "secret-l32"
	ch, err := GenerateChallenge(secret, 64, time.Minute)
	if err != nil {
		t.Fatalf("GenerateChallenge: %v", err)
	}
	sol := Solution{
		Algorithm: ch.Algorithm,
		Challenge: ch.Challenge,
		Salt:      ch.Salt,
		Number:    solveForTest(t, ch),
		MaxNumber: ch.MaxNumber,
		ExpiresAt: ch.ExpiresAt,
		Signature: ch.Signature,
	}
	token := makeToken(t, sol, true)

	ctx := context.Background()
	// Sans magasin anti-rejeu, un jeton valide serait éternellement rejouable :
	// refus explicite, jamais un succès sans trace de consommation.
	if err := VerifyAndConsume(ctx, nil, secret, token); !errors.Is(err, ErrNoReplayStore) {
		t.Fatalf("ErrNoReplayStore attendu, obtenu %v", err)
	}
	if err := VerifyAndConsume(ctx, nil, secret, token); !errors.Is(err, ErrNoReplayStore) {
		t.Fatalf("ErrNoReplayStore attendu au second appel, obtenu %v", err)
	}
}
