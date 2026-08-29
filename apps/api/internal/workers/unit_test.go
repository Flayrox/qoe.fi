package workers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/hibiken/asynq"
	"github.com/qoefi/api/internal/queue"
)

func TestIntVal(t *testing.T) {
	if intVal(float64(3.9)) != 3 {
		t.Errorf("float64 3.9 → %d, attendu 3", intVal(float64(3.9)))
	}
	if intVal(7) != 7 {
		t.Errorf("int 7 → %d", intVal(7))
	}
	if intVal(int64(9)) != 9 {
		t.Errorf("int64 9 → %d", intVal(int64(9)))
	}
	if intVal("nope") != 0 {
		t.Errorf("string → %d, attendu 0", intVal("nope"))
	}
	if intVal(nil) != 0 {
		t.Errorf("nil → %d, attendu 0", intVal(nil))
	}
}

// TestRunLoops_Cancelled couvre l'exécution initiale des boucles de workers
// en passant un contexte déjà annulé : le « run once » s'exécute puis la boucle
// sort immédiatement (select sur ctx.Done).
func TestRunLoops_Cancelled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	RunUmamiProvisioner(ctx, poolTest, &fakeUmamiCreator{}, time.Microsecond)
	RunCollabCleanup(ctx, poolTest, time.Microsecond, 24*time.Hour)
	RunScheduledPublisher(ctx, poolTest, nil, time.Microsecond)
}

func TestHandleUserEmbedding_Branches(t *testing.T) {
	ctx := context.Background()
	w := &EmbeddingWorker{pool: poolTest}

	// Payload JSON invalide → erreur.
	tk := asynq.NewTask("embedding.user", []byte(`{bad`))
	if _, err := w.HandleUserEmbedding(ctx, tk), w.HandleUserEmbedding(ctx, tk); err == nil {
		t.Error("payload invalide doit échouer")
	}
	// UserID manquant → erreur.
	tk2 := asynq.NewTask("embedding.user", mustJSON(queue.EmbeddingPayload{UserID: ""}))
	if _, err := w.HandleUserEmbedding(ctx, tk2), w.HandleUserEmbedding(ctx, tk2); err == nil {
		t.Error("userId manquant doit échouer")
	}
	// URL d'embedding non définie → skip (nil), un user existant.
	tk3 := asynq.NewTask("embedding.user", mustJSON(queue.EmbeddingPayload{UserID: "00000000-0000-0000-0000-000000000001"}))
	if _, err := w.HandleUserEmbedding(ctx, tk3), w.HandleUserEmbedding(ctx, tk3); err != nil {
		t.Errorf("skip magnet sans EMBEDDING_URL doit renvoyer nil, pas %v", err)
	}
}

func mustJSON(v interface{}) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		panic(err)
	}
	return b
}

func TestSearchWorker_APIKeyAndDoJSON(t *testing.T) {
	t.Setenv("MEILI_MASTER_KEY", "")
	s := &SearchWorker{}
	if got := s.apiKey(); got != "qoe_master_key_123" {
		t.Errorf("apiKey défaut = %q", got)
	}
	t.Setenv("MEILI_MASTER_KEY", "my_key")
	s2 := &SearchWorker{}
	if got := s2.apiKey(); got != "my_key" {
		t.Errorf("apiKey env = %q", got)
	}

	// doJSON vers un serveur OK.
	ok := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer ok.Close()
	s2.doJSON(context.Background(), "POST", ok.URL, map[string]string{"k": "v"})

	// doJSON vers un serveur 500 (branche du log).
	err := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer err.Close()
	s2.doJSON(context.Background(), "PUT", err.URL, nil)

	// doJSON vers une URL injoignable (branche d'erreur réseau).
	s2.doJSON(context.Background(), "GET", "http://127.0.0.1:1/x", nil)
}