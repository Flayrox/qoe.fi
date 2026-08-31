package workers

import (
	"context"
	"errors"
	"strings"
	"testing"
)

// stubEmailProvider enregistre les messages envoyés (ou échoue selon err).
type stubEmailProvider struct {
	name string
	err  error
	sent []EmailMessage
}

func (s *stubEmailProvider) Name() string { return s.name }

func (s *stubEmailProvider) Send(_ context.Context, m EmailMessage) error {
	s.sent = append(s.sent, m)
	return s.err
}

// seedEmailDeliveryFixtures pose 2 users, 1 notification et 1 livraison QUEUED.
func seedEmailDeliveryFixtures(t *testing.T, deliveryID, notifType string) {
	t.Helper()
	ctx := context.Background()
	if _, err := poolTest.Exec(ctx, `TRUNCATE TABLE "NotificationDelivery", "Notification", "User" CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	for _, u := range []struct{ id, email string }{
		{"10000000-0000-0000-0000-0000000000e1", "reader@test.dev"},
		{"10000000-0000-0000-0000-0000000000e2", "sender@test.dev"},
	} {
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "User" (id, email, name, role, "createdAt", "updatedAt")
			 VALUES ($1, $2, $2, 'user', now(), now())`, u.id, u.email); err != nil {
			t.Fatalf("user: %v", err)
		}
	}
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "Notification" (id, "recipientId", "senderId", type, "createdAt")
		VALUES ('notif_email_1', $1, $2, $3::"NotificationType", now())`,
		"10000000-0000-0000-0000-0000000000e1",
		"10000000-0000-0000-0000-0000000000e2", notifType); err != nil {
		t.Fatalf("notification: %v", err)
	}
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "NotificationDelivery" (id, "notificationId", channel, status, recipient, attempts, "availableAt", "dedupeKey", "createdAt", "updatedAt")
		VALUES ($1, 'notif_email_1', 'EMAIL', 'QUEUED', 'reader@test.dev', 0, now() - interval '1 hour', $2, now(), now())`,
		deliveryID, deliveryID+":EMAIL"); err != nil {
		t.Fatalf("delivery: %v", err)
	}
}

func TestEmailDelivery_DrainSendsAndMarksSent(t *testing.T) {
	seedEmailDeliveryFixtures(t, "del_email_ok", "LIKE")

	stub := &stubEmailProvider{name: "stub"}
	sent, failed, err := drainNotificationEmailOutboxOnce(context.Background(), poolTest, stub, "noreply@qoe.fi", 50)
	if err != nil {
		t.Fatalf("drain: %v", err)
	}
	if sent != 1 || failed != 0 {
		t.Fatalf("sent=%d failed=%d, attendu 1/0", sent, failed)
	}
	if len(stub.sent) != 1 || stub.sent[0].To != "reader@test.dev" {
		t.Fatalf("messages envoyés: %+v", stub.sent)
	}
	if stub.sent[0].Subject == "" || !strings.Contains(stub.sent[0].Subject, "qoe.fi") {
		t.Errorf("sujet inattendu: %q", stub.sent[0].Subject)
	}

	var status, provider, lastError string
	if err := poolTest.QueryRow(context.Background(),
		`SELECT status, provider, "lastError" FROM "NotificationDelivery" WHERE id = 'del_email_ok'`).
		Scan(&status, &provider, &lastError); err != nil {
		t.Fatal(err)
	}
	if status != "SENT" || provider != "stub" || lastError != "" {
		t.Fatalf("statut=%s provider=%s lastError=%q, attendu SENT/stub/''", status, provider, lastError)
	}
}

func TestEmailDelivery_DrainMarksFailedOnProviderError(t *testing.T) {
	seedEmailDeliveryFixtures(t, "del_email_fail", "FOLLOW")

	stub := &stubEmailProvider{name: "stub", err: errors.New("smtp 550")}
	sent, failed, err := drainNotificationEmailOutboxOnce(context.Background(), poolTest, stub, "noreply@qoe.fi", 50)
	if err != nil {
		t.Fatalf("drain: %v", err)
	}
	if sent != 0 || failed != 1 {
		t.Fatalf("sent=%d failed=%d, attendu 0/1", sent, failed)
	}

	var status, lastError string
	if err := poolTest.QueryRow(context.Background(),
		`SELECT status, "lastError" FROM "NotificationDelivery" WHERE id = 'del_email_fail'`).
		Scan(&status, &lastError); err != nil {
		t.Fatal(err)
	}
	if status != "FAILED" || lastError != "smtp 550" {
		t.Fatalf("statut=%s lastError=%q, attendu FAILED/smtp 550", status, lastError)
	}
}

func TestEmailDelivery_DrainSkipsFutureAndDisabledWithoutProvider(t *testing.T) {
	seedEmailDeliveryFixtures(t, "del_email_future", "REPLY")
	// Une livraison pas encore disponible (availableAt dans le futur) ne part pas.
	if _, err := poolTest.Exec(context.Background(),
		`UPDATE "NotificationDelivery" SET "availableAt" = now() + interval '1 hour' WHERE id = 'del_email_future'`); err != nil {
		t.Fatal(err)
	}
	stub := &stubEmailProvider{name: "stub"}
	if sent, failed, err := drainNotificationEmailOutboxOnce(context.Background(), poolTest, stub, "", 50); err != nil || sent != 0 || failed != 0 {
		t.Fatalf("drain futur: sent=%d failed=%d err=%v, attendu 0/0/nil", sent, failed, err)
	}
	// Sans provider : no-op.
	seedEmailDeliveryFixtures(t, "del_email_noprov", "MENTION")
	if sent, failed, err := drainNotificationEmailOutboxOnce(context.Background(), poolTest, nil, "", 50); err != nil || sent != 0 || failed != 0 {
		t.Fatalf("drain sans provider: sent=%d failed=%d err=%v, attendu 0/0/nil", sent, failed, err)
	}
}

