package cache

import (
	"context"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
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
	// No-op quand le client est nil (pas de panique, pas d'erreur).
	if err := InvalidateNamespace(context.Background(), nil, "feed:"); err != nil {
		t.Fatalf("client nil doit être un no-op sans erreur, obtenu %v", err)
	}
}

func TestInvalidateNamespaces_NilClient(t *testing.T) {
	if err := InvalidateNamespaces(context.Background(), nil, "a:", "b:"); err != nil {
		t.Fatalf("client nil doit être un no-op sans erreur, obtenu %v", err)
	}
}

func TestInvalidateNamespaces_Multiple(t *testing.T) {
	// Avec un client nil, InvalidateNamespaces itère sur les préfixes et ne
	// plante pas — couvre la boucle multi-préfixes.
	if err := InvalidateNamespaces(context.Background(), nil, "x", "y", "z"); err != nil {
		t.Fatalf("client nil doit être un no-op sans erreur, obtenu %v", err)
	}
}

// TestInvalidateNamespace_ScanFailureReported : un SCAN qui échoue doit être
// rendu à l'appelant. Sinon l'invalidation est annoncée réussie alors que le
// cache reste périmé (et les feeds servent un contenu obsolète).
func TestInvalidateNamespace_ScanFailureReported(t *testing.T) {
	s := miniredis.RunT(t)
	c := redis.NewClient(&redis.Options{Addr: s.Addr()})
	t.Cleanup(func() { _ = c.Close() })
	s.Close() // serveur arrêté : SCAN échoue

	if err := InvalidateNamespace(context.Background(), c, "feed:"); err == nil {
		t.Fatal("un SCAN en échec doit remonter, sinon un cache périmé passe pour invalidé")
	}
	if err := InvalidateNamespaces(context.Background(), c, "a:", "b:"); err == nil {
		t.Fatal("InvalidateNamespaces doit agréger l'échec de SCAN")
	}
}
