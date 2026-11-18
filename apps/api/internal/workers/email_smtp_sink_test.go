package workers

// =====================================================================
// 📬 SMTP de dev — preuve de bout en bout sur le puits local
// =====================================================================
// Test opt-in : il faut `pnpm mail:dev` (127.0.0.1:1025, écrit chaque
// message en `.eml` dans `.mail-outbox/`). Il vérifie le VRAI chemin SMTP
// (EHLO, MAIL FROM/RCPT TO, DATA) et pas seulement le format du message :
// c'est ce qui distingue « le mailer compile » de « l'e-mail part ».
//
//   pnpm mail:dev                       # terminal 1
//   SMTP_SINK=1 go test ./internal/workers -run TestSMTPProvider_LocalSink -v
//
// Le test est ignoré sans SMTP_SINK=1 : aucune dépendance à un service
// externe dans la CI, aucun port à ouvrir.
// =====================================================================

import (
	"context"
	"mime"
	"net/mail"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestSMTPProvider_LocalSink(t *testing.T) {
	if os.Getenv("SMTP_SINK") != "1" {
		t.Skip("SMTP_SINK=1 requis (pnpm mail:dev écoute sur 127.0.0.1:1025)")
	}

	// cwd = apps/api/internal/workers → racine du monorepo à 4 niveaux.
	outbox := os.Getenv("SMTP_DEV_OUTBOX")
	if outbox == "" {
		outbox = filepath.Join("..", "..", "..", "..", ".mail-outbox")
	}

	provider := NewSMTPProvider(SMTPConfig{
		Host: "127.0.0.1",
		Port: 1025,
		From: "Qoe <noreply@qoe.test>",
		// User vide : relais local sans AUTH (cf. AGENTS.md), donc aucun TLS.
	})

	marker := "sink-" + time.Now().Format("20060102-150405.000000")
	msg := EmailMessage{
		From:    "Qoe <noreply@qoe.test>",
		To:      "lecteur@example.test",
		Subject: "Vérification SMTP " + marker,
		HTML:    "<p>Bonjour <strong>lecteur</strong>.</p>",
		Text:    "Bonjour lecteur.",
	}

	if err := provider.Send(context.Background(), msg); err != nil {
		t.Fatalf("envoi SMTP vers le puits: %v", err)
	}

	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		entries, err := os.ReadDir(outbox)
		if err != nil {
			t.Fatalf("lecture du puits %s: %v", outbox, err)
		}
		for _, entry := range entries {
			if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".eml") {
				continue
			}
			raw, err := os.ReadFile(filepath.Join(outbox, entry.Name()))
			if err != nil {
				continue
			}
			body := string(raw)
			parsed, err := mail.ReadMessage(strings.NewReader(body))
			if err != nil {
				continue
			}
			// Le sujet est encodé RFC 2047 (=?UTF-8?B?…?=) : on le décode
			// au lieu de chercher le marqueur dans le brut (le premier jet
			// échouait pour cette raison, pas pour un problème d'envoi).
			subject, err := new(mime.WordDecoder).DecodeHeader(parsed.Header.Get("Subject"))
			if err != nil || !strings.Contains(subject, marker) {
				continue
			}
			// Le contenu doit être celui qu'on a envoyé, pas seulement l'enveloppe.
			if !strings.Contains(parsed.Header.Get("To"), "lecteur@example.test") {
				t.Fatalf("message %s : To = %q", entry.Name(), parsed.Header.Get("To"))
			}
			if !strings.Contains(strings.ToLower(body), "bonjour") {
				t.Fatalf("message %s sans corps", entry.Name())
			}
			return
		}
		time.Sleep(200 * time.Millisecond)
	}
	t.Fatalf("aucun .eml contenant %q dans %s après 10s", marker, outbox)
}
