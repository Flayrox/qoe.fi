package pow

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"strconv"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

// AlgorithmSHA256 identifie l'algorithme de hachage PoW compatible Altcha.
const AlgorithmSHA256 = "SHA-256"

var (
	ErrEmptySecret       = errors.New("pow: le secret ne doit pas être vide")
	ErrInvalidParams     = errors.New("pow: paramètres de challenge invalides")
	ErrInvalidToken      = errors.New("pow: jeton invalide ou malformé")
	ErrInvalidSignature  = errors.New("pow: signature HMAC invalide")
	ErrExpiredChallenge  = errors.New("pow: challenge expiré")
	ErrInvalidSolution   = errors.New("pow: solution PoW invalide")
	ErrChallengeReplayed = errors.New("pow: challenge déjà consommé")
)

// Challenge représente un défi Proof-of-Work signé par le serveur.
type Challenge struct {
	Algorithm string `json:"algorithm"`
	Challenge string `json:"challenge"`
	Salt      string `json:"salt"`
	MaxNumber int    `json:"maxNumber"`
	ExpiresAt int64  `json:"expiresAt"`
	Signature string `json:"signature"`
}

// Solution représente la réponse soumise par le client dans l'en-tête X-Qoe-Challenge.
type Solution struct {
	Algorithm string `json:"algorithm"`
	Challenge string `json:"challenge"`
	Salt      string `json:"salt"`
	Number    int    `json:"number"`
	MaxNumber int    `json:"maxNumber,omitempty"`
	ExpiresAt int64  `json:"expiresAt"`
	Signature string `json:"signature"`
}

// GenerateChallenge génère un défi PoW Altcha-compatible signé par HMAC-SHA256.
func GenerateChallenge(secret string, maxNumber int, ttl time.Duration) (Challenge, error) {
	if secret == "" {
		return Challenge{}, ErrEmptySecret
	}
	if maxNumber < 0 || ttl <= 0 {
		return Challenge{}, ErrInvalidParams
	}

	saltBytes := make([]byte, 16)
	if _, err := rand.Read(saltBytes); err != nil {
		return Challenge{}, fmt.Errorf("pow: génération du sel: %w", err)
	}
	salt := hex.EncodeToString(saltBytes)

	nBig, err := rand.Int(rand.Reader, big.NewInt(int64(maxNumber)+1))
	if err != nil {
		return Challenge{}, fmt.Errorf("pow: génération du nombre cible: %w", err)
	}
	n := int(nBig.Int64())

	sum := sha256.Sum256([]byte(salt + strconv.Itoa(n)))
	challenge := hex.EncodeToString(sum[:])
	expiresAt := time.Now().Add(ttl).Unix()
	signature := signPayload(secret, challenge, salt, maxNumber, expiresAt)

	return Challenge{
		Algorithm: AlgorithmSHA256,
		Challenge: challenge,
		Salt:      salt,
		MaxNumber: maxNumber,
		ExpiresAt: expiresAt,
		Signature: signature,
	}, nil
}

// VerifyAndConsume vérifie la signature HMAC, l'expiration et la preuve de travail
// d'un jeton (JSON brut ou base64), puis marque le challenge comme consommé dans Redis
// si rc != nil pour empêcher tout rejeu.
func VerifyAndConsume(ctx context.Context, rc *redis.Client, secret, encodedToken string) error {
	if secret == "" {
		return ErrEmptySecret
	}

	raw := strings.TrimSpace(encodedToken)
	if raw == "" {
		return ErrInvalidToken
	}

	var jsonBytes []byte
	if strings.HasPrefix(raw, "{") {
		jsonBytes = []byte(raw)
	} else {
		decoded, err := decodeBase64(raw)
		if err != nil {
			return ErrInvalidToken
		}
		jsonBytes = decoded
	}

	var sol Solution
	if err := json.Unmarshal(jsonBytes, &sol); err != nil {
		return ErrInvalidToken
	}

	if sol.Algorithm != AlgorithmSHA256 || sol.Challenge == "" || sol.Salt == "" || sol.Signature == "" || sol.Number < 0 || sol.MaxNumber < 0 {
		return ErrInvalidToken
	}

	// Vérification HMAC en temps constant avant toute autre opération coûteuse.
	expectedSig := signPayload(secret, sol.Challenge, sol.Salt, sol.MaxNumber, sol.ExpiresAt)
	gotSigBytes, err := hex.DecodeString(sol.Signature)
	if err != nil {
		return ErrInvalidSignature
	}
	expectedSigBytes, err := hex.DecodeString(expectedSig)
	if err != nil || !hmac.Equal(gotSigBytes, expectedSigBytes) {
		return ErrInvalidSignature
	}

	if time.Now().Unix() > sol.ExpiresAt {
		return ErrExpiredChallenge
	}

	if sol.MaxNumber > 0 && sol.Number > sol.MaxNumber {
		return ErrInvalidSolution
	}

	sum := sha256.Sum256([]byte(sol.Salt + strconv.Itoa(sol.Number)))
	computed := hex.EncodeToString(sum[:])
	if subtle.ConstantTimeCompare([]byte(computed), []byte(strings.ToLower(sol.Challenge))) != 1 {
		return ErrInvalidSolution
	}

	if rc != nil {
		remaining := time.Until(time.Unix(sol.ExpiresAt, 0))
		if remaining < time.Second {
			remaining = time.Second
		}
		key := "pow:used:" + sol.Challenge
		ok, err := rc.SetNX(ctx, key, "1", remaining).Result()
		if err != nil {
			return fmt.Errorf("pow: anti-rejeu redis: %w", err)
		}
		if !ok {
			return ErrChallengeReplayed
		}
	}

	return nil
}

func signPayload(secret, challenge, salt string, maxNumber int, expiresAt int64) string {
	payload := challenge + "|" + salt + "|" + strconv.Itoa(maxNumber) + "|" + strconv.FormatInt(expiresAt, 10)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(payload))
	return hex.EncodeToString(mac.Sum(nil))
}

func decodeBase64(s string) ([]byte, error) {
	for _, enc := range []*base64.Encoding{
		base64.StdEncoding,
		base64.RawStdEncoding,
		base64.URLEncoding,
		base64.RawURLEncoding,
	} {
		if b, err := enc.DecodeString(s); err == nil {
			return b, nil
		}
	}
	return nil, ErrInvalidToken
}
