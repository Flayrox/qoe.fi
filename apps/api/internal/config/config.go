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
	// InternalSecret protège les endpoints internes (émission d'événements).
	InternalSecret string
	// StripeWebhookSecret vérifie les signatures des webhooks Stripe.
	StripeWebhookSecret string
	// UmamiAPIURL / UmamiAPIKey pour le proxy /v1/analytics/stats (créateur).
	UmamiAPIURL string
	UmamiAPIKey string
	// UmamiUser / UmamiPass pour l'authentification self-hosted v2 (login → token).
	UmamiUser string
	UmamiPass string
	// DefaultUmamiWebsiteID utilisé en fallback quand la publication n'en a pas.
	DefaultUmamiWebsiteID string
	// UmamiDatabaseURL = DSN read-only vers la DB Postgres d'Umami (récurrents, heatmap).
	UmamiDatabaseURL string
}

func Load() *Config {
	return &Config{
		// Port dédié à l'API Go (API_PORT), indépendant du PORT des apps web.
		// Évite la collision avec le Next.js web (3000) et avec « Soneph » (8080).
		Port:                  envOr("API_PORT", "8090"),
		DatabaseURL:           envOr("DATABASE_URL", ""),
		SupabaseAuthURL:       envOr("SUPABASE_AUTH_URL", envOr("NEXT_PUBLIC_SUPABASE_URL", "")),
		JWTSecret:             envOr("SUPABASE_JWT_SECRET", envOr("SUPABASE_SECRET_KEY", "")),
		RedisURL:              envOr("REDIS_URL", "redis://localhost:6379"),
		InternalSecret:        envOr("QOE_INTERNAL_SECRET", envOr("SUPABASE_SERVICE_ROLE_KEY", "")),
		StripeWebhookSecret:   envOr("STRIPE_WEBHOOK_SECRET", ""),
		UmamiAPIURL:           envOr("UMAMI_API_URL", "https://api.umami.is/v1"),
		UmamiAPIKey:           envOr("UMAMI_API_KEY", ""),
		UmamiUser:             envOr("UMAMI_USERNAME", ""),
		UmamiPass:             envOr("UMAMI_PASSWORD", ""),
		DefaultUmamiWebsiteID: envOr("NEXT_PUBLIC_UMAMI_WEBSITE_ID", ""),
		// Connexion read-only à la DB Postgres d'Umami (visiteurs récurrents,
		// heatmap horaire — métriques absentes de l'API REST).
		UmamiDatabaseURL: envOr("UMAMI_DATABASE_URL", ""),
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
