package webhooks

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/netguard"
)

func TestNewSecret(t *testing.T) {
	s1, err := newSecret()
	if err != nil {
		t.Fatalf("génération secret: %v", err)
	}
	s2, err := newSecret()
	if err != nil {
		t.Fatalf("génération secret: %v", err)
	}
	// 32 octets encodés en hex = 64 caractères.
	if len(s1) != 64 {
		t.Errorf("longueur = %d, want 64", len(s1))
	}
	if s1 == s2 {
		t.Error("deux secrets générés identiques (entropie insuffisante)")
	}
}

func TestFilterValidEvents(t *testing.T) {
	// Événements connus conservés, inconnus filtrés, doublons dédupliqués.
	got := filterValidEvents([]string{"article.published", "article.unknown", "article.published", "subscriber.created"})
	if len(got) != 2 {
		t.Fatalf("len = %d, want 2: %v", len(got), got)
	}
	if got[0] != "article.published" || got[1] != "subscriber.created" {
		t.Errorf("événements inattendus: %v", got)
	}
	if len(filterValidEvents(nil)) != 0 {
		t.Error("liste vide doit rester vide")
	}
}

func TestSignHMAC(t *testing.T) {
	sig1 := signHMAC("secret", `{"event":"webhook.test"}`)
	sig2 := signHMAC("secret", `{"event":"webhook.test"}`)
	sig3 := signHMAC("autre-secret", `{"event":"webhook.test"}`)
	if sig1 != sig2 {
		t.Error("signature instable pour les mêmes entrées")
	}
	if sig1 == sig3 {
		t.Error("signatures identiques avec des secrets différents")
	}
	if len(sig1) != 64 {
		t.Errorf("longueur signature = %d, want 64 (SHA-256 hex)", len(sig1))
	}
}

func TestServiceCreate_RejectsPrivateAndLocalURLs(t *testing.T) {
	svc := NewService(nil)
	urls := []string{
		"http://localhost/hook",
		"http://localhost:8080/hook",
		"https://sub.localhost/hook",
		"https://printer.local/hook",
		"https://metadata.google.internal/computeMetadata/v1/",
		"https://127.0.0.1/hook",
		"https://169.254.169.254/latest/meta-data/",
		"https://10.0.0.1/hook",
		"https://172.16.0.1/hook",
		"https://192.168.1.1/hook",
		"https://100.64.0.1/hook",
		"https://[::1]/hook",
		"https://[fc00::1]/hook",
		"https://[::ffff:127.0.0.1]/hook",
		"https://user:pass@example.com/hook",
	}

	for _, u := range urls {
		t.Run(u, func(t *testing.T) {
			_, _, err := svc.Create(context.Background(), "u1", "p1", "Test", u, []string{"article.published"})
			if err == nil {
				t.Fatalf("Create(%q) = nil, attendu rejet SSRF", u)
			}
			if !errors.Is(err, errInvalidURL) || !errors.Is(err, netguard.ErrUnsafeURL) {
				t.Fatalf("Create(%q) err = %v, attendu errInvalidURL + netguard.ErrUnsafeURL", u, err)
			}
		})
	}
}

func TestHandlerCreate_RejectsPrivateAndLocalURLs(t *testing.T) {
	h := NewHandler(NewService(nil))
	urls := []string{
		"http://localhost:3000/hook",
		"https://127.0.0.1/hook",
		"https://169.254.169.254/latest/meta-data/",
		"https://10.0.0.1/hook",
		"https://192.168.1.1/hook",
		"https://100.64.0.1/hook",
		"https://metadata.google.internal/hook",
		"https://[::1]/hook",
		"https://[fc00::1]/hook",
		"https://[::ffff:127.0.0.1]/hook",
	}

	for _, u := range urls {
		t.Run(u, func(t *testing.T) {
			payload, _ := json.Marshal(map[string]any{
				"publisherId": "pub_1",
				"name":        "SSRF",
				"url":         u,
				"events":      []string{"article.published"},
			})
			req := httptest.NewRequest(http.MethodPost, "/v1/webhooks", bytes.NewReader(payload))
			req.Header.Set("Content-Type", "application/json")
			req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, "u_1"))
			w := httptest.NewRecorder()

			h.create(w, req)
			if w.Code != http.StatusBadRequest {
				t.Fatalf("POST /v1/webhooks (%s) = %d (%s), attendu 400", u, w.Code, w.Body.String())
			}
		})
	}
}

func TestWriteWebhookError_MapsInvalidURLToBadRequest(t *testing.T) {
	h := NewHandler(NewService(nil))
	for _, err := range []error{
		errInvalidURL,
		fmt.Errorf("%w : %w", errInvalidURL, netguard.ErrUnsafeURL),
		netguard.ErrUnsafeURL,
	} {
		w := httptest.NewRecorder()
		h.writeWebhookError(w, err)
		if w.Code != http.StatusBadRequest {
			t.Fatalf("writeWebhookError(%v) = %d, attendu 400", err, w.Code)
		}
	}
}
