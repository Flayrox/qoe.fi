package workers

import (
	"strings"
	"testing"
)

func TestSanitizeHeaderValue(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "clean string",
			input:    "Hello World",
			expected: "Hello World",
		},
		{
			name:     "crlf injection attempt",
			input:    "Hello\r\nBcc: evil@attacker.com",
			expected: "Hello Bcc: evil@attacker.com",
		},
		{
			name:     "crlf with control characters",
			input:    "Subject\x00\x08\r\nFrom: spoofed@target.com",
			expected: "Subject From: spoofed@target.com",
		},
		{
			name:     "leading and trailing crlf",
			input:    "\r\n  Important Update  \r\n",
			expected: "Important Update",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := SanitizeHeaderValue(tt.input)
			if strings.Contains(got, "\r") || strings.Contains(got, "\n") {
				t.Fatalf("SanitizeHeaderValue(%q) contains CRLF: %q", tt.input, got)
			}
			if got != tt.expected {
				t.Errorf("SanitizeHeaderValue(%q) = %q, want %q", tt.input, got, tt.expected)
			}
		})
	}
}

func TestBuildSMTPHeaders_CRLFImmunity(t *testing.T) {
	from := "News <news@qoe.fi>\r\nBcc: spy@evil.com"
	msg := EmailMessage{
		To:              "subscriber@example.com\r\nCc: accomplice@evil.com",
		Subject:         "Exclusive\r\nInjected-Header: evil",
		ReplyTo:         "reply@qoe.fi\r\nX-Injected: yes",
		ListUnsubscribe: "https://api.qoe.fi/unsub\r\nAttack: true",
		IsBulk:          true,
	}

	headers := buildSMTPHeaders(from, msg)

	// Vérifie qu'aucune ligne brute injectée n'apparaît
	lines := strings.Split(headers, "\r\n")
	for _, line := range lines {
		if strings.HasPrefix(line, "Bcc:") || strings.HasPrefix(line, "Cc:") || strings.HasPrefix(line, "Injected-Header:") || strings.HasPrefix(line, "X-Injected:") || strings.HasPrefix(line, "Attack:") {
			t.Fatalf("Header injection succeeded in line: %q", line)
		}
	}

	// Vérifie la présence des en-têtes RFC 8058 et bulk
	if !strings.Contains(headers, "List-Unsubscribe-Post: List-Unsubscribe=One-Click") {
		t.Errorf("Missing RFC 8058 header in:\n%s", headers)
	}
	if !strings.Contains(headers, "Precedence: bulk") {
		t.Errorf("Missing Precedence: bulk in:\n%s", headers)
	}
}
