package workers

import (
	"bufio"
	"context"
	"encoding/base64"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

// ─── Fabrique : switch de fournisseur (EMAIL_PROVIDER) ─────────────────────

func TestNewEmailProvider_Switch(t *testing.T) {
	base := EmailProviderConfig{
		SMTP:         SMTPConfig{Host: "smtp.local", Port: 587},
		ResendAPIKey: "re_xxx",
	}
	// Sans EMAIL_PROVIDER explicite mais avec hôte SMTP → smtp (auto-détection).
	if p := NewEmailProvider(base); p == nil || p.Name() != "smtp" {
		t.Fatalf("auto smtp attendu, got %v", p)
	}
	// Sans rien du tout → nil (drain désactivé).
	if p := NewEmailProvider(EmailProviderConfig{}); p != nil {
		t.Fatalf("vide attendu nil, got %v", p.Name())
	}
	if p := NewEmailProvider(EmailProviderConfig{Provider: "smtp", SMTP: base.SMTP}); p == nil || p.Name() != "smtp" {
		t.Fatalf("smtp attendu, got %v", p)
	}
	if p := NewEmailProvider(EmailProviderConfig{Provider: "SMTP", SMTP: base.SMTP}); p == nil || p.Name() != "smtp" {
		t.Fatalf("smtp (case-insensitive) attendu, got %v", p)
	}
	if p := NewEmailProvider(EmailProviderConfig{Provider: "resend", ResendAPIKey: "re_xxx"}); p == nil || p.Name() != "resend" {
		t.Fatalf("resend attendu, got %v", p)
	}
	// resend sans clé → nil (drain désactivé proprement).
	if p := NewEmailProvider(EmailProviderConfig{Provider: "resend"}); p != nil {
		t.Fatalf("resend sans clé attendu nil, got %v", p.Name())
	}
	// smtp sans hôte → nil.
	if p := NewEmailProvider(EmailProviderConfig{Provider: "smtp"}); p != nil {
		t.Fatalf("smtp sans hôte attendu nil, got %v", p.Name())
	}
}

// ─── SMTP : serveur SMTP factice (enregistre le message) ───────────────────

type fakeSMTPResult struct {
	mu      sync.Mutex
	message string
}

func startFakeSMTPServer(t *testing.T) (host string, port int, result *fakeSMTPResult) {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	t.Cleanup(func() { _ = ln.Close() })
	result = &fakeSMTPResult{}

	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			go serveFakeSMTP(conn, result)
		}
	}()

	addr := ln.Addr().(*net.TCPAddr)
	return "127.0.0.1", addr.Port, result
}

func serveFakeSMTP(conn net.Conn, result *fakeSMTPResult) {
	defer conn.Close()
	r := bufio.NewReader(conn)
	write := func(s string) { _, _ = conn.Write([]byte(s)) }

	write("220 fake ESMTP ready\r\n")
	inData := false
	var data strings.Builder
	for {
		line, err := r.ReadString('\n')
		if err != nil {
			return
		}
		line = strings.TrimRight(line, "\r\n")
		if inData {
			if line == "." {
				inData = false
				result.mu.Lock()
				result.message = data.String()
				result.mu.Unlock()
				write("250 2.0.0 Ok: queued\r\n")
			} else {
				data.WriteString(line + "\n")
			}
			continue
		}
		switch {
		case strings.HasPrefix(line, "EHLO"):
			write("250-fake\r\n250-AUTH PLAIN LOGIN\r\n250 OK\r\n")
		case strings.HasPrefix(line, "AUTH"):
			write("235 2.7.0 Authentication successful\r\n")
		case strings.HasPrefix(line, "MAIL FROM"), strings.HasPrefix(line, "RCPT TO"):
			write("250 2.1.0 Ok\r\n")
		case strings.HasPrefix(line, "DATA"):
			write("354 End data with <CR><LF>.<CR><LF>\r\n")
			inData = true
			data.Reset()
		case strings.HasPrefix(line, "QUIT"):
			write("221 2.0.0 Bye\r\n")
			return
		default:
			write("250 Ok\r\n")
		}
	}
}

func TestSMTPProvider_Send(t *testing.T) {
	host, port, result := startFakeSMTPServer(t)
	p := NewSMTPProvider(SMTPConfig{
		Host: host, Port: port, User: "user", Pass: "pass",
		From: "qoe.fi Security <security@qoe.fi>", Secure: false,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	msg := EmailMessage{
		To:      "reader@example.com",
		Subject: "Alerte de Sécurité — nouvelle connexion 🔐",
		HTML:    "<p>Bonjour,</p><p>Une nouvelle connexion a été détectée.</p>",
	}
	if err := p.Send(ctx, msg); err != nil {
		t.Fatalf("Send: %v", err)
	}

	result.mu.Lock()
	got := result.message
	result.mu.Unlock()

	for _, want := range []string{
		"Subject: =?UTF-8?B?", // sujet encodé RFC 2047 (non-ASCII)
		"To: reader@example.com",
		"Content-Type: text/html; charset=UTF-8",
		"<p>Une nouvelle connexion a été détectée.</p>",
	} {
		if !strings.Contains(got, want) {
			t.Errorf("message SMTP manquant %q — reçu:\n%s", want, got)
		}
	}
}

// ─── Resend : API HTTP (serveur httptest) ──────────────────────────────────

func TestResendProvider_Send(t *testing.T) {
	var gotBody string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer re_test" {
			t.Errorf("Authorization = %q", r.Header.Get("Authorization"))
		}
		buf := make([]byte, 4096)
		n, _ := r.Body.Read(buf)
		gotBody = string(buf[:n])
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	p := &ResendProvider{apiKey: "re_test", apiURL: srv.URL}
	if err := p.Send(context.Background(), EmailMessage{
		From: "noreply@qoe.fi", To: "a@b.fr", Subject: "Test", HTML: "<p>hi</p>",
	}); err != nil {
		t.Fatalf("Send: %v", err)
	}
	if !strings.Contains(gotBody, `"to":["a@b.fr"]`) && !strings.Contains(gotBody, `"to":["a@b.fr"]`) {
		t.Errorf("payload resend inattendu: %s", gotBody)
	}
}

// ─── Encodage RFC 2047 ─────────────────────────────────────────────────────

func TestEncodeRFC2047(t *testing.T) {
	if got := encodeRFC2047("plain ascii"); got != "plain ascii" {
		t.Errorf("ascii: %q", got)
	}
	enc := encodeRFC2047("Sécurité")
	decoded, err := base64.StdEncoding.DecodeString(strings.TrimSuffix(strings.TrimPrefix(enc, "=?UTF-8?B?"), "?="))
	if err != nil || string(decoded) != "Sécurité" {
		t.Errorf("round-trip: %q → %v", enc, err)
	}
	if got := fmt.Sprintf("%v", encodeAddressHeader("qoe.fi <a@qoe.fi>")); !strings.Contains(got, "<a@qoe.fi>") {
		t.Errorf("encodeAddressHeader: %q", got)
	}
}
