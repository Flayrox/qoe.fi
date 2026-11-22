// Package cache fournit un client Redis avec invalidation de namespace,
// en miroir de @qoe/observability (withCache / cacheInvalidateNamespace).
package cache

import (
	"context"
	"errors"
	"fmt"
	"log"
	"sync"

	"github.com/redis/go-redis/v9"
)

var (
	mu     sync.Mutex
	client *redis.Client
)

// Client retourne le singleton Redis (nil si non configuré / URL invalide).
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
//
// L'erreur est rendue : un SCAN interrompu ne doit pas être lu comme « rien à
// invalider », sinon le cache reste périmé en silence alors que l'invalidation
// est annoncée réussie.
func InvalidateNamespace(ctx context.Context, c *redis.Client, prefix string) error {
	if c == nil {
		return nil
	}
	var keys []string
	iter := c.Scan(ctx, 0, prefix+"*", 100).Iterator()
	for iter.Next(ctx) {
		keys = append(keys, iter.Val())
	}
	if err := iter.Err(); err != nil {
		return fmt.Errorf("scan %s*: %w", prefix, err)
	}
	if len(keys) > 0 {
		if err := c.Del(ctx, keys...).Err(); err != nil {
			return fmt.Errorf("del %s*: %w", prefix, err)
		}
	}
	return nil
}

// InvalidateNamespaces est une variante multi-préfixes : elle tente tous les
// préfixes puis rend l'ensemble des erreurs rencontrées.
func InvalidateNamespaces(ctx context.Context, c *redis.Client, prefixes ...string) error {
	var errs []error
	for _, p := range prefixes {
		if err := InvalidateNamespace(ctx, c, p); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}
