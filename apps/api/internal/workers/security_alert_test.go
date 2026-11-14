package workers

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/hibiken/asynq"

	"github.com/qoefi/api/internal/queue"
)

type spyEmailProvider struct {
	sent []EmailMessage
}

func (s *spyEmailProvider) Name() string { return "spy" }

func (s *spyEmailProvider) Send(_ context.Context, msg EmailMessage) error {
	s.sent = append(s.sent, msg)
	return nil
}

func TestSecurityAlertWorker_HandleSecurityAlert(t *testing.T) {
	spy := &spyEmailProvider{}
	w := NewSecurityAlertWorker(nil)
	w.SetEmailProvider(spy, "security@qoe.fi")

	cases := []struct {
		name      string
		payload   queue.SecurityAlertEmailPayload
		wantSubj  string
		wantInMsg string
	}{
		{
			name: "nouvelle connexion",
			payload: queue.SecurityAlertEmailPayload{
				UserID:    "00000000-0000-0000-0000-000000000001",
				Email:     "creator@example.com",
				EventType: "login_new_device",
				IPSubnet:  "198.51.100.0/24",
				UserAgent: "Mozilla/5.0",
				Occurred:  "2026-11-14T20:00:00Z",
			},
			wantSubj:  "Nouvelle connexion",
			wantInMsg: "198.51.100.0/24",
		},
		{
			name: "quarantaine cle api",
			payload: queue.SecurityAlertEmailPayload{
				UserID:    "00000000-0000-0000-0000-000000000001",
				Email:     "creator@example.com",
				EventType: "api_key_quarantined",
				Reason:    "Pic de publications suspect",
				Occurred:  "2026-11-14T20:05:00Z",
			},
			wantSubj:  "lecture seule",
			wantInMsg: "Pic de publications suspect",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			before := len(spy.sent)
			raw, err := json.Marshal(tc.payload)
			if err != nil {
				t.Fatalf("marshal: %v", err)
			}
			task := asynq.NewTask(queue.TaskSecurityAlertEmail, raw)
			if err := w.HandleSecurityAlert(context.Background(), task); err != nil {
				t.Fatalf("HandleSecurityAlert: %v", err)
			}
			if len(spy.sent) != before+1 {
				t.Fatalf("attendu 1 email envoyé, reçu %d", len(spy.sent)-before)
			}
			msg := spy.sent[len(spy.sent)-1]
			if msg.From != "security@qoe.fi" || msg.To != tc.payload.Email {
				t.Fatalf("en-têtes inattendus: from=%s to=%s", msg.From, msg.To)
			}
			if !strings.Contains(msg.Subject, tc.wantSubj) {
				t.Fatalf("sujet=%q ne contient pas %q", msg.Subject, tc.wantSubj)
			}
			if !strings.Contains(msg.HTML, tc.wantInMsg) || !strings.Contains(msg.Text, tc.wantInMsg) {
				t.Fatalf("corps HTML/Text ne contient pas %q", tc.wantInMsg)
			}
			if msg.IsBulk {
				t.Fatal("une alerte de sécurité ne doit pas être marquée IsBulk")
			}
			if msg.RefID == "" {
				t.Fatal("RefID attendu pour éviter le threading Gmail")
			}
		})
	}
}
