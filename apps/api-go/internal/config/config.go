// Package config charge la configuration depuis l'environnement.
package config

import (
	"os"
	"strconv"
)

type Config struct {
	Port        string
	DatabaseURL string
	// SupabaseAuthURL est l'URL d'auth (pour la résolution JWKS RS256).
	SupabaseAuthURL string
	// JWTSecret est la clé HMAC de fallback (GoTrue legacy `sb_secret_…`).
	JWTSecret string
	// RedisURL pour le rate-limiting / asynq.
	RedisURL string
}

func Load() *Config {
	return &Config{
		Port:            envOr("PORT", "8080"),
		DatabaseURL:     envOr("DATABASE_URL", ""),
		SupabaseAuthURL: envOr("SUPABASE_AUTH_URL", envOr("NEXT_PUBLIC_SUPABASE_URL", "")),
		JWTSecret:       envOr("SUPABASE_JWT_SECRET", envOr("SUPABASE_SECRET_KEY", "")),
		RedisURL:        envOr("REDIS_URL", "redis://localhost:6379"),
	}
}

func (c *Config) PoolSize() int32 {
	n, err := strconv.ParseInt(envOr("PG_POOL_SIZE", "20"), 10, 32)
	if err != nil {
		return 20
	}
	return int32(n)
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
