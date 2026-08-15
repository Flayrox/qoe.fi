// Package testutil — helpers de tests d'intégration.
//
// Démarre UN conteneur PostgreSQL avec l'extension pgvector (parité prod) et
// applique le schéma sqlc une seule fois par exécution. Les packages qui en ont
// besoin l'utilisent via TestMain, ce qui évite de démarrer un conteneur par
// test (économie de temps significative en CI et en local).
package testutil

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

// schemaFileName est le nom du fichier de schéma (cherché en remontant les
// répertoires depuis le CWD du test — les tests Go tournent depuis le package
// testé, pas depuis le package testutil).
const schemaFileName = "sql/schema/schema.sql"

var (
	poolOnce sync.Once
	pool     *pgxpool.Pool
	poolErr  error
)

// Pool retourne le pool PostgreSQL de test (démarre le conteneur au premier
// appel, partagé ensuite). Le conteneur tourne avec le schéma appliqué.
func Pool(ctx context.Context) (*pgxpool.Pool, error) {
	poolOnce.Do(func() {
		pool, poolErr = startContainer(ctx)
	})
	return pool, poolErr
}

// MustPool est la variante de Pool qui échoue le test si le conteneur ne
// démarre pas (à utiliser dans TestMain).
func MustPool(tb testing.TB) *pgxpool.Pool {
	tb.Helper()
	ctx := context.Background()
	p, err := Pool(ctx)
	if err != nil {
		tb.Fatalf("testcontainers postgres: %v", err)
	}
	return p
}

// ClosePool arrête le conteneur (appeler dans TestMain via defer).
func ClosePool() {
	if pool != nil {
		pool.Close()
		pool = nil
	}
}

func startContainer(ctx context.Context) (*pgxpool.Pool, error) {
	// Respecte une éventuelle variable d'environnement pour la config de la
	// base (utile quand on pointe vers une base déjà lancée, ex: CI).
	if url := os.Getenv("TEST_DATABASE_URL"); url != "" {
		return connect(ctx, url)
	}

	// ⚠️ pgvector : on utilise l'image pgvector/pgvector:pg16 (parité
	// docker-compose prod) car le schéma exécute CREATE EXTENSION vector et
	// définit des colonnes vector(1536). Une image postgres standard
	// échouerait ici.
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
		return nil, fmt.Errorf("démarrage conteneur postgres: %w", err)
	}

	// Nettoyage en fin de test : récupéré via t.Cleanup dans les packages.
	stopContainer := func() {
		_ = container.Terminate(context.Background())
	}

	url, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		stopContainer()
		return nil, fmt.Errorf("connection string: %w", err)
	}

	p, err := connect(ctx, url)
	if err != nil {
		stopContainer()
		return nil, err
	}

	// Applique le schéma complet (création des types, tables, index, FKs).
	schemaPath, err := findSchemaFile()
	if err != nil {
		p.Close()
		stopContainer()
		return nil, err
	}
	schema, err := os.ReadFile(schemaPath)
	if err != nil {
		p.Close()
		stopContainer()
		return nil, fmt.Errorf("lecture schéma: %w", err)
	}
	if _, err := p.Exec(ctx, string(schema)); err != nil {
		p.Close()
		stopContainer()
		return nil, fmt.Errorf("application schéma: %w", err)
	}

	// Enregistre l'arrêt pour la fin de l'exécution (process de test).
	stopOnce := sync.OnceFunc(stopContainer)
	tcStop = append(tcStop, func() { stopOnce() })

	return p, nil
}

// tcStop contient les fonctions d'arrêt enregistrées par le package test.
var tcStop []func()

// Cleanup stoppe les conteneurs démarrés par Pool. À appeler en fin de
// TestMain (après m.Run).
func Cleanup() {
	for _, stop := range tcStop {
		stop()
	}
	tcStop = nil
}

// findSchemaFile cherche sql/schema/schema.sql en remontant les répertoires
// depuis le CWD (les tests s'exécutent depuis le dossier de leur package).
func findSchemaFile() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("getwd: %w", err)
	}
	for {
		candidate := filepath.Join(dir, schemaFileName)
		if _, err := os.Stat(candidate); err == nil {
			return candidate, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return "", fmt.Errorf("schéma introuvable (cherché %q depuis %s)", schemaFileName, dir)
}

func connect(ctx context.Context, url string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, fmt.Errorf("parse DATABASE_URL: %w", err)
	}
	cfg.MaxConns = 4
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("create pool: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping: %w", err)
	}
	return pool, nil
}
