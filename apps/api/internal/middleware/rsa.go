package middleware

import (
	"crypto/rsa"
	"encoding/base64"
	"fmt"
	"math/big"
)

// minRSABits est la taille minimale acceptée pour un modulus JWKS (NIST SP
// 800-57 : 2048 bits pour une signature valide au-delà de 2030). Une clé plus
// courte laisserait vérifier des JWT par une signature cassable : le JWKS est
// une configuration serveur, mais un point de configuration compromis ou une
// erreur de copie ne doit pas dégrader silencieusement la vérification.
const minRSABits = 2048

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

	if n.BitLen() < minRSABits {
		return nil, fmt.Errorf("clé RSA JWKS trop courte: %d bits (minimum %d)", n.BitLen(), minRSABits)
	}
	// Exposant public : impair et ≥ 3 (e=1 rendrait toute signature « valide »).
	if e < 3 || e%2 == 0 {
		return nil, fmt.Errorf("exposant RSA JWKS invalide: %d", e)
	}

	return &rsa.PublicKey{N: n, E: e}, nil
}

func base64URLDecode(s string) ([]byte, error) {
	// base64.RawURLEncoding gère les paddings manquants.
	return base64.RawURLEncoding.DecodeString(s)
}
