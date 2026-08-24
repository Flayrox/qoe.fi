// Package testutil - helpers de tests d'integration.
//
// Les tests utilisent par defaut un conteneur PostgreSQL ephemere avec
// pgvector. TEST_DATABASE_URL est un mode explicite pour une base de test
// persistante, mais il est refuse si le nom de base ne finit pas par _test.
// Cette barriere empeche les fixtures (TRUNCATE) de viser la base dev.
package testutil

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

const migrationsDirName = "sql/migrations"

var (
	poolOnce sync.Once
	pool     *pgxpool.Pool
	poolErr  error
)

// Pool retourne le pool PostgreSQL de test, partage pendant le processus.
func Pool(ctx context.Context) (*pgxpool.Pool, error) {
	poolOnce.Do(func() {
		pool, poolErr = startDatabase(ctx)
	})
	return pool, poolErr
}

// MustPool est la variante de Pool qui echoue le test si la base ne demarre pas.
func MustPool(tb testing.TB) *pgxpool.Pool {
	tb.Helper()
	p, err := Pool(context.Background())
	if err != nil {
		tb.Fatalf("postgres de test: %v", err)
	}
	return p
}

// ClosePool ferme le pool. Les packages existants utilisent Cleanup ci-dessous.
func ClosePool() {
	if pool != nil {
		pool.Close()
		pool = nil
	}
}

func startDatabase(ctx context.Context) (*pgxpool.Pool, error) {
	if url := strings.TrimSpace(os.Getenv("TEST_DATABASE_URL")); url != "" {
		if err := validateTestDatabaseURL(url); err != nil {
			return nil, err
		}
		if err := applyMigrations(url); err != nil {
			return nil, err
		}
		return connect(ctx, url)
	}

	container, err := postgres.Run(ctx,
		"pgvector/pgvector:pg16",
		postgres.WithDatabase("qoe_test"),
		postgres.WithUsername("qoe"),
		postgres.WithPassword("qoe"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).WithStartupTimeout(120*time.Second),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("demarrage conteneur postgres: %w", err)
	}

	stopContainer := func() {
		_ = container.Terminate(context.Background())
	}
	url, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		stopContainer()
		return nil, fmt.Errorf("connection string: %w", err)
	}
	if err := applyMigrations(url); err != nil {
		stopContainer()
		return nil, err
	}
	p, err := connect(ctx, url)
	if err != nil {
		stopContainer()
		return nil, err
	}

	stopOnce := sync.OnceFunc(stopContainer)
	tcStop = append(tcStop, func() { stopOnce() })
	return p, nil
}

// validateTestDatabaseURL refuse les bases qui ne sont pas explicitement des
// bases de test. Cette fonction est pure pour pouvoir etre testee sans Docker.
func validateTestDatabaseURL(rawURL string) error {
	cfg, err := pgxpool.ParseConfig(rawURL)
	if err != nil {
		return fmt.Errorf("TEST_DATABASE_URL invalide: %w", err)
	}
	database := strings.ToLower(strings.TrimSpace(cfg.ConnConfig.Database))
	if database == "" {
		return fmt.Errorf("TEST_DATABASE_URL doit contenir un nom de base")
	}
	if !strings.HasSuffix(database, "_test") {
		return fmt.Errorf("TEST_DATABASE_URL refusee: la base %q ne finit pas par _test; la base dev est protegee", database)
	}
	return nil
}

func applyMigrations(url string) error {
	db, err := sql.Open("pgx", url)
	if err != nil {
		return fmt.Errorf("ouverture base de test: %w", err)
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	if err := db.Ping(); err != nil {
		return fmt.Errorf("ping base de test: %w", err)
	}
	dir, err := findMigrationsDir()
	if err != nil {
		return err
	}
	if err := goose.SetDialect("postgres"); err != nil {
		return fmt.Errorf("dialecte goose: %w", err)
	}
	if err := goose.Up(db, dir); err != nil {
		return fmt.Errorf("migrations goose: %w", err)
	}
	return nil
}

// tcStop contient les fonctions d'arret des conteneurs ephemeres.
var tcStop []func()

// Cleanup stoppe les conteneurs demarres par Pool.
func Cleanup() {
	for _, stop := range tcStop {
		stop()
	}
	tcStop = nil
}

func findMigrationsDir() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("getwd: %w", err)
	}
	for {
		candidate := filepath.Join(dir, migrationsDirName)
		if _, err := os.Stat(candidate); err == nil {
			return candidate, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return "", fmt.Errorf("migrations introuvables depuis %s", dir)
}

func connect(ctx context.Context, url string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, fmt.Errorf("parse base de test: %w", err)
	}
	cfg.MaxConns = 4
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("creation pool: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping pool: %w", err)
	}
	return pool, nil
}
