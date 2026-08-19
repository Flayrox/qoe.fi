package middleware

import (
	"crypto/rsa"
	"encoding/base64"
	"math/big"
)

// rsaPublicKey est un alias vers la clé RSA construite depuis JWKS.
type rsaPublicKey = rsa.PublicKey

// buildRSAKey construit une clé publique RSA à partir des champs JWKS (n, e).
func buildRSAKey(k jwkKey) (*rsa.PublicKey, error) {
	nBytes, err := base64URLDecode(k.N)
	if err != nil {
		return nil, err
	}
	eBytes, err := base64URLDecode(k.E)
	if err != nil {
		return nil, err
	}

	n := new(big.Int).SetBytes(nBytes)
	e := 0
	for _, b := range eBytes {
		e = e<<8 | int(b)
	}

	return &rsa.PublicKey{N: n, E: e}, nil
}

func base64URLDecode(s string) ([]byte, error) {
	// base64.RawURLEncoding gère les paddings manquants.
	return base64.RawURLEncoding.DecodeString(s)
}
