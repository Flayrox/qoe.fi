package adminauthz

// ── Harnais de base réelle pour la console à capacités ─────────────────
//
// Le RBAC n'est vrai que s'il est exécuté : ces tests appliquent la migration
// 00053 et interrogent les requêtes de résolution sur un PostgreSQL réel (le
// même harnais que le reste du dépôt : testcontainers, ou la base partagée
// déclarée par TEST_DATABASE_URL).
//
// Deux règles :
//
//   - chaque test qui touche au SCHÉMA travaille dans une base NEUVE et jetable
//     créée dans le serveur de test. Un test de désinstallation (`goose down`)
//     ne peut donc pas casser les autres, et aucune suite de fixtures n'a
//     besoin de se coordonner ;
//   - l'indisponibilité de la base est un ÉCHEC, pas un skip : ces tests
//     existent pour combler un trou de preuve, un skip silencieux le
//     rouvrirait. L'échappatoire explicite est QOE_DB_TESTS_OPTIONAL=1 (poste
//     sans Docker), et elle est visible dans le message d'erreur.

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/qoefi/api/internal/testutil"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

const pgImage = "pgvector/pgvector:pg16"

var (
	pgOnce sync.Once
	pgURL  string
	pgStop func()
	pgErr  error
)

// TestMain arrête le conteneur partagé par le paquet à la fin de la suite.
func TestMain(m *testing.M) {
	code := m.Run()
	if pgStop != nil {
		pgStop()
	}
	os.Exit(code)
}

// ensureDockerHost branche testcontainers sur un démon Docker local quand il en
// existe un mais que DOCKER_HOST n'est pas exporté. Le CLI Docker résout son
// socket par contexte (OrbStack, Docker Desktop) ; le SDK Go, lui, ne lit que
// DOCKER_HOST et retombe sur /var/run/docker.sock. Sans cette résolution, tous
// les tests de base seraient « indisponibles » alors que Docker tourne.
func ensureDockerHost() {
	if os.Getenv("DOCKER_HOST") != "" {
		return
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return
	}
	for _, candidate := range []string{
		filepath.Join(home, ".orbstack", "run", "docker.sock"),
		filepath.Join(home, ".docker", "run", "docker.sock"),
		"/var/run/docker.sock",
	} {
		if info, statErr := os.Stat(candidate); statErr == nil && info.Mode()&os.ModeSocket != 0 {
			_ = os.Setenv("DOCKER_HOST", "unix://"+candidate)
			return
		}
	}
}

// failOrSkip échoue quand la base ne peut pas démarrer, sauf demande explicite
// de l'ignorer.
func failOrSkip(t *testing.T, what string, err error) {
	t.Helper()
	if os.Getenv("QOE_DB_TESTS_OPTIONAL") != "" {
		t.Skipf("%s (QOE_DB_TESTS_OPTIONAL=1) : %v", what, err)
	}
	t.Fatalf("%s : %v\n  → démarrez Docker (ou exportez DOCKER_HOST) ; posez QOE_DB_TESTS_OPTIONAL=1 pour ignorer les tests de base", what, err)
}

// pgServerURL retourne l'URL du serveur PostgreSQL de test, démarré une fois
// par paquet. TEST_DATABASE_URL (mode base partagée, `pnpm test:api`) est
// respecté tel quel : les bases par test sont alors créées dedans.
func pgServerURL(t *testing.T) string {
	t.Helper()
	pgOnce.Do(func() { pgURL, pgStop, pgErr = startPGServer() })
	if pgErr != nil {
		failOrSkip(t, "PostgreSQL de test indisponible", pgErr)
	}
	return pgURL
}

func startPGServer() (url string, stop func(), err error) {
	if env := strings.TrimSpace(os.Getenv("TEST_DATABASE_URL")); env != "" {
		return env, func() {}, nil
	}

	// testcontainers lève un panic (pas une erreur) quand le démon Docker est
	// absent : on le convertit en erreur pour que l'appelant décide.
	defer func() {
		if r := recover(); r != nil {
			url, stop, err = "", nil, fmt.Errorf("testcontainers: %v", r)
		}
	}()
	ensureDockerHost()

	ctx := context.Background()
	container, runErr := postgres.Run(ctx,
		pgImage,
		postgres.WithDatabase("qoe_test"),
		postgres.WithUsername("qoe"),
		postgres.WithPassword("qoe"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).WithStartupTimeout(120*time.Second),
		),
	)
	if runErr != nil {
		return "", nil, fmt.Errorf("démarrage du conteneur postgres: %w", runErr)
	}
	conn, connErr := container.ConnectionString(ctx, "sslmode=disable")
	if connErr != nil {
		_ = container.Terminate(ctx)
		return "", nil, fmt.Errorf("chaîne de connexion: %w", connErr)
	}
	return conn, func() { _ = container.Terminate(context.Background()) }, nil
}

// testDatabase est une base neuve, migrée à la demande, détruite en fin de test.
type testDatabase struct {
	name string
	url  string

	// pool est la surface que voit adminauthz (lecture des attributions).
	pool *pgxpool.Pool
	// sqlDB sert à goose (migration up/down) et aux vérifications brutes.
	sqlDB *sql.DB
}

var dbSeq atomic.Int64

func newTestDatabase(t *testing.T) *testDatabase {
	t.Helper()
	adminURL := pgServerURL(t)
	ctx := context.Background()
	name := fmt.Sprintf("rbac_%d_%d_test", os.Getpid(), dbSeq.Add(1))

	admin, err := pgx.Connect(ctx, adminURL)
	if err != nil {
		// Même règle que pour le démarrage du serveur : l'absence de base est
		// un échec, sauf échappatoire explicite.
		failOrSkip(t, "connexion au serveur de test", err)
		return nil
	}
	if _, err := admin.Exec(ctx, `CREATE DATABASE `+pgx.Identifier{name}.Sanitize()); err != nil {
		_ = admin.Close(ctx)
		t.Fatalf("création de la base %s: %v", name, err)
	}
	_ = admin.Close(ctx)

	// La chaîne de connexion est reconstruite pour viser la base jetable :
	// `pgxpool.Config.ConnString()` rend la chaîne PARSEE (mémorisée), donc
	// modifier `cfg.ConnConfig.Database` ne suffit pas — goose migrerait la base
	// du serveur pendant que le pool interroge la bonne.
	targetURL := withDatabase(t, adminURL, name)
	cfg, err := pgxpool.ParseConfig(targetURL)
	if err != nil {
		t.Fatalf("parse de l'URL de test: %v", err)
	}
	cfg.MaxConns = 4

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatalf("pool applicatif: %v", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		t.Fatalf("ping de la base %s: %v", name, err)
	}

	sqlDB, err := sql.Open("pgx", targetURL)
	if err != nil {
		pool.Close()
		t.Fatalf("connexion goose: %v", err)
	}
	// goose garde la version dans une table : une seule connexion évite les
	// courses entre lecture et migration.
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)

	db := &testDatabase{name: name, url: targetURL, pool: pool, sqlDB: sqlDB}
	t.Cleanup(func() {
		db.sqlDB.Close()
		db.pool.Close()
		drop, dropErr := pgx.Connect(context.Background(), adminURL)
		if dropErr != nil {
			t.Logf("nettoyage: base %s laissée en place (%v)", name, dropErr)
			return
		}
		defer drop.Close(context.Background())
		if _, dropErr := drop.Exec(context.Background(),
			`DROP DATABASE IF EXISTS `+pgx.Identifier{name}.Sanitize()+` WITH (FORCE)`); dropErr != nil {
			t.Logf("nettoyage: base %s non supprimée (%v)", name, dropErr)
		}
	})
	return db
}

// ── goose ─────────────────────────────────────────────────────────────

func migrationsDir(t *testing.T) string {
	t.Helper()
	dir, err := testutil.MigrationsDir()
	if err != nil {
		t.Fatalf("dossier des migrations: %v", err)
	}
	return dir
}

// upTo applique les migrations jusqu'à `version` inclus.
func (db *testDatabase) upTo(t *testing.T, version int64) {
	t.Helper()
	if err := goose.SetDialect("postgres"); err != nil {
		t.Fatalf("dialecte goose: %v", err)
	}
	if err := goose.UpTo(db.sqlDB, migrationsDir(t), version); err != nil {
		t.Fatalf("goose up to %d: %v", version, err)
	}
}

// upToLatest applique toutes les migrations (00053 inclus).
func (db *testDatabase) upToLatest(t *testing.T) {
	t.Helper()
	if err := goose.SetDialect("postgres"); err != nil {
		t.Fatalf("dialecte goose: %v", err)
	}
	if err := goose.Up(db.sqlDB, migrationsDir(t)); err != nil {
		t.Fatalf("goose up: %v", err)
	}
}

func (db *testDatabase) downTo(t *testing.T, version int64) {
	t.Helper()
	if err := goose.SetDialect("postgres"); err != nil {
		t.Fatalf("dialecte goose: %v", err)
	}
	if err := goose.DownTo(db.sqlDB, migrationsDir(t), version); err != nil {
		t.Fatalf("goose down to %d: %v", version, err)
	}
}

func (db *testDatabase) version(t *testing.T) int64 {
	t.Helper()
	v, err := goose.GetDBVersion(db.sqlDB)
	if err != nil {
		t.Fatalf("version goose: %v", err)
	}
	return v
}

// ── introspection & fixtures ───────────────────────────────────────────

func (db *testDatabase) tableExists(t *testing.T, table string) bool {
	t.Helper()
	var exists bool
	err := db.pool.QueryRow(context.Background(),
		`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1)`,
		table).Scan(&exists)
	if err != nil {
		t.Fatalf("existence de la table %s: %v", table, err)
	}
	return exists
}

func (db *testDatabase) count(t *testing.T, table string) int {
	t.Helper()
	var n int
	if err := db.pool.QueryRow(context.Background(),
		`SELECT count(*) FROM `+pgx.Identifier{table}.Sanitize()).Scan(&n); err != nil {
		t.Fatalf("comptage de %s: %v", table, err)
	}
	return n
}

// createUser insère un compte minimal et retourne son identifiant.
func (db *testDatabase) createUser(t *testing.T, id, email, role string) string {
	t.Helper()
	_, err := db.pool.Exec(context.Background(),
		`INSERT INTO "User" (id, email, username, role, "updatedAt")
		 VALUES ($1, $2, $3, $4, now())`, id, email, email, role)
	if err != nil {
		t.Fatalf("création du compte %s: %v", email, err)
	}
	return id
}

// grant attribue un rôle de console. expiresAt nil = attribution sans fin.
func (db *testDatabase) grant(t *testing.T, userID, roleKey string, expiresAt any) {
	t.Helper()
	_, err := db.pool.Exec(context.Background(),
		`INSERT INTO "AdminUserRole" ("userId", "roleKey", "grantedAt", "expiresAt")
		 VALUES ($1, $2, now(), $3)`, userID, roleKey, expiresAt)
	if err != nil {
		t.Fatalf("attribution de %s à %s: %v", roleKey, userID, err)
	}
}

// service branche le service de capacités réel sur la base de test.
func (db *testDatabase) service() *Service { return NewService(db.pool) }

// resolve résout l'accès d'un compte et échoue le test en cas d'erreur.
func (db *testDatabase) resolve(t *testing.T, svc *Service, userID string) Access {
	t.Helper()
	access, err := svc.Access(context.Background(), userID)
	if err != nil {
		t.Fatalf("Access(%s): %v", userID, err)
	}
	return access
}

// uuid génère des identifiants de test déterministes et valides.
func uuid(n int) string { return fmt.Sprintf("00000000-0000-0000-0000-0000000000%02x", n) }

// withDatabase rend la même chaîne de connexion pointant sur une autre base.
func withDatabase(t *testing.T, connString, database string) string {
	t.Helper()
	u, err := url.Parse(connString)
	if err != nil || u.Scheme == "" {
		// Forme mot-clé/valeur : la dernière valeur gagne.
		return connString + " dbname=" + database
	}
	u.Path = "/" + database
	return u.String()
}
