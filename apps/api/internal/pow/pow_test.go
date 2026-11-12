package pow

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strconv"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

func solveForTest(t *testing.T, ch Challenge) int {
	t.Helper()
	for n := 0; n <= ch.MaxNumber; n++ {
		sum := sha256.Sum256([]byte(ch.Salt + strconv.Itoa(n)))
		if hex.EncodeToString(sum[:]) == ch.Challenge {
			return n
		}
	}
	t.Fatalf("impossible de résoudre le challenge dans [0, %d]", ch.MaxNumber)
	return -1
}

func makeToken(t *testing.T, sol Solution, asBase64 bool) string {
	t.Helper()
	b, err := json.Marshal(sol)
	if err != nil {
		t.Fatalf("json.Marshal: %v", err)
	}
	if asBase64 {
		return base64.StdEncoding.EncodeToString(b)
	}
	return string(b)
}

func TestGenerateAndVerifyValidAndReplay(t *testing.T) {
	mr := miniredis.RunT(t)
	rc := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	defer rc.Close()

	const secret = "super-secret-pow-key"
	ch, err := GenerateChallenge(secret, 500, 2*time.Minute)
	if err != nil {
		t.Fatalf("GenerateChallenge: %v", err)
	}
	if ch.Algorithm != AlgorithmSHA256 {
		t.Fatalf("algorithme attendu %q, obtenu %q", AlgorithmSHA256, ch.Algorithm)
	}
	if len(ch.Salt) != 32 {
		t.Fatalf("sel hex 16 octets attendu (32 chars), obtenu %d", len(ch.Salt))
	}

	n := solveForTest(t, ch)
	sol := Solution{
		Algorithm: ch.Algorithm,
		Challenge: ch.Challenge,
		Salt:      ch.Salt,
		Number:    n,
		MaxNumber: ch.MaxNumber,
		ExpiresAt: ch.ExpiresAt,
		Signature: ch.Signature,
	}

	// 1. Validation en base64 (format en-tête X-Qoe-Challenge)
	tokenB64 := makeToken(t, sol, true)
	ctx := context.Background()
	if err := VerifyAndConsume(ctx, rc, secret, tokenB64); err != nil {
		t.Fatalf("VerifyAndConsume (base64) échoué: %v", err)
	}

	// 2. Rejeu immédiat -> doit être rejeté
	if err := VerifyAndConsume(ctx, rc, secret, tokenB64); !errors.Is(err, ErrChallengeReplayed) {
		t.Fatalf("ErrChallengeReplayed attendu, obtenu %v", err)
	}

	// 3. Vérification en JSON brut avec rc == nil (sans anti-rejeu)
	tokenJSON := makeToken(t, sol, false)
	if err := VerifyAndConsume(ctx, nil, secret, tokenJSON); err != nil {
		t.Fatalf("VerifyAndConsume (JSON brut, rc=nil) échoué: %v", err)
	}
}

func TestVerifyWrongNumber(t *testing.T) {
	mr := miniredis.RunT(t)
	rc := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	defer rc.Close()

	const secret = "test-secret"
	ch, err := GenerateChallenge(secret, 100, time.Minute)
	if err != nil {
		t.Fatalf("GenerateChallenge: %v", err)
	}
	correct := solveForTest(t, ch)
	wrong := (correct + 1) % (ch.MaxNumber + 1)

	sol := Solution{
		Algorithm: ch.Algorithm,
		Challenge: ch.Challenge,
		Salt:      ch.Salt,
		Number:    wrong,
		MaxNumber: ch.MaxNumber,
		ExpiresAt: ch.ExpiresAt,
		Signature: ch.Signature,
	}
	token := makeToken(t, sol, true)
	err = VerifyAndConsume(context.Background(), rc, secret, token)
	if !errors.Is(err, ErrInvalidSolution) {
		t.Fatalf("ErrInvalidSolution attendu, obtenu %v", err)
	}
}

func TestVerifyTamperedSignature(t *testing.T) {
	mr := miniredis.RunT(t)
	rc := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	defer rc.Close()

	const secret = "test-secret"
	ch, err := GenerateChallenge(secret, 100, time.Minute)
	if err != nil {
		t.Fatalf("GenerateChallenge: %v", err)
	}
	n := solveForTest(t, ch)

	tamperedSig := "00" + ch.Signature[2:]
	if tamperedSig == ch.Signature {
		tamperedSig = "ff" + ch.Signature[2:]
	}

	sol := Solution{
		Algorithm: ch.Algorithm,
		Challenge: ch.Challenge,
		Salt:      ch.Salt,
		Number:    n,
		MaxNumber: ch.MaxNumber,
		ExpiresAt: ch.ExpiresAt,
		Signature: tamperedSig,
	}
	token := makeToken(t, sol, true)
	err = VerifyAndConsume(context.Background(), rc, secret, token)
	if !errors.Is(err, ErrInvalidSignature) {
		t.Fatalf("ErrInvalidSignature attendu, obtenu %v", err)
	}
}

func TestVerifyExpiredChallenge(t *testing.T) {
	mr := miniredis.RunT(t)
	rc := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	defer rc.Close()

	const secret = "test-secret"
	const salt = "0123456789abcdef0123456789abcdef"
	const n = 7
	const maxNumber = 100
	sum := sha256.Sum256([]byte(salt + strconv.Itoa(n)))
	challenge := hex.EncodeToString(sum[:])
	expiredAt := time.Now().Add(-10 * time.Second).Unix()
	sig := signPayload(secret, challenge, salt, maxNumber, expiredAt)

	sol := Solution{
		Algorithm: AlgorithmSHA256,
		Challenge: challenge,
		Salt:      salt,
		Number:    n,
		MaxNumber: maxNumber,
		ExpiresAt: expiredAt,
		Signature: sig,
	}
	token := makeToken(t, sol, true)
	err := VerifyAndConsume(context.Background(), rc, secret, token)
	if !errors.Is(err, ErrExpiredChallenge) {
		t.Fatalf("ErrExpiredChallenge attendu, obtenu %v", err)
	}
}

func TestGenerateAndVerifyEdgeCases(t *testing.T) {
	if _, err := GenerateChallenge("", 100, time.Minute); !errors.Is(err, ErrEmptySecret) {
		t.Fatalf("ErrEmptySecret attendu, obtenu %v", err)
	}
	if _, err := GenerateChallenge("s", -1, time.Minute); !errors.Is(err, ErrInvalidParams) {
		t.Fatalf("ErrInvalidParams attendu pour maxNumber < 0, obtenu %v", err)
	}
	if _, err := GenerateChallenge("s", 10, 0); !errors.Is(err, ErrInvalidParams) {
		t.Fatalf("ErrInvalidParams attendu pour ttl <= 0, obtenu %v", err)
	}
	if err := VerifyAndConsume(context.Background(), nil, "s", "not-valid-base64!!!"); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("ErrInvalidToken attendu, obtenu %v", err)
	}
}
