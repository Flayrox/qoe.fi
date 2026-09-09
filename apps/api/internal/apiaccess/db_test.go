package apiaccess

import (
	"context"
	"log"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/testutil"
)

var poolTest *pgxpool.Pool

func TestMain(m *testing.M) {
	p, err := testutil.Pool(context.Background())
	if err != nil {
		log.Fatalf("testcontainers: %v", err)
	}
	poolTest = p
	code := m.Run()
	testutil.Cleanup()
	os.Exit(code)
}

func cleanupConfig(t *testing.T, ctx context.Context) {
	t.Helper()
	if _, err := poolTest.Exec(ctx,
		`DELETE FROM "SystemConfig" WHERE key = ANY($1::text[])`,
		[]string{ConfigKey, AccessDisabledKey, DisabledEndpointsKey},
	); err != nil {
		t.Fatalf("cleanup config: %v", err)
	}
}

func upsertConfig(t *testing.T, ctx context.Context, key, value string) {
	t.Helper()
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "SystemConfig" (key, value, description, "updatedAt")
		 VALUES ($1, $2, 'test', now())
		 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now()`,
		key, value,
	); err != nil {
		t.Fatalf("upsert %s: %v", key, err)
	}
}

func TestLoadEnabled_Default(t *testing.T) {
	ctx := context.Background()
	cleanupConfig(t, ctx)
	defer cleanupConfig(t, ctx)

	enabled, err := LoadEnabled(ctx, poolTest)
	if err != nil {
		t.Fatalf("LoadEnabled: %v", err)
	}
	if len(enabled) != len(Registry) {
		t.Fatalf("LoadEnabled = %d modules, attendu %d (défaut = tout)", len(enabled), len(Registry))
	}
}

func TestLoadEnabled_ConfigJSON(t *testing.T) {
	ctx := context.Background()
	cleanupConfig(t, ctx)
	defer cleanupConfig(t, ctx)

	upsertConfig(t, ctx, ConfigKey, `["api:read","webhooks","clé-inconnue","api:read"]`)
	enabled, err := LoadEnabled(ctx, poolTest)
	if err != nil {
		t.Fatalf("LoadEnabled: %v", err)
	}
	// Clés inconnues filtrées, doublons dédupliqués.
	if len(enabled) != 2 || !HasGrant(enabled, "api:read") || !HasGrant(enabled, "webhooks") {
		t.Fatalf("LoadEnabled = %v, attendu [api:read webhooks]", enabled)
	}
}

func TestLoadEnabled_InvalidJSONFallsBack(t *testing.T) {
	ctx := context.Background()
	cleanupConfig(t, ctx)
	defer cleanupConfig(t, ctx)

	upsertConfig(t, ctx, ConfigKey, `pas du json`)
	enabled, err := LoadEnabled(ctx, poolTest)
	if err != nil {
		t.Fatalf("LoadEnabled: %v", err)
	}
	if len(enabled) != len(Registry) {
		t.Fatalf("JSON invalide → défaut (tout), obtenu %d", len(enabled))
	}
}

func TestIsEnabled(t *testing.T) {
	ctx := context.Background()
	cleanupConfig(t, ctx)
	defer cleanupConfig(t, ctx)

	if !IsEnabled(ctx, poolTest, ModuleOAuth) {
		t.Fatal("IsEnabled(oauth) par défaut = false, attendu true")
	}
	upsertConfig(t, ctx, ConfigKey, `["api:read"]`)
	if IsEnabled(ctx, poolTest, ModuleOAuth) {
		t.Fatal("IsEnabled(oauth) après retrait = true, attendu false")
	}
	if !IsEnabled(ctx, poolTest, ModuleAPIRead) {
		t.Fatal("IsEnabled(api:read) = false, attendu true")
	}
}

func TestLoadAccessControl_Default(t *testing.T) {
	ctx := context.Background()
	cleanupConfig(t, ctx)
	defer cleanupConfig(t, ctx)

	cfg, err := LoadAccessControl(ctx, poolTest)
	if err != nil {
		t.Fatalf("LoadAccessControl: %v", err)
	}
	if cfg.Disabled {
		t.Fatal("coupure générale active par défaut, attendu false")
	}
	if len(cfg.DisabledEndpoints) != 0 {
		t.Fatalf("endpoints désactivés par défaut = %v, attendu vide", cfg.DisabledEndpoints)
	}
}

func TestLoadAccessControl_KillSwitchAndEndpoints(t *testing.T) {
	ctx := context.Background()
	cleanupConfig(t, ctx)
	defer cleanupConfig(t, ctx)

	upsertConfig(t, ctx, AccessDisabledKey, "true")
	upsertConfig(t, ctx, DisabledEndpointsKey, `["/v1/articles", "/v1/webhooks", "sans-slash"]`)
	cfg, err := LoadAccessControl(ctx, poolTest)
	if err != nil {
		t.Fatalf("LoadAccessControl: %v", err)
	}
	if !cfg.Disabled {
		t.Fatal("coupure générale = false, attendu true")
	}
	// Seuls les préfixes commençant par / sont retenus.
	if len(cfg.DisabledEndpoints) != 2 || !EndpointDisabled("/v1/articles/123", cfg.DisabledEndpoints) {
		t.Fatalf("DisabledEndpoints = %v, attendu 2 préfixes dont /v1/articles", cfg.DisabledEndpoints)
	}
	if EndpointDisabled("/v1/feed/trending", cfg.DisabledEndpoints) {
		t.Fatal("endpoint non listé désactivé à tort")
	}
}

func TestEndpointDisabled_ExactAndSubpath(t *testing.T) {
	prefixes := []string{"/v1/articles"}
	if !EndpointDisabled("/v1/articles", prefixes) {
		t.Fatal("chemin exact non couvert")
	}
	if !EndpointDisabled("/v1/articles/xyz", prefixes) {
		t.Fatal("sous-chemin non couvert")
	}
	if EndpointDisabled("/v1/articlesXYZ", prefixes) {
		t.Fatal("préfixe partiel non couvert")
	}
}