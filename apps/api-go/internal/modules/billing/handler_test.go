package billing

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
)

const webhookSecret = "whsec_test_1234567890"

func testRouter() *chi.Mux {
	r := chi.NewRouter()
	h := NewHandler(nil, webhookSecret)
	h.Register(r)
	return r
}

// signedRequest construit une requête POST avec un header Stripe-Signature valide.
func signedRequest(t *testing.T, ts int64, body []byte) *http.Request {
	t.Helper()
	payload := strconv.FormatInt(ts, 10) + "." + string(body)
	mac := hmac.New(sha256.New, []byte(webhookSecret))
	mac.Write([]byte(payload))
	sig := hex.EncodeToString(mac.Sum(nil))

	req := httptest.NewRequest("POST", "/v1/webhooks/stripe", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Stripe-Signature", "t="+strconv.FormatInt(ts, 10)+",v1="+sig)
	return req
}

func TestStripeWebhook_ValidSignature_Accepted(t *testing.T) {
	r := testRouter()
	body, _ := json.Marshal(map[string]any{
		"id":   "evt_test_1",
		"type": "invoice.payment_succeeded",
	})
	req := signedRequest(t, time.Now().Unix(), body)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "received") {
		t.Fatalf("body = %s", w.Body.String())
	}
}

func TestStripeWebhook_InvalidSignature_Rejected(t *testing.T) {
	r := testRouter()
	body, _ := json.Marshal(map[string]any{"id": "evt_test_2"})

	req := httptest.NewRequest("POST", "/v1/webhooks/stripe", bytes.NewReader(body))
	req.Header.Set("Stripe-Signature", "t=123,v1=bad_signature")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, attendu 401", w.Code)
	}
}

func TestStripeWebhook_MissingSignature_Rejected(t *testing.T) {
	r := testRouter()
	body, _ := json.Marshal(map[string]any{"id": "evt_test_3"})

	req := httptest.NewRequest("POST", "/v1/webhooks/stripe", bytes.NewReader(body))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, attendu 401", w.Code)
	}
}

func TestStripeWebhook_WrongTimestamp_Rejected(t *testing.T) {
	r := testRouter()
	body, _ := json.Marshal(map[string]any{"id": "evt_test_4"})

	// Signature calculée avec un timestamp différent de celui du header.
	req := signedRequest(t, time.Now().Add(-time.Hour).Unix(), body)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, attendu 401", w.Code)
	}
}

func TestStripeWebhook_NoSecret_Rejected(t *testing.T) {
	r := chi.NewRouter()
	NewHandler(nil, "").Register(r)
	body, _ := json.Marshal(map[string]any{"id": "evt_test_5"})

	req := signedRequest(t, time.Now().Unix(), body)
	req.Header.Set("Stripe-Signature", "t=1,v1=x") // le secret est vide → refus
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, attendu 401 (secret vide)", w.Code)
	}
}
