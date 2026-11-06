package migrations

// Preuve exécutable du triage uniforme côté schéma : sur une base VIERGE, la
// migration 00071 s'applique, se défait proprement, puis se réapplique. Ce test
// démarre son propre conteneur : il ne dépend ni de testutil.Pool ni de l'état
// laissé par un autre test.

import (
	"context"
	"database/sql"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

var triageTables = []string{
	"ModerationReport", "Appeal", "RiskDecision",
	"SupportTicket", "SubscriberImportBatch", "AdminApproval",
}

var triageColumns = []string{
	"assignedTo", "priority", "dueAt", "triageUpdatedAt", "triageUpdatedBy",
}

func triageSchemaCounts(t *testing.T, db *sql.DB) (columns int, checks int, indexes int) {
	t.Helper()
	for _, table := range triageTables {
		for _, column := range triageColumns {
			var exists bool
			if err := db.QueryRow(`
				SELECT EXISTS (
					SELECT 1 FROM information_schema.columns
					 WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
				)`, table, column).Scan(&exists); err != nil {
				t.Fatalf("colonne %s.%s: %v", table, column, err)
			}
			if exists {
				columns++
			}
		}
	}
	if err := db.QueryRow(`
		SELECT COUNT(*) FROM pg_constraint
		 WHERE conname = ANY($1)`,
		[]string{
			"ModerationReport_priority_check", "Appeal_priority_check",
			"RiskDecision_priority_check", "SupportTicket_priority_check",
			"SubscriberImportBatch_priority_check", "AdminApproval_priority_check",
		}).Scan(&checks); err != nil {
		t.Fatalf("contraintes: %v", err)
	}
	if err := db.QueryRow(`
		SELECT COUNT(*) FROM pg_indexes
		 WHERE schemaname = 'public' AND indexname = ANY($1)`,
		[]string{
			"ModerationReport_triage_idx", "Appeal_triage_idx", "RiskDecision_triage_idx",
			"SupportTicket_triage_idx", "SubscriberImportBatch_triage_idx", "AdminApproval_triage_idx",
		}).Scan(&indexes); err != nil {
		t.Fatalf("index: %v", err)
	}
	return columns, checks, indexes
}

func TestQueueTriageMigrationUpDownOnFreshDatabase(t *testing.T) {
	ctx := context.Background()
	if !dockerAvailable() {
		t.Skip("DB indisponible (Docker/testcontainers requis)")
	}
	container, err := postgres.Run(ctx,
		"pgvector/pgvector:pg16",
		postgres.WithDatabase("qoe_goose_triage"),
		postgres.WithUsername("qoe"),
		postgres.WithPassword("qoe"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).WithStartupTimeout(120*time.Second),
		),
	)
	if err != nil {
		t.Skipf("Docker indisponible : %v", err)
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
	version, err := goose.GetDBVersion(db)
	if err != nil {
		t.Fatalf("version après up: %v", err)
	}

	columns, checks, indexes := triageSchemaCounts(t, db)
	if columns != len(triageTables)*len(triageColumns) {
		t.Fatalf("colonnes de triage = %d, attendu %d", columns, len(triageTables)*len(triageColumns))
	}
	if checks != len(triageTables) {
		t.Fatalf("CHECK de priorité = %d, attendu %d", checks, len(triageTables))
	}
	if indexes != len(triageTables) {
		t.Fatalf("index de triage = %d, attendu %d", indexes, len(triageTables))
	}

	// Down : seule la dernière migration (00071) est défaite.
	if err := goose.Down(db, dir); err != nil {
		t.Fatalf("goose down: %v", err)
	}
	afterDown, err := goose.GetDBVersion(db)
	if err != nil {
		t.Fatalf("version après down: %v", err)
	}
	if afterDown != version-1 {
		t.Fatalf("version après down = %d, attendu %d", afterDown, version-1)
	}
	columns, checks, indexes = triageSchemaCounts(t, db)
	if columns != 0 || checks != 0 || indexes != 0 {
		t.Fatalf("down incomplet : colonnes=%d checks=%d index=%d", columns, checks, indexes)
	}
	// Le Down ne doit pas emporter les tables métier elles-mêmes.
	for _, table := range triageTables {
		var exists bool
		if err := db.QueryRow(`
			SELECT EXISTS (SELECT 1 FROM information_schema.tables
			 WHERE table_schema = 'public' AND table_name = $1)`, table).Scan(&exists); err != nil {
			t.Fatalf("table %s: %v", table, err)
		}
		if !exists {
			t.Fatalf("la table métier %s a disparu au Down", table)
		}
	}

	// Réapplication : la migration est rejouable, pas à usage unique.
	if err := goose.Up(db, dir); err != nil {
		t.Fatalf("goose up (réapplication): %v", err)
	}
	columns, checks, indexes = triageSchemaCounts(t, db)
	if columns != len(triageTables)*len(triageColumns) || checks != len(triageTables) || indexes != len(triageTables) {
		t.Fatalf("réapplication incomplète : colonnes=%d checks=%d index=%d", columns, checks, indexes)
	}
}
