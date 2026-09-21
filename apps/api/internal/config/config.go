// Package config charge la configuration depuis l'environnement.
package config

import (
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Port        string
	DatabaseURL string
	// SupabaseAuthURL est l'URL d'auth (pour la résolution JWKS RS256).
	SupabaseAuthURL string
	// SupabaseURL est l'origine Supabase (auth + storage REST) pour les uploads.
	SupabaseURL string
	// APIKeyRateLimit est le quota de requêtes par minute PAR CLÉ API créateur.
	APIKeyRateLimit int
	// SupabaseServiceRoleKey est utilisé uniquement côté serveur pour l'Admin API GoTrue.
	SupabaseServiceRoleKey string
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
	// OAuthIssuer est l'origine canonique de l'AS (ex: https://qoe.fi). Sert au
	// document de discovery et au claim `iss` des id_token.
	OAuthIssuer string
	// OAuthAuthorizeURL est la page de consentement Next.js (browser-facing).
	OAuthAuthorizeURL string
	// OAuthSigningKey est la clé privée ES256 (PEM PKCS8/SEC1) signant les
	// id_token. Vide en dev → clé éphémère générée au démarrage (⚠️ ne pas
	// utiliser en production multi-instances).
	OAuthSigningKey string
	// DevtoolsDevOnly active le panneau de dev par secret partagé (QOE_DEVTOOLS_DEV_ONLY).
	DevtoolsDevOnly bool
	// FlagsSigningKey signe GET /v1/flags (HMAC-SHA256) pour les widgets et
	// intégrations tierces : ils vérifient l'authenticité sans accès Supabase.
	FlagsSigningKey string

	// ── Boîte d'envoi email (drain des notifications) ────────────────
	// NOTIFICATION_DELIVERY_ENABLED=true + EMAIL_PROVIDER (smtp|resend).
	NotificationDeliveryEnabled bool
	EmailProvider               string
	EmailFrom                   string
	// LegalPortalBaseURL : racine publique utilisée dans les emails d'avis
	// légal (le portail de re-consentement du domaine principal).
	LegalPortalBaseURL string
	// LegalAdminBaseURL : racine de la console superadmin, cible des rappels
	// d'échéance réglementaire.
	LegalAdminBaseURL string
	// LegalLifecycleIntervalMinutes : cadence du cycle de vie légal (ouverture
	// des revues, brouillon proposé, publication planifiée, rappels).
	LegalLifecycleIntervalMinutes int
	// LegalExportSigningKey : graine Ed25519 encodée en base64 (32 octets) qui
	// signe les exports du registre de consentement. Absente → les exports
	// signés sont refusés (une clé éphémère n'est générée qu'en développement).
	LegalExportSigningKey string
	SMTPHost              string
	SMTPPort              int
	SMTPUser              string
	SMTPPass              string
	SMTPSecure            bool
	ResendAPIKey          string
	// NewsletterRatePerMinute est le rythme d'envoi des emails newsletter /
	// release d'articles (emails par minute, défaut 30 — SMTP self-hosté safe).
	NewsletterRatePerMinute int
	// ── Cycle de vie des médias (MediaAsset) ──────────────────────────
	// MediaCDNBaseURL est l'origine publique des images (rewrite des URLs
	// Supabase Storage, ex: https://cdn.qoe.fi).
	MediaCDNBaseURL string
	// MediaQuotaBytesPerUser borne le volume stocké par utilisateur
	// (assets non purgés, défaut 512 Mo).
	MediaQuotaBytesPerUser int64
	// MediaUploadsPerHour borne les nouveaux uploads par utilisateur et par
	// heure (anti-flood Sharp + modération, défaut 100).
	MediaUploadsPerHour int64
	// MediaLifecycleIntervalMinutes cadence le worker de réconciliation /
	// purge des assets orphelins (défaut 60).
	MediaLifecycleIntervalMinutes int
	// MediaSoftDeleteGraceDays : délai avant purge définitive d'un asset
	// détaché (remplacé/supprimé côté métier, défaut 7 jours).
	MediaSoftDeleteGraceDays int
}

func Load() *Config {
	return &Config{
		// Port dédié à l'API Go (API_PORT), indépendant du PORT des apps web.
		// Évite la collision avec le Next.js web (3000) et avec « Soneph » (8080).
		Port: envOr("API_PORT", "8090"),
		// API_DATABASE_URL : DSN sans paramètres réservés à Prisma (ex: ?schema=public)
		// que pgx enverrait comme startup parameters (refusés par Postgres).
		DatabaseURL:            envOr("API_DATABASE_URL", envOr("DATABASE_URL", "")),
		SupabaseAuthURL:        envOr("SUPABASE_AUTH_URL", envOr("NEXT_PUBLIC_SUPABASE_URL", "")),
		SupabaseURL:            envOr("SUPABASE_URL", envOr("NEXT_PUBLIC_SUPABASE_URL", "")),
		SupabaseServiceRoleKey: envOr("SUPABASE_SERVICE_ROLE_KEY", ""),
		APIKeyRateLimit:        envInt("API_KEY_RATE_LIMIT", 600),
		JWTSecret:              envOr("SUPABASE_JWT_SECRET", envOr("SUPABASE_SECRET_KEY", "")),
		RedisURL:               envOr("REDIS_URL", "redis://localhost:6379"),
		InternalSecret:         envOr("QOE_INTERNAL_SECRET", ""),
		StripeWebhookSecret:    envOr("STRIPE_WEBHOOK_SECRET", ""),
		UmamiAPIURL:            envOr("UMAMI_API_URL", "https://api.umami.is/v1"),
		UmamiAPIKey:            envOr("UMAMI_API_KEY", ""),
		UmamiUser:              envOr("UMAMI_USERNAME", ""),
		UmamiPass:              envOr("UMAMI_PASSWORD", ""),
		DefaultUmamiWebsiteID:  envOr("NEXT_PUBLIC_UMAMI_WEBSITE_ID", ""),
		// Connexion read-only à la DB Postgres d'Umami (visiteurs récurrents,
		// heatmap horaire — métriques absentes de l'API REST).
		UmamiDatabaseURL: envOr("UMAMI_DATABASE_URL", ""),
		// OAuth 2.1 / OIDC — fournisseur d'identité qoefi.
		OAuthIssuer:       envOr("OAUTH_ISSUER", "http://localhost:8090"),
		OAuthAuthorizeURL: envOr("OAUTH_AUTHORIZE_URL", "http://localhost:3010/oauth/authorize"),
		OAuthSigningKey:   envOr("OAUTH_SIGNING_KEY", ""),
		DevtoolsDevOnly:   boolEnv("QOE_DEVTOOLS_DEV_ONLY"),
		FlagsSigningKey:   envOr("FLAGS_SIGNING_KEY", ""),

		// ── Boîte d'envoi email (drain des notifications) ────────────────
		NotificationDeliveryEnabled:   boolEnv("NOTIFICATION_DELIVERY_ENABLED"),
		EmailProvider:                 envOr("EMAIL_PROVIDER", ""),
		EmailFrom:                     envOr("EMAIL_FROM", ""),
		LegalPortalBaseURL:            envOr("LEGAL_PORTAL_BASE_URL", "https://qoe.fi"),
		LegalAdminBaseURL:             envOr("LEGAL_ADMIN_BASE_URL", "https://admin.qoe.fi"),
		LegalLifecycleIntervalMinutes: envInt("LEGAL_LIFECYCLE_INTERVAL_MINUTES", 15),
		LegalExportSigningKey:         envOr("LEGAL_EXPORT_SIGNING_KEY", ""),
		SMTPHost:                      envOr("SMTP_HOST", ""),
		SMTPPort:                      envInt("SMTP_PORT", 587),
		SMTPUser:                      envOr("SMTP_USER", ""),
		SMTPPass:                      envOr("SMTP_PASS", ""),
		SMTPSecure:                    boolEnv("SMTP_SECURE"),
		ResendAPIKey:                  envOr("RESEND_API_KEY", ""),
		NewsletterRatePerMinute:       envInt("NEWSLETTER_RATE_PER_MINUTE", 30),
		// Cycle de vie des médias : CDN public, quota par utilisateur,
		// cadence du worker de purge et grâce avant suppression définitive.
		MediaCDNBaseURL:               envOr("MEDIA_CDN_BASE_URL", "https://cdn.qoe.fi"),
		MediaQuotaBytesPerUser:        envInt64("MEDIA_QUOTA_BYTES", 512<<20),
		MediaUploadsPerHour:          envInt64("MEDIA_UPLOADS_PER_HOUR", 100),
		MediaLifecycleIntervalMinutes: envInt("MEDIA_LIFECYCLE_INTERVAL_MINUTES", 60),
		MediaSoftDeleteGraceDays:      envInt("MEDIA_SOFT_DELETE_GRACE_DAYS", 7),
	}
}

// envInt lit une variable d'environnement entière (défaut sinon).
func envInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}

// envInt64 lit une variable d'environnement entière 64 bits (défaut sinon).
func envInt64(key string, def int64) int64 {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			return n
		}
	}
	return def
}

func boolEnv(key string) bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
	return v == "1" || v == "true" || v == "yes" || v == "on"
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
