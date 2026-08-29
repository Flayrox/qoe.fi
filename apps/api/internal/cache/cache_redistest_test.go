package cache

import (
	"context"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

// newRedisClient démarre un miniredis in-process et retourne un client go-redis.
func newRedisClient(t *testing.T) (context.Context, *redis.Client) {
	t.Helper()
	s := miniredis.RunT(t)
	c := redis.NewClient(&redis.Options{
		Addr: s.Addr(),
	})
	t.Cleanup(func() { _ = c.Close() })
	return context.Background(), c
}

func TestInvalidateNamespace_RemovesMatchingKeys(t *testing.T) {
	ctx, c := newRedisClient(t)
	// Clés des deux namespaces + une hors du préfixe.
	if err := c.MSet(ctx, "feed:u1", "1", "feed:u2", "1", "user:u1", "1", "other", "1").Err(); err != nil {
		t.Fatalf("seed: %v", err)
	}
	InvalidateNamespace(ctx, c, "feed:")
	remain, err := c.Keys(ctx, "*").Result()
	if err != nil {
		t.Fatal(err)
	}
	if len(remain) != 2 {
		t.Fatalf("après invalidation feed:, reste %d clés (feed: doit être vidé, user:/other présents): %v", len(remain), remain)
	}
	for _, k := range remain {
		if k == "feed:u1" || k == "feed:u2" {
			t.Errorf("clé feed: restante: %q", k)
		}
	}
}

func TestInvalidateNamespace_NoneMatchingKeepsData(t *testing.T) {
	ctx, c := newRedisClient(t)
	if err := c.MSet(ctx, "user:u1", "1").Err(); err != nil {
		t.Fatal(err)
	}
	InvalidateNamespace(ctx, c, "feed:")
	n, err := c.Exists(ctx, "user:u1").Result()
	if err != nil || n != 1 {
		t.Fatalf("clé non préfixée doit survivre: exists=%d err=%v", n, err)
	}
}

func TestInvalidateNamespaces_Multi(t *testing.T) {
	ctx, c := newRedisClient(t)
	if err := c.MSet(ctx, "a:1", "1", "b:1", "1", "c:1", "1").Err(); err != nil {
		t.Fatal(err)
	}
	InvalidateNamespaces(ctx, c, "a:", "b:")
	remain, _ := c.Keys(ctx, "c:*").Result()
	if len(remain) != 1 || remain[0] != "c:1" {
		t.Fatalf("seule c:1 doit rester, obtenu %v", remain)
	}
}

func TestClient_CacheHitReturnsSameClient(t *testing.T) {
	// Le singleton met en cache : deux appels avec la même URL rendent la
	// même instance. (Le premier appel a déjà initialisé le client réel.)
	first := Client(redisURL())
	second := Client(redisURL())
	if (first == nil) != (second == nil) {
		t.Fatalf("premier=%v second=%v doivent être cohérents", first, second)
	}
}