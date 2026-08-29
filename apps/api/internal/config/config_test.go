package config

import (
	"os"
	"testing"
)

// clearEnv supprime les variables attendues pour partir d'un état vierge.
func clearEnv(t *testing.T) {
	t.Helper()
	for _, k := range []string{
		"API_PORT", "API_DATABASE_URL", "DATABASE_URL", "SUPABASE_AUTH_URL",
		"NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_JWT_SECRET", "SUPABASE_SECRET_KEY",
		"REDIS_URL", "QOE_INTERNAL_SECRET", "SUPABASE_SERVICE_ROLE_KEY",
		"STRIPE_WEBHOOK_SECRET", "UMAMI_API_URL", "UMAMI_API_KEY",
		"UMAMI_USERNAME", "UMAMI_PASSWORD", "NEXT_PUBLIC_UMAMI_WEBSITE_ID",
		"UMAMI_DATABASE_URL", "OAUTH_ISSUER", "OAUTH_AUTHORIZE_URL",
		"OAUTH_SIGNING_KEY", "QOE_DEVTOOLS_DEV_ONLY",
	} {
		t.Setenv(k, "")
	}
}

func TestLoad_Defaults(t *testing.T) {
	clearEnv(t)
	c := Load()
	if c.Port != "8090" {
		t.Errorf("Port = %q, attendu 8090", c.Port)
	}
	if c.DatabaseURL != "" {
		t.Errorf("DatabaseURL = %q, attendu vide", c.DatabaseURL)
	}
	if c.RedisURL != "redis://localhost:6379" {
		t.Errorf("RedisURL = %q, attendu défaut local", c.RedisURL)
	}
	if c.UmamiAPIURL != "https://api.umami.is/v1" {
		t.Errorf("UmamiAPIURL = %q, attendu défaut", c.UmamiAPIURL)
	}
	if c.OAuthIssuer != "http://localhost:8090" {
		t.Errorf("OAuthIssuer = %q, attendu défaut", c.OAuthIssuer)
	}
	if c.OAuthAuthorizeURL != "http://localhost:3010/oauth/authorize" {
		t.Errorf("OAuthAuthorizeURL = %q, attendu défaut", c.OAuthAuthorizeURL)
	}
	if c.DevtoolsDevOnly {
		t.Error("DevtoolsDevOnly doit être false par défaut")
	}
}

func TestLoad_Overrides(t *testing.T) {
	clearEnv(t)
	t.Setenv("API_PORT", "9000")
	t.Setenv("API_DATABASE_URL", "postgres://x")
	t.Setenv("REDIS_URL", "redis://r:1111")
	t.Setenv("QOE_DEVTOOLS_DEV_ONLY", "true")
	t.Setenv("OAUTH_SIGNING_KEY", "pem")
	t.Setenv("STRIPE_WEBHOOK_SECRET", "sk_test")
	c := Load()
	if c.Port != "9000" {
		t.Errorf("Port = %q", c.Port)
	}
	if c.DatabaseURL != "postgres://x" {
		t.Errorf("DatabaseURL = %q", c.DatabaseURL)
	}
	if c.RedisURL != "redis://r:1111" {
		t.Errorf("RedisURL = %q", c.RedisURL)
	}
	if !c.DevtoolsDevOnly {
		t.Error("DevtoolsDevOnly doit être true")
	}
	if c.OAuthSigningKey != "pem" || c.StripeWebhookSecret != "sk_test" {
		t.Error("override OAuthSigningKey/StripeWebhookSecret non appliqué")
	}
}

func TestLoad_FallbackAliases(t *testing.T) {
	clearEnv(t)
	// API_DATABASE_URL absent → repli sur DATABASE_URL.
	t.Setenv("DATABASE_URL", "postgres://fallback")
	// SUPABASE_AUTH_URL absent → repli NEXT_PUBLIC_SUPABASE_URL.
	t.Setenv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.local")
	c := Load()
	if c.DatabaseURL != "postgres://fallback" {
		t.Errorf("DatabaseURL fallback = %q", c.DatabaseURL)
	}
	if c.SupabaseAuthURL != "https://supabase.local" {
		t.Errorf("SupabaseAuthURL fallback = %q", c.SupabaseAuthURL)
	}
}

func TestLoad_API_DatabaseURL_Wins(t *testing.T) {
	clearEnv(t)
	t.Setenv("API_DATABASE_URL", "postgres://primary")
	t.Setenv("DATABASE_URL", "postgres://fallback")
	c := Load()
	if c.DatabaseURL != "postgres://primary" {
		t.Errorf("API_DATABASE_URL doit primer: %q", c.DatabaseURL)
	}
}

func TestBoolEnv(t *testing.T) {
	envKey := "QOE_TEST_BOOLENV"
	for _, v := range []string{"1", "true", "YES", "on", "True"} {
		t.Setenv(envKey, v)
		if !boolEnv(envKey) {
			t.Errorf("boolEnv(%s=%q) = false, attendu true", envKey, v)
		}
	}
	for _, v := range []string{"", "0", "false", "no", "off", "2", "TRUEBAR"} {
		t.Setenv(envKey, v)
		if boolEnv(envKey) {
			t.Errorf("boolEnv(%s=%q) = true, attendu false", envKey, v)
		}
	}
}

func TestEnvOr(t *testing.T) {
	envKey := "QOE_TEST_ENVOR"
	if got := envOr(envKey, "def"); got != "def" {
		t.Errorf("envOr vide = %q", got)
	}
	t.Setenv(envKey, "present")
	if got := envOr(envKey, "def"); got != "present" {
		t.Errorf("envOr présent = %q", got)
	}
}

func TestPoolSize(t *testing.T) {
	envKey := "PG_POOL_SIZE"
	_ = os.Unsetenv(envKey) // t.Setenv + explicit cleanup pas nécessaire car envOr lit "présent".
	t.Setenv(envKey, "42")
	c := &Config{}
	if got := c.PoolSize(); got != 42 {
		t.Errorf("PoolSize = %d, attendu 42", got)
	}
	t.Setenv(envKey, "not-a-number")
	if got := c.PoolSize(); got != 20 {
		t.Errorf("PoolSize invalide = %d, attendu 20", got)
	}
	t.Setenv(envKey, "")
	if got := c.PoolSize(); got != 20 {
		t.Errorf("PoolSize vide = %d, attendu 20 (défaut)", got)
	}
}