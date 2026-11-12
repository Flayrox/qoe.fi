package logging

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"strings"
	"testing"
)

func TestRequestIDContext(t *testing.T) {
	if got := RequestIDFromContext(nil); got != "" {
		t.Fatalf("RequestIDFromContext(nil) = %q, attendu vide", got)
	}
	if got := RequestIDFromContext(context.Background()); got != "" {
		t.Fatalf("RequestIDFromContext(empty) = %q, attendu vide", got)
	}

	ctx := WithRequestID(context.Background(), "req-12345")
	if got := RequestIDFromContext(ctx); got != "req-12345" {
		t.Fatalf("RequestIDFromContext = %q, attendu %q", got, "req-12345")
	}
}

func TestRedactString(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{
			name: "email",
			in:   "user alice.dupont@example.com logged in",
			want: "user a***@example.com logged in",
		},
		{
			name: "bearer token",
			in:   "Authorization: Bearer abc123.def456-ghi_789==",
			want: "Authorization: Bearer [REDACTED]",
		},
		{
			name: "qoe_live api key",
			in:   "using key qoe_live_secretToken998877 for request",
			want: "using key qoe_live_[REDACTED] for request",
		},
		{
			name: "jwt",
			in:   "jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
			want: "jwt=[REDACTED]",
		},
		{
			name: "bearer jwt combined",
			in:   "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig123",
			want: "Bearer [REDACTED]",
		},
		{
			name: "empty",
			in:   "",
			want: "",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := RedactString(tc.in); got != tc.want {
				t.Fatalf("RedactString(%q) = %q, attendu %q", tc.in, got, tc.want)
			}
		})
	}
}

func TestNewLogger_JSONAndRedaction(t *testing.T) {
	var buf bytes.Buffer
	logger := NewLogger(&buf, slog.LevelDebug, true)

	logger.Info("auth attempt for bob@qoefi.io with qoe_live_123456",
		"password", "super-secret",
		"secret", "s3cr3t",
		"token", "tok_abc",
		"authorization", "Bearer xyz",
		"cookie", "session=abc",
		"email", "bob@qoefi.io",
		"apiKey", "key-1",
		"apikey", "key-2",
		"header", "Bearer tok_999",
		"err", errors.New("failed for alice@example.com"),
	)

	var entry map[string]any
	if err := json.Unmarshal(buf.Bytes(), &entry); err != nil {
		t.Fatalf("JSON invalide: %v (raw=%s)", err, buf.String())
	}

	if msg, _ := entry["msg"].(string); msg != "auth attempt for b***@qoefi.io with qoe_live_[REDACTED]" {
		t.Fatalf("msg inattendu: %q", msg)
	}

	sensitive := []string{"password", "secret", "token", "authorization", "cookie", "email", "apiKey", "apikey"}
	for _, k := range sensitive {
		if v, _ := entry[k].(string); v != "[REDACTED]" {
			t.Errorf("clé sensible %q = %q, attendu [REDACTED]", k, v)
		}
	}

	if v, _ := entry["header"].(string); v != "Bearer [REDACTED]" {
		t.Errorf("header = %q, attendu Bearer [REDACTED]", v)
	}
	if v, _ := entry["err"].(string); v != "failed for a***@example.com" {
		t.Errorf("err = %q, attendu failed for a***@example.com", v)
	}
}

func TestFromContext_AttachesRequestID(t *testing.T) {
	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(NewLogger(&buf, slog.LevelInfo, true))
	defer slog.SetDefault(prev)

	ctx := WithRequestID(context.Background(), "req-xyz-789")
	FromContext(ctx).Info("handled", "status", 200)

	var entry map[string]any
	if err := json.Unmarshal(buf.Bytes(), &entry); err != nil {
		t.Fatalf("JSON invalide: %v (raw=%s)", err, buf.String())
	}
	if got, _ := entry["reqId"].(string); got != "req-xyz-789" {
		t.Fatalf("reqId = %q, attendu req-xyz-789", got)
	}
	if got, _ := entry["msg"].(string); got != "handled" {
		t.Fatalf("msg = %q, attendu handled", got)
	}
}

func TestInitDefault_EnvConfig(t *testing.T) {
	prev := slog.Default()
	defer slog.SetDefault(prev)

	t.Setenv("LOG_LEVEL", "warn")
	t.Setenv("LOG_FORMAT", "text")
	InitDefault()

	if slog.Default().Enabled(context.Background(), slog.LevelInfo) {
		t.Fatal("LevelInfo ne devrait pas être actif avec LOG_LEVEL=warn")
	}
	if !slog.Default().Enabled(context.Background(), slog.LevelWarn) {
		t.Fatal("LevelWarn devrait être actif avec LOG_LEVEL=warn")
	}

	// Vérifier que NewLogger avec jsonFormat=false produit du texte.
	var buf bytes.Buffer
	l := NewLogger(&buf, slog.LevelInfo, false)
	l.Info("hello", "email", "test@qoefi.io")
	if !strings.Contains(buf.String(), "email=[REDACTED]") {
		t.Fatalf("sortie texte inattendue: %q", buf.String())
	}
}
