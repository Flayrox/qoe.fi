package conversations

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/antispam"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/secguard"
	"github.com/redis/go-redis/v9"
)

func newSecguardConversationsRouter(t *testing.T, userID string, maxBodyBytes int64) *chi.Mux {
	t.Helper()
	mr := miniredis.RunT(t)
	rc := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rc.Close() })

	h := NewHandler(NewService(nil)).SetSecurityGuard(secguard.New(nil, rc))

	r := chi.NewRouter()
	if maxBodyBytes > 0 {
		r.Use(middleware.MaxBodyBytes(maxBodyBytes))
	}
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			ctx := context.WithValue(req.Context(), middleware.UserIDKey, userID)
			next.ServeHTTP(w, req.WithContext(ctx))
		})
	})
	h.Register(r)
	return r
}

func doConvJSON(t *testing.T, r http.Handler, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "198.51.100.20:1234"
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	return rr
}

func decodeConvErrCode(t *testing.T, rr *httptest.ResponseRecorder) string {
	t.Helper()
	var out struct {
		Code string `json:"code"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode error body (%d): %v (%s)", rr.Code, err, rr.Body.String())
	}
	return out.Code
}

func TestSecGuard_ConversationsColdDMCap429(t *testing.T) {
	r := newSecguardConversationsRouter(t, "00000000-0000-0000-0000-000000000201", 0)

	// Tier Low par défaut : plafond de 5 nouveaux destinataires non-abonnés / jour.
	// Sans Postgres, CreateDirect retourne 404 (nil-safe) après passage de CheckColdDM.
	for i := 1; i <= 5; i++ {
		body := fmt.Sprintf(`{"participantId":"00000000-0000-0000-0000-00000000100%d"}`, i)
		rr := doConvJSON(t, r, http.MethodPost, "/v1/conversations", body)
		if rr.Code == http.StatusTooManyRequests {
			t.Fatalf("cold DM %d bloqué prématurément en 429: %s", i, rr.Body.String())
		}
	}

	rr6 := doConvJSON(t, r, http.MethodPost, "/v1/conversations", `{"participantId":"00000000-0000-0000-0000-000000001006"}`)
	if rr6.Code != http.StatusTooManyRequests {
		t.Fatalf("6e cold DM code = %d, attendu 429 (body=%s)", rr6.Code, rr6.Body.String())
	}
	if code := decodeConvErrCode(t, rr6); code != antispam.CodeWriteCooldown {
		t.Fatalf("code = %q, attendu %q", code, antispam.CodeWriteCooldown)
	}
	if rr6.Header().Get("Retry-After") == "" {
		t.Fatal("en-tête Retry-After manquant sur 429 cold DM")
	}
}

func TestSecGuard_ConversationsZalgoAndXSS400(t *testing.T) {
	r := newSecguardConversationsRouter(t, "00000000-0000-0000-0000-000000000202", 0)

	rrZalgo := doConvJSON(t, r, http.MethodPost, "/v1/conversations/conv-1/messages", `{"content":"H\u0301\u0302\u0303\u0304llo"}`)
	if rrZalgo.Code != http.StatusBadRequest {
		t.Fatalf("Zalgo DM code = %d, attendu 400 (body=%s)", rrZalgo.Code, rrZalgo.Body.String())
	}
	if code := decodeConvErrCode(t, rrZalgo); code != antispam.CodeSpamUnicode {
		t.Fatalf("Zalgo DM code = %q, attendu %q", code, antispam.CodeSpamUnicode)
	}

	rrXSS := doConvJSON(t, r, http.MethodPost, "/v1/conversations/conv-1/messages", `{"content":"<script>alert(1)</script>"}`)
	if rrXSS.Code != http.StatusBadRequest {
		t.Fatalf("XSS DM code = %d, attendu 400 (body=%s)", rrXSS.Code, rrXSS.Body.String())
	}
	if code := decodeConvErrCode(t, rrXSS); code != antispam.CodeUnsafeHTML {
		t.Fatalf("XSS DM code = %q, attendu %q", code, antispam.CodeUnsafeHTML)
	}
}

func TestSecGuard_ConversationsSimHashDuplicate429(t *testing.T) {
	r := newSecguardConversationsRouter(t, "00000000-0000-0000-0000-000000000203", 0)

	rr1 := doConvJSON(t, r, http.MethodPost, "/v1/conversations/conv-1/messages", `{"content":"Super promo crypto clique ici"}`)
	if rr1.Code == http.StatusTooManyRequests || rr1.Code == http.StatusBadRequest {
		t.Fatalf("1er DM valide ne devait pas être rejeté: code=%d body=%s", rr1.Code, rr1.Body.String())
	}

	rr2 := doConvJSON(t, r, http.MethodPost, "/v1/conversations/conv-1/messages", `{"content":"Super promo crypto clik ici!"}`)
	if rr2.Code != http.StatusTooManyRequests {
		t.Fatalf("2e DM SimHash code = %d, attendu 429 (body=%s)", rr2.Code, rr2.Body.String())
	}
	if code := decodeConvErrCode(t, rr2); code != antispam.CodeSpamDuplicate {
		t.Fatalf("code = %q, attendu %q", code, antispam.CodeSpamDuplicate)
	}
	if rr2.Header().Get("Retry-After") == "" {
		t.Fatal("en-tête Retry-After manquant sur 429 SPAM_DUPLICATE")
	}
}

func TestSecGuard_ConversationsOversizedBody413(t *testing.T) {
	r := newSecguardConversationsRouter(t, "00000000-0000-0000-0000-000000000204", 256)
	payload := `{"content":"` + strings.Repeat("a", 512) + `"}`
	rr := doConvJSON(t, r, http.MethodPost, "/v1/conversations/conv-1/messages", payload)
	if rr.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("code = %d, attendu 413 (body=%s)", rr.Code, rr.Body.String())
	}
}
