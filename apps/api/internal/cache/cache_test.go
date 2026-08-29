package cache

import (
	"context"
	"strings"
	"testing"

	"github.com/alicebob/miniredis/v2"
)

func TestClient_InvalidURL(t *testing.T) {
	// Réinitialise le singleton pour exercer la branche « parse invalide ».
	mu.Lock()
	client = nil
	mu.Unlock()
	if c := Client("not a redis url"); c != nil {
		t.Error("Client avec URL invalide doit renvoyer nil")
	}
}

// TestClient_Success sert le chemin positif du singleton : une URL valide
// produit un client non-nil sur lequel on peut Ping (miniredis).
func TestClient_Success(t *testing.T) {
	s := miniredis.RunT(t)
	// Réinitialise le singleton sous verrou pour pointer le miniredis de test.
	mu.Lock()
	client = nil
	mu.Unlock()

	c := Client("redis://" + s.Addr())
	if c == nil {
		t.Fatal("Client avec URL valide doit renvoyer un client")
	}
	if err := c.Ping(context.Background()).Err(); err != nil {
		t.Fatalf("ping miniredis: %v", err)
	}
}

func TestInvalidateNamespace_NilClient(t *testing.T) {
	// No-op silencieux quand le client est nil (pas de panique, pas d'erreur).
	InvalidateNamespace(context.Background(), nil, "feed:")
}

func TestInvalidateNamespaces_NilClient(t *testing.T) {
	InvalidateNamespaces(context.Background(), nil, "a:", "b:")
}

func TestInvalidateNamespaces_Multiple(t *testing.T) {
	// Avec un client nil, InvalidateNamespaces itère sur les préfixes et ne
	// plante pas — couvre la boucle multi-préfixes.
	InvalidateNamespaces(context.Background(), nil, "x", "y", "z")
}

func TestRedisURLConstant(t *testing.T) {
	// La constante est le fallback documenté.
	if !strings.HasPrefix(redisURL(), "redis://") {
		t.Errorf("redisURL() = %q, attendu un DSN redis://", redisURL())
	}
}