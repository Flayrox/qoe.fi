package workers

import (
	"io"
	"mime"
	"net/mail"
	"strings"
	"testing"

	gomail "github.com/wneessen/go-mail"
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

func TestBuildGoMailMessage_CRLFImmunityAndRFC8058(t *testing.T) {
	// 1. Adresses empoisonnées par CRLF -> rejetées avant toute émission SMTP.
	poisonedCases := []struct {
		name string
		from string
		msg  EmailMessage
	}{
		{
			name: "from avec injection Bcc",
			from: "News <news@qoe.fi>\r\nBcc: spy@evil.com",
			msg:  EmailMessage{To: "reader@example.com", Subject: "Hi", HTML: "<p>Hi</p>"},
		},
		{
			name: "to avec injection Cc",
			from: "News <news@qoe.fi>",
			msg:  EmailMessage{To: "reader@example.com\r\nCc: evil@attacker.com", Subject: "Hi", HTML: "<p>Hi</p>"},
		},
		{
			name: "reply-to avec injection",
			from: "News <news@qoe.fi>",
			msg:  EmailMessage{To: "reader@example.com", ReplyTo: "reply@qoe.fi\r\nX-Injected: yes", Subject: "Hi", HTML: "<p>Hi</p>"},
		},
	}
	for _, tc := range poisonedCases {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := renderSMTPMessage(tc.from, tc.msg); err == nil {
				t.Fatalf("attendu erreur sur adresse empoisonnée (%s)", tc.name)
			}
		})
	}

	// 2. Sujet/ListID/RefID/Unsubscribe avec CRLF neutralisés, et RFC 8058 + bulk présents.
	raw, err := renderSMTPMessage("News <news@qoe.fi>", EmailMessage{
		To:              "subscriber@example.com",
		Subject:         "Exclusive\r\nInjected-Header: evil",
		ReplyTo:         "reply@qoe.fi",
		ListID:          "gazette.qoe.fi\r\nX-Evil: 1",
		RefID:           "ref-123\r\nBcc: evil@attacker.com",
		ListUnsubscribe: "https://api.qoe.fi/unsub?token=abc",
		MessageType:     "creator.newsletter",
		IsBulk:          true,
		HTML:            "<p>Contenu</p>",
	})
	if err != nil {
		t.Fatalf("renderSMTPMessage inattendu: %v", err)
	}

	for _, line := range strings.Split(raw, "\r\n") {
		if strings.HasPrefix(line, "Bcc:") || strings.HasPrefix(line, "Cc:") ||
			strings.HasPrefix(line, "Injected-Header:") || strings.HasPrefix(line, "X-Evil:") {
			t.Fatalf("Injection d'en-tête détectée sur la ligne: %q", line)
		}
	}

	parsed, err := mail.ReadMessage(strings.NewReader(raw))
	if err != nil {
		t.Fatalf("mail.ReadMessage failed: %v", err)
	}
	if parsed.Header.Get("List-Unsubscribe-Post") != "List-Unsubscribe=One-Click" {
		t.Errorf("List-Unsubscribe-Post = %q", parsed.Header.Get("List-Unsubscribe-Post"))
	}
	if !strings.Contains(parsed.Header.Get("List-Unsubscribe"), "https://api.qoe.fi/unsub?token=abc") {
		t.Errorf("List-Unsubscribe = %q", parsed.Header.Get("List-Unsubscribe"))
	}
	if parsed.Header.Get("Precedence") != "bulk" {
		t.Errorf("Precedence = %q, attendu bulk", parsed.Header.Get("Precedence"))
	}
	if parsed.Header.Get("X-Qoefi-Message-Type") != "creator.newsletter" {
		t.Errorf("X-Qoefi-Message-Type = %q", parsed.Header.Get("X-Qoefi-Message-Type"))
	}
}

func TestBuildGoMailMessage_LongUTF8SubjectFolding(t *testing.T) {
	// Régression R28 : un sujet UTF-8 > 80 caractères avec accents français et emoji
	// doit être replié selon RFC 2047 (chaque ligne brute ≤ 78 chars) et décodé à l'identique.
	longSubject := "Édition spéciale d'automne : réinventer l'expérience éditoriale et les lettres à l'ère numérique 🚀"
	raw, err := renderSMTPMessage("Éphémeris éditions <news@qoe.fi>", EmailMessage{
		To:      "lecteur@example.com",
		Subject: longSubject,
		Text:    "Version texte accentuée à lire.",
		HTML:    "<p>Version <strong>HTML</strong> accentuée à lire.</p>",
	})
	if err != nil {
		t.Fatalf("renderSMTPMessage: %v", err)
	}

	parsed, err := mail.ReadMessage(strings.NewReader(raw))
	if err != nil {
		t.Fatalf("mail.ReadMessage: %v", err)
	}
	decodedSubject, err := new(mime.WordDecoder).DecodeHeader(parsed.Header.Get("Subject"))
	if err != nil {
		t.Fatalf("DecodeHeader(Subject): %v (brut: %q)", err, parsed.Header.Get("Subject"))
	}
	if decodedSubject != longSubject {
		t.Errorf("sujet décodé = %q, attendu %q", decodedSubject, longSubject)
	}

	// Vérifier qu'aucune ligne brute d'en-tête RFC 5322 ne dépasse 78 caractères.
	headerSection := strings.SplitN(raw, "\r\n\r\n", 2)[0]
	for _, line := range strings.Split(headerSection, "\r\n") {
		if len(line) > 78 {
			t.Errorf("ligne d'en-tête trop longue (%d > 78) — repli RFC 2047 manquant: %q", len(line), line)
		}
	}
}

func TestCleanEnvelopeAddress(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"relay@qoe.fi", "relay@qoe.fi"},
		{"<relay@qoe.fi>", "relay@qoe.fi"},
		{"Publisher Name <relay@qoe.fi>", "relay@qoe.fi"},
		{"  Qoe.fi Platform  <noreply@qoe.fi> ", "noreply@qoe.fi"},
		{"\"Quotes, In Name\" <user@test.org>", "user@test.org"},
		{"L'Assez <>", ""},
		{"<>", ""},
		{"", ""},
		{"NoAtSign", ""},
		{"L'Assez <invalid>", ""},
	}
	for _, tt := range tests {
		got := cleanEnvelopeAddress(tt.input)
		if got != tt.want {
			t.Errorf("cleanEnvelopeAddress(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestBuildSMTPMessage_ContentTypeInHeaders(t *testing.T) {
	cases := []struct {
		name     string
		msg      EmailMessage
		wantPref string
	}{
		{
			name: "multipart alternative avec texte et html",
			msg: EmailMessage{
				To:      "reader@example.com",
				Subject: "Bienvenue chez Ephe",
				Text:    "Bienvenue chez Ephe",
				HTML:    "<p>Bienvenue chez Ephe</p>",
			},
			wantPref: "multipart/alternative;",
		},
		{
			name: "html seul sans texte",
			msg: EmailMessage{
				To:      "reader@example.com",
				Subject: "Test HTML",
				HTML:    "<p>Bonjour</p>",
			},
			wantPref: "text/html;",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			raw, err := renderSMTPMessage("Ephe <news@qoe.fi>", tc.msg)
			if err != nil {
				t.Fatalf("renderSMTPMessage: %v", err)
			}
			parsed, err := mail.ReadMessage(strings.NewReader(raw))
			if err != nil {
				t.Fatalf("mail.ReadMessage failed: %v", err)
			}
			ct := parsed.Header.Get("Content-Type")
			if !strings.HasPrefix(ct, tc.wantPref) {
				t.Fatalf("Content-Type header = %q, want prefix %q (corps reçu au lieu d'en-tête)", ct, tc.wantPref)
			}
			bodyBytes, err := io.ReadAll(parsed.Body)
			if err != nil {
				t.Fatalf("read body: %v", err)
			}
			if strings.HasPrefix(string(bodyBytes), "Content-Type:") {
				t.Fatalf("Content-Type leaked into body:\n%s", string(bodyBytes))
			}
		})
	}
}

func TestSMTPClientOptions_TLSPolicies(t *testing.T) {
	// Relais local sans AUTH -> NoTLS sur port 1025
	local := NewSMTPProvider(SMTPConfig{Host: "127.0.0.1", Port: 1025})
	cLocal, err := gomail.NewClient(local.cfg.Host, local.clientOptions()...)
	if err != nil {
		t.Fatalf("NewClient local: %v", err)
	}
	if cLocal.TLSPolicy() != gomail.NoTLS.String() {
		t.Errorf("local TLSPolicy = %v, attendu NoTLS", cLocal.TLSPolicy())
	}

	// Relais externe authentifié STARTTLS -> TLSMandatory sur port 587
	ext := NewSMTPProvider(SMTPConfig{Host: "smtp.hostinger.com", Port: 587, User: "u", Pass: "p"})
	cExt, err := gomail.NewClient(ext.cfg.Host, ext.clientOptions()...)
	if err != nil {
		t.Fatalf("NewClient ext: %v", err)
	}
	if cExt.TLSPolicy() != gomail.TLSMandatory.String() {
		t.Errorf("ext TLSPolicy = %v, attendu TLSMandatory", cExt.TLSPolicy())
	}

	// Pont Docker authentifié non-SSL -> TLSOpportunistic
	docker := NewSMTPProvider(SMTPConfig{Host: "host.docker.internal", Port: 587, User: "u", Pass: "p"})
	cDocker, err := gomail.NewClient(docker.cfg.Host, docker.clientOptions()...)
	if err != nil {
		t.Fatalf("NewClient docker: %v", err)
	}
	if cDocker.TLSPolicy() != gomail.TLSOpportunistic.String() {
		t.Errorf("docker TLSPolicy = %v, attendu TLSOpportunistic", cDocker.TLSPolicy())
	}
}
