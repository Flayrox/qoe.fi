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
		"SUPABASE_URL", "NEXT_PUBLIC_APP_URL",
		"NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_JWT_SECRET", "SUPABASE_SECRET_KEY",
		"REDIS_URL", "QOE_INTERNAL_SECRET", "SUPABASE_SERVICE_ROLE_KEY",
		"STRIPE_WEBHOOK_SECRET", "UMAMI_API_URL", "UMAMI_API_KEY",
		"UMAMI_USERNAME", "UMAMI_PASSWORD", "NEXT_PUBLIC_UMAMI_WEBSITE_ID",
		"UMAMI_DATABASE_URL", "ANALYTICS_ANON_SECRET", "OAUTH_ISSUER", "OAUTH_AUTHORIZE_URL",
		"OAUTH_SIGNING_KEY", "QOE_DEVTOOLS_DEV_ONLY", "MEDIA_CDN_BASE_URL",
		"MEDIA_QUOTA_BYTES", "MEDIA_UPLOADS_PER_HOUR", "MEDIA_LIFECYCLE_INTERVAL_MINUTES",
		"MEDIA_SOFT_DELETE_GRACE_DAYS",
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
	if c.MediaCDNBaseURL != "https://cdn.qoe.fi" {
		t.Errorf("MediaCDNBaseURL = %q, attendu défaut CDN", c.MediaCDNBaseURL)
	}
	if c.MediaQuotaBytesPerUser != 512<<20 {
		t.Errorf("MediaQuotaBytesPerUser = %d, attendu 512 Mo", c.MediaQuotaBytesPerUser)
	}
	if c.MediaUploadsPerHour != 100 {
		t.Errorf("MediaUploadsPerHour = %d, attendu 100", c.MediaUploadsPerHour)
	}
	if c.MediaLifecycleIntervalMinutes != 60 {
		t.Errorf("MediaLifecycleIntervalMinutes = %d, attendu 60", c.MediaLifecycleIntervalMinutes)
	}
	if c.MediaSoftDeleteGraceDays != 7 {
		t.Errorf("MediaSoftDeleteGraceDays = %d, attendu 7", c.MediaSoftDeleteGraceDays)
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
	t.Setenv("MEDIA_CDN_BASE_URL", "https://cdn.example.test")
	t.Setenv("MEDIA_QUOTA_BYTES", "1048576")
	t.Setenv("MEDIA_UPLOADS_PER_HOUR", "50")
	t.Setenv("MEDIA_LIFECYCLE_INTERVAL_MINUTES", "15")
	t.Setenv("MEDIA_SOFT_DELETE_GRACE_DAYS", "3")
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
	if c.MediaCDNBaseURL != "https://cdn.example.test" {
		t.Errorf("MediaCDNBaseURL override = %q", c.MediaCDNBaseURL)
	}
	if c.MediaQuotaBytesPerUser != 1048576 {
		t.Errorf("MediaQuotaBytesPerUser override = %d", c.MediaQuotaBytesPerUser)
	}
	if c.MediaUploadsPerHour != 50 {
		t.Errorf("MediaUploadsPerHour override = %d", c.MediaUploadsPerHour)
	}
	if c.MediaLifecycleIntervalMinutes != 15 || c.MediaSoftDeleteGraceDays != 3 {
		t.Error("override lifecycle médias non appliqué")
	}
}

func TestLoad_FallbackAliases(t *testing.T) {
	clearEnv(t)
	// API_DATABASE_URL absent → repli sur DATABASE_URL.
	t.Setenv("DATABASE_URL", "postgres://fallback")
	// Origine applicative de production : c'est la seule configuration où une
	// origine Supabase distante est légitime (cf. resolveSupabaseOrigin).
	t.Setenv("NEXT_PUBLIC_APP_URL", "https://qoe.fi")
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

// TestLoad_SupabaseOriginGuardOnLocalBuild verrouille la règle du lot L20j :
// un process dont l'origine applicative est locale (dev, e2e) ne doit jamais
// conserver une origine Supabase publique distante — c'est ce qui faisait
// valider les JWT et servir le storage depuis le VPS partagé
// (`116.203.158.47:54321`) pendant les parcours locaux.
func TestLoad_SupabaseOriginGuardOnLocalBuild(t *testing.T) {
	clearEnv(t)
	t.Setenv("NEXT_PUBLIC_APP_URL", "http://localhost:15402")
	t.Setenv("NEXT_PUBLIC_SUPABASE_URL", "http://116.203.158.47:54321")
	t.Setenv("SUPABASE_URL", "http://116.203.158.47:54321")

	c := Load()
	if c.SupabaseAuthURL != "http://127.0.0.1:54321" {
		t.Errorf("SupabaseAuthURL = %q, attendu le stack local sur une origine applicative locale", c.SupabaseAuthURL)
	}
	if c.SupabaseURL != "http://127.0.0.1:54321" {
		t.Errorf("SupabaseURL = %q, attendu le stack local sur une origine applicative locale", c.SupabaseURL)
	}
}

// TestResolveSupabaseOrigin couvre la règle d'origine dans les deux sens :
// repli local sur un process de poste, valeur conservée en production.
func TestResolveSupabaseOrigin(t *testing.T) {
	const vps = "http://116.203.158.47:54321"
	localTargets := []string{
		"http://localhost:15402",
		"http://127.0.0.1:8091",
		"http://qoe.test:3000",
		"http://media-clair.qoe.test",
		"http://core.lvh.me:3010",
	}
	for _, app := range localTargets {
		if got := resolveSupabaseOrigin(vps, app); got != SupabaseLocalURL {
			t.Errorf("resolveSupabaseOrigin(%q, %q) = %q, attendu %q", vps, app, got, SupabaseLocalURL)
		}
		if got := resolveSupabaseOrigin("https://supabase.qoe.fi", app); got != SupabaseLocalURL {
			t.Errorf("origine nommée distante sur cible locale = %q, attendu %q", got, SupabaseLocalURL)
		}
	}

	// Production : la valeur fournie est honorée, y compris vers le VPS.
	for _, prod := range []string{"https://qoe.fi", "https://admin.qoe.fi", "https://media-clair.qoe.fi"} {
		if got := resolveSupabaseOrigin(vps, prod); got != vps {
			t.Errorf("resolveSupabaseOrigin(%q, %q) = %q, attendu la valeur fournie", vps, prod, got)
		}
	}

	// Une origine locale reste locale, même sur un process de production.
	if got := resolveSupabaseOrigin("http://127.0.0.1:54321", "https://qoe.fi"); got != "http://127.0.0.1:54321" {
		t.Errorf("origine locale sur process de production = %q", got)
	}

	// Valeurs absentes, relatives ou ambiguës : repli local, jamais propagées.
	for _, raw := range []string{"", "   ", "supabase", "//116.203.158.47:54321", "ftp://116.203.158.47"} {
		if got := resolveSupabaseOrigin(raw, "http://localhost:3000"); got != SupabaseLocalURL {
			t.Errorf("resolveSupabaseOrigin(%q) = %q, attendu repli local", raw, got)
		}
		if got := resolveSupabaseOrigin(raw, "https://qoe.fi"); got != SupabaseLocalURL {
			t.Errorf("valeur non-URL %q en production = %q, attendu repli local", raw, got)
		}
	}
}

// TestLoad_SupabaseOriginProductionKeepsValue vérifie que la garde n'écrase
// pas la configuration de production.
func TestLoad_SupabaseOriginProductionKeepsValue(t *testing.T) {
	clearEnv(t)
	t.Setenv("NEXT_PUBLIC_APP_URL", "https://qoe.fi")
	t.Setenv("SUPABASE_AUTH_URL", "https://auth.qoe.fi")
	t.Setenv("SUPABASE_URL", "https://storage.qoe.fi")
	c := Load()
	if c.SupabaseAuthURL != "https://auth.qoe.fi" {
		t.Errorf("SupabaseAuthURL = %q", c.SupabaseAuthURL)
	}
	if c.SupabaseURL != "https://storage.qoe.fi" {
		t.Errorf("SupabaseURL = %q", c.SupabaseURL)
	}
}
