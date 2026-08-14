// Package cache fournit un client Redis avec invalidation de namespace,
// en miroir de @qoe/observability (withCache / cacheInvalidateNamespace).
package cache

import (
	"context"
	"log"
	"sync"

	"github.com/redis/go-redis/v9"
)

var (
	mu     sync.Mutex
	client *redis.Client
)

func redisURL() string { return "redis://localhost:6379" }

// Client retourne le singleton Redis (nil si non configuré / en échec).
func Client(redisURL string) *redis.Client {
	mu.Lock()
	defer mu.Unlock()
	if client != nil {
		return client
	}

	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		log.Printf("[cache] URL Redis invalide: %v", err)
		return nil
	}

	client = redis.NewClient(opt)
	return client
}

// InvalidateNamespace supprime toutes les clés préfixées (SCAN + DEL).
func InvalidateNamespace(ctx context.Context, c *redis.Client, prefix string) {
	if c == nil {
		return
	}
	var keys []string
	iter := c.Scan(ctx, 0, prefix+"*", 100).Iterator()
	for iter.Next(ctx) {
		keys = append(keys, iter.Val())
	}
	if len(keys) > 0 {
		if err := c.Del(ctx, keys...).Err(); err != nil {
			log.Printf("[cache] invalidation %s: %v", prefix, err)
		}
	}
}

// InvalidateNamespaces est une variante multi-préfixes (best-effort).
func InvalidateNamespaces(ctx context.Context, c *redis.Client, prefixes ...string) {
	if c == nil {
		return
	}
	for _, p := range prefixes {
		InvalidateNamespace(ctx, c, p)
	}
}
