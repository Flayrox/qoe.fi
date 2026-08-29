package billing

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/hibiken/asynq"
)

// failingReader casse io.ReadAll pour couvrir la branche "corps invalide".
type failingReader struct{}

func (failingReader) Read([]byte) (int, error) { return 0, errors.New("boom") }

func TestStripeWebhook_BadBody_Rejected(t *testing.T) {
	r := testRouter()
	req := httptest.NewRequest("POST", "/v1/webhooks/stripe", failingReader{})
	req.Body = io.NopCloser(failingReader{})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, attendu 400", w.Code)
	}
}

func TestStripeWebhook_InvalidJSON_Rejected(t *testing.T) {
	r := testRouter()
	req := signedRequest(t, time.Now().Unix(), []byte("{not json"))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, attendu 400, body = %s", w.Code, w.Body.String())
	}
}

func TestStripeWebhook_MissingEventID_Rejected(t *testing.T) {
	r := testRouter()
	body, _ := json.Marshal(map[string]any{"type": "invoice.paid"}) // pas d'id
	req := signedRequest(t, time.Now().Unix(), body)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, attendu 400", w.Code)
	}
}

func TestStripeWebhook_EnqueueFailure_500(t *testing.T) {
	// Client pointé sur un port fermé → l'enqueue échoue → 500.
	c := asynq.NewClient(asynq.RedisClientOpt{
		Addr:        "127.0.0.1:1",
		DialTimeout: 100 * time.Millisecond,
	})
	t.Cleanup(func() { _ = c.Close() })

	r := chi.NewRouter()
	NewHandler(c, webhookSecret).Register(r)

	body, _ := json.Marshal(map[string]any{"id": "evt_fail", "type": "invoice.paid"})
	req := signedRequest(t, time.Now().Unix(), body)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, attendu 500, body = %s", w.Code, w.Body.String())
	}
}

func TestSupabaseWebhook_Accepted(t *testing.T) {
	r := testRouter()
	body, _ := json.Marshal(map[string]any{"type": "user.created"})
	req := httptest.NewRequest("POST", "/v1/webhooks/supabase", bytes.NewReader(body))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, attendu 200", w.Code)
	}
	if !strings.Contains(w.Body.String(), "received") {
		t.Fatalf("body = %s", w.Body.String())
	}
}

func TestVerifySignature_NonNumericTimestamp_Rejected(t *testing.T) {
	r := testRouter()
	body, _ := json.Marshal(map[string]any{"id": "evt_ts"})
	req := httptest.NewRequest("POST", "/v1/webhooks/stripe", bytes.NewReader(body))
	req.Header.Set("Stripe-Signature", "t=abc,v1=whatever")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, attendu 401 (timestamp non numérique)", w.Code)
	}
}

func TestVerifySignature_MissingV1_Rejected(t *testing.T) {
	r := testRouter()
	body, _ := json.Marshal(map[string]any{"id": "evt_v1"})
	req := httptest.NewRequest("POST", "/v1/webhooks/stripe", bytes.NewReader(body))
	req.Header.Set("Stripe-Signature", "t="+strconv.FormatInt(time.Now().Unix(), 10)) // pas de v1
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, attendu 401 (v1 absent)", w.Code)
	}
}

func TestParseSigHeader_InvalidParts(t *testing.T) {
	// Partie sans '=' → ignorée ; inconnue → ignorée ; valeurs extraites sinon.
	ts, sig := parseSigHeader("garbage, v0=old, t=123, v1=abc")
	if ts != "123" || sig != "abc" {
		t.Fatalf("ts=%q sig=%q, attendu 123/abc", ts, sig)
	}

	ts, sig = parseSigHeader("")
	if ts != "" || sig != "" {
		t.Fatalf("ts=%q sig=%q, attendu vide", ts, sig)
	}
}

// sanity : la signature HMAC construite par le helper reste valide après les
// changements (régression du calcul timestamp.payload).
func TestSignatureHelper_MatchesServerComputation(t *testing.T) {
	h := NewHandler(nil, webhookSecret)
	raw := []byte(`{"id":"evt_ok","type":"x"}`)
	ts := time.Now().Unix()

	payload := strconv.FormatInt(ts, 10) + "." + string(raw)
	mac := hmac.New(sha256.New, []byte(webhookSecret))
	mac.Write([]byte(payload))
	sig := hex.EncodeToString(mac.Sum(nil))

	if !h.verifySignature("t="+strconv.FormatInt(ts, 10)+",v1="+sig, raw) {
		t.Fatal("signature générée par le helper refusée par le serveur")
	}
}
