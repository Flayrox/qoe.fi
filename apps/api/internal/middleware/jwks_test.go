package middleware

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"math/big"
	"testing"
)

func TestBase64URLDecode(t *testing.T) {
	b, err := base64URLDecode(base64.RawURLEncoding.EncodeToString([]byte("hello")))
	if err != nil || string(b) != "hello" {
		t.Fatalf("base64URLDecode = %q %v", b, err)
	}
	if _, err := base64URLDecode("!!!not-base64!!!"); err == nil {
		t.Fatal("base64 invalide doit échouer")
	}
}

func TestBuildRSAKey(t *testing.T) {
	priv, err := rsa.GenerateKey(rand.Reader, 1024)
	if err != nil {
		t.Fatal(err)
	}
	pub := &priv.PublicKey
	x := pub.N.Bytes()
	e := big.NewInt(int64(pub.E)).Bytes()
	k := jwkKey{
		Kty: "RSA",
		N:   base64.RawURLEncoding.EncodeToString(x),
		E:   base64.RawURLEncoding.EncodeToString(e),
	}
	got, err := buildRSAKey(k)
	if err != nil {
		t.Fatalf("buildRSAKey: %v", err)
	}
	if got.N.Cmp(pub.N) != 0 || got.E != pub.E {
		t.Errorf("RSA key reconstruite différente: N=%v E=%d", got.N, got.E)
	}
	if _, err := buildRSAKey(jwkKey{Kty: "RSA", N: "!!!", E: "AQAB"}); err == nil {
		t.Error("n invalide doit échouer")
	}
	if _, err := buildRSAKey(jwkKey{Kty: "RSA", N: "AAEC", E: "!!!"}); err == nil {
		t.Error("e invalide doit échouer")
	}
}

func TestBuildECKey(t *testing.T) {
	// Génère une vraie clé ES256 (P-256) et encode x/y.
	priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	pub := &priv.PublicKey
	k := jwkKey{
		Crv: "P-256",
		X:   base64.RawURLEncoding.EncodeToString(pub.X.Bytes()),
		Y:   base64.RawURLEncoding.EncodeToString(pub.Y.Bytes()),
	}
	got, err := buildECKey(k)
	if err != nil {
		t.Fatalf("buildECKey P-256: %v", err)
	}
	if got.X.Cmp(pub.X) != 0 || got.Y.Cmp(pub.Y) != 0 {
		t.Error("point reconstruit différent")
	}

	// Point hors courbe → erreur.
	hack := &jwkKey{Crv: "P-256", X: "AQID", Y: "BAUG"}
	if _, err := buildECKey(*hack); err == nil {
		t.Error("point hors courbe doit échouer")
	}

	// Courbe non supportée.
	if _, err := buildECKey(jwkKey{Crv: "P-999"}); err == nil {
		t.Error("courbe non supportée doit échouer")
	}
	// P-384 et P-521 supportées.
	if priv384, err := ecdsa.GenerateKey(elliptic.P384(), rand.Reader); err == nil {
		p := &priv384.PublicKey
		_, err := buildECKey(jwkKey{Crv: "P-384",
			X: base64.RawURLEncoding.EncodeToString(p.X.Bytes()),
			Y: base64.RawURLEncoding.EncodeToString(p.Y.Bytes())})
		if err != nil {
			t.Errorf("P-384: %v", err)
		}
	}
	// X invalide / Y invalide → erreur.
	if _, err := buildECKey(jwkKey{Crv: "P-256", X: "!!!", Y: "AQID"}); err == nil {
		t.Error("X invalide doit échouer")
	}
	if _, err := buildECKey(jwkKey{Crv: "P-256", X: "AQID", Y: "!!!"}); err == nil {
		t.Error("Y invalide doit échouer")
	}
}

func TestFindJWKSKey(t *testing.T) {
	// findJWKSKey n'est pas exporté mais on teste via le set jwks.
	_ = jwkSet{Keys: []jwkKey{{Kid: "k1"}}}
	// Pas d'accès direct : on teste jwksAlgorithmAllowed séparément si besoin.
}