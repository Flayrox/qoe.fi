package adminauthz

// =====================================================================
// 🧪 Recorder — la trace ne doit jamais coûter la requête
// =====================================================================
// Ce que ces tests verrouillent :
//   - une décision part telle quelle (capacité, issue, mode, route, IP) ;
//   - l'envoi est NON bloquant : un tampon plein perd la trace mais compte la
//     perte (jamais de mensonge silencieux) ;
//   - la fermeture vide le tampon avant de rendre la main ;
//   - un db nil rend l'enregistreur inerte au lieu de paniquer.
// =====================================================================

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/qoefi/api/internal/authz"
)

// fakeExecer capture les écritures et peut échouer à la demande.
type fakeExecer struct {
	mu      sync.Mutex
	args    [][]any
	fail    error
	release chan struct{}
}

func (f *fakeExecer) Exec(_ context.Context, _ string, args ...any) (pgconn.CommandTag, error) {
	f.mu.Lock()
	fail := f.fail
	f.mu.Unlock()
	if fail != nil {
		return pgconn.CommandTag{}, fail
	}
	if f.release != nil {
		<-f.release
	}
	f.mu.Lock()
	f.args = append(f.args, args)
	f.mu.Unlock()
	return pgconn.CommandTag{}, nil
}

func (f *fakeExecer) rows() [][]any {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([][]any{}, f.args...)
}

// waitForWritten attend qu'un nombre de décisions soit écrit (ou échoue).
func waitForWritten(t *testing.T, r *Recorder, want int64) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if r.Written() >= want {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("écritures = %d, attendu %d", r.Written(), want)
}

func TestRecorder_WritesDecisionFields(t *testing.T) {
	db := &fakeExecer{}
	recorder := NewRecorder(db)
	defer recorder.Close()

	recorder.Observe(Decision{
		Capability: UsersModerate,
		Allowed:    false,
		Code:       authz.CodeDenyMissingCapability,
		Mode:       ModeObserve,
		Method:     "PATCH",
		Path:       "/v1/admin/users/00000000-0000-0000-0000-0000000000a1",
		IP:         "203.0.113.7",
		RequestID:  "req-42",
	}, "00000000-0000-0000-0000-0000000000a3")

	waitForWritten(t, recorder, 1)
	rows := db.rows()
	if len(rows) != 1 {
		t.Fatalf("écritures = %d, attendu 1", len(rows))
	}
	args := rows[0]
	if len(args) != 10 {
		t.Fatalf("colonnes liées = %d, attendu 10", len(args))
	}
	if got := args[1]; got != string(UsersModerate) {
		t.Errorf("capacité = %v", got)
	}
	if got := args[2]; got != false {
		t.Errorf("allowed = %v", got)
	}
	if got := args[3]; got != string(authz.CodeDenyMissingCapability) {
		t.Errorf("code = %v", got)
	}
	if got := args[4]; got != "observe" {
		t.Errorf("mode = %v", got)
	}
	if got := args[6]; got != "PATCH" {
		t.Errorf("method = %v", got)
	}
	if got := args[8]; got != "203.0.113.7" {
		t.Errorf("ip = %v", got)
	}
	if got := args[9]; got != "req-42" {
		t.Errorf("requestId = %v", got)
	}
}

func TestRecorder_NilDatabaseIsInert(t *testing.T) {
	recorder := NewRecorder(nil)
	// Aucun panic, aucune goroutine : l'appel est un no-op.
	recorder.Observe(Decision{Capability: UsersRead, Allowed: true}, "u-1")
	if recorder.Written() != 0 || recorder.Dropped() != 0 || recorder.Queued() != 0 {
		t.Fatalf("enregistreur inerte attendu, écrites=%d perdues=%d file=%d",
			recorder.Written(), recorder.Dropped(), recorder.Queued())
	}
	recorder.Close()
	recorder.Close() // idempotent
}

func TestRecorder_CloseFlushesBuffer(t *testing.T) {
	db := &fakeExecer{}
	recorder := NewRecorder(db)
	// On remplit puis on ferme SANS attendre le vidage périodique : la fermeture
	// doit écrire ce qui restait.
	for i := 0; i < 5; i++ {
		recorder.Observe(Decision{Capability: AuditRead, Allowed: true}, "u-1")
	}
	recorder.Close()
	if recorder.Written() != 5 {
		t.Fatalf("écritures après fermeture = %d, attendu 5", recorder.Written())
	}
	if got := len(db.rows()); got != 5 {
		t.Fatalf("lignes écrites = %d, attendu 5", got)
	}
}

func TestRecorder_FullBufferCountsDrops(t *testing.T) {
	// Un Exec qui bloque indéfiniment : la goroutine d'écriture reste en vol,
	// le tampon se remplit, puis les décisions suivantes sont perdues.
	release := make(chan struct{})
	db := &fakeExecer{release: release}
	recorder := NewRecorder(db)
	defer func() {
		close(release)
		recorder.Close()
	}()

	// batchSize = 64 : on pousse le premier lot (bloqué en écriture) puis de quoi
	// saturer la file interne.
	total := decisionBuffer + 512
	for i := 0; i < total; i++ {
		recorder.Observe(Decision{Capability: AuditRead, Allowed: true}, "u-1")
	}
	if dropped := recorder.Dropped(); dropped == 0 {
		t.Fatal("aucune perte comptée alors que le tampon était saturé")
	}
	if queued := recorder.Queued(); queued > decisionBuffer {
		t.Fatalf("file = %d, au-dessus du plafond %d", queued, decisionBuffer)
	}
}

func TestRecorder_WriteFailureDoesNotPanic(t *testing.T) {
	db := &fakeExecer{fail: errors.New("base indisponible")}
	recorder := NewRecorder(db)
	defer recorder.Close()

	recorder.Observe(Decision{Capability: AuditRead, Allowed: true}, "u-1")
	// L'échec est journalisé et l'enregistreur continue de fonctionner.
	time.Sleep(200 * time.Millisecond)
	if recorder.Written() != 0 {
		t.Fatalf("écritures = %d, attendu 0 en cas d'échec", recorder.Written())
	}

	db.mu.Lock()
	db.fail = nil
	db.mu.Unlock()
	recorder.Observe(Decision{Capability: AuditRead, Allowed: true}, "u-1")
	waitForWritten(t, recorder, 1)
}
