package migrations

// Validation du pipeline goose : sur une base VIERGE, la migration squashée
// 00001_init.sql doit produire un schéma exploitable (tables + enums + index).
// Ce test n'utilise PAS testutil.Pool (qui applique déjà schema.sql) : il
// démarre son propre conteneur et ne lui applique QUE les migrations goose.

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func TestGooseUpFreshDatabase(t *testing.T) {
	ctx := context.Background()

	container, err := postgres.Run(ctx,
		"pgvector/pgvector:pg16",
		postgres.WithDatabase("qoe_goose_test"),
		postgres.WithUsername("qoe"),
		postgres.WithPassword("qoe"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).WithStartupTimeout(120*time.Second),
		),
	)
	if err != nil {
		t.Fatalf("démarrage conteneur: %v", err)
	}
	defer func() { _ = container.Terminate(context.Background()) }()

	url, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatalf("connection string: %v", err)
	}

	db, err := sql.Open("pgx", url)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer db.Close()

	// Répertoire des migrations (remonte depuis le CWD du package testé).
	dir, err := findMigrationsDir()
	if err != nil {
		t.Fatalf("migrations dir: %v", err)
	}
	if err := goose.SetDialect("postgres"); err != nil {
		t.Fatalf("dialecte: %v", err)
	}
	if err := goose.Up(db, dir); err != nil {
		t.Fatalf("goose up: %v", err)
	}

	// Le schéma est exploitable : tables clés, enums, index unique.
	for _, table := range []string{"User", "Publication", "Article", "MediaAsset", "Media", "Post", "Subscriber"} {
		var exists bool
		if err := db.QueryRow(`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1)`, table).Scan(&exists); err != nil {
			t.Fatalf("check table %s: %v", table, err)
		}
		if !exists {
			t.Fatalf("table %s absente après goose up", table)
		}
	}

	// Extension pgvector (colonne embedding) + enum.
	var hasVector bool
	_ = db.QueryRow(`SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname='vector')`).Scan(&hasVector)
	if !hasVector {
		t.Fatalf("extension vector absente")
	}
	var hasEnum bool
	_ = db.QueryRow(`SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname='PublicationType')`).Scan(&hasEnum)
	if !hasEnum {
		t.Fatalf("enum PublicationType absente")
	}

	// Idempotence : une 2e passe ne crée rien (toutes les migrations appliquées).
	version, err := goose.GetDBVersion(db)
	if err != nil {
		t.Fatalf("version: %v", err)
	}
	// 00001_init + 00002_highlight_quote_ordinal : maintenir à jour à
	// chaque nouvelle migration.
	const latestVersion = 2
	if version != latestVersion {
		t.Fatalf("version goose = %d, attendu %d", version, latestVersion)
	}
}

func findMigrationsDir() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for {
		candidate := filepath.Join(dir, "sql", "migrations")
		if _, err := os.Stat(candidate); err == nil {
			return candidate, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return "", os.ErrNotExist
}
