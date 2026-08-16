package middleware

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"fmt"
	"math/big"
)

// buildECKey construit une clé publique ECDSA à partir des champs JWKS
// (crv, x, y). Supabase signe ses JWT en ES256 (P-256) sur les projets
// récents — indispensable pour valider les tokens des apps modernes.
func buildECKey(k jwkKey) (*ecdsa.PublicKey, error) {
	var curve elliptic.Curve
	switch k.Crv {
	case "P-256":
		curve = elliptic.P256()
	case "P-384":
		curve = elliptic.P384()
	case "P-521":
		curve = elliptic.P521()
	default:
		return nil, fmt.Errorf("courbe JWKS non supportée: %s", k.Crv)
	}

	xBytes, err := base64URLDecode(k.X)
	if err != nil {
		return nil, err
	}
	yBytes, err := base64URLDecode(k.Y)
	if err != nil {
		return nil, err
	}

	x := new(big.Int).SetBytes(xBytes)
	y := new(big.Int).SetBytes(yBytes)

	// Vérifie que le point est bien sur la courbe (protège contre les clés
	// malformées ou malicieuses).
	if !curve.IsOnCurve(x, y) {
		return nil, fmt.Errorf("point ECDSA hors courbe")
	}

	return &ecdsa.PublicKey{Curve: curve, X: x, Y: y}, nil
}
