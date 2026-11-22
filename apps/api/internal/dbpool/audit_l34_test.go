package dbpool

import (
	"context"
	"log"
	"os"
	"testing"

	"github.com/qoefi/api/internal/testutil"
)

var testDSN string

func TestMain(m *testing.M) {
	pool, err := testutil.TryPool(context.Background())
	if err != nil {
		log.Printf("testcontainers indisponible, tests DB skippes: %v", err)
	} else {
		testDSN = pool.Config().ConnString()
	}
	code := m.Run()
	if testDSN != "" {
		testutil.Cleanup()
	}
	os.Exit(code)
}

// F772 — `PG_POOL_SIZE=1` (petit VPS, budget de connexions serré) rend
// MaxConns=1 alors que MinConns est figé à 2 : pgxpool refuse la
// configuration et le serveur ne démarre plus (« MaxConns must be >=
// MinConns »). Une valeur pourtant légale devient un crash au boot.
func TestAuditL34_SmallPoolSizeStillBoots(t *testing.T) {
	if testDSN == "" {
		t.Skip("DB indisponible (Docker/testcontainers requis)")
	}
	ctx := context.Background()
	for _, size := range []int32{1, 2} {
		pool, err := New(ctx, testDSN, size)
		if err != nil {
			t.Fatalf("New(poolSize=%d): %v", size, err)
		}
		cfg := pool.Config()
		if cfg.MaxConns != size {
			t.Errorf("poolSize=%d : MaxConns = %d", size, cfg.MaxConns)
		}
		if cfg.MinConns > cfg.MaxConns {
			t.Errorf("poolSize=%d : MinConns %d > MaxConns %d", size, cfg.MinConns, cfg.MaxConns)
		}
		var one int
		if err := pool.QueryRow(ctx, "SELECT 1").Scan(&one); err != nil || one != 1 {
			t.Fatalf("poolSize=%d : requête = %d, %v", size, one, err)
		}
		pool.Close()
	}
}
