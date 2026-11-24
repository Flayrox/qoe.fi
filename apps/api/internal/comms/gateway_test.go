package comms

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/qoefi/api/internal/observability"
	"github.com/qoefi/api/internal/resilience"
)

type stubTransport struct {
	name  string
	calls []Message
	err   error
	fn    func(ctx context.Context, msg Message) error
}

func (s *stubTransport) Name() string {
	if s.name == "" {
		return "stub"
	}
	return s.name
}

func (s *stubTransport) Send(ctx context.Context, msg Message) error {
	s.calls = append(s.calls, msg)
	if s.fn != nil {
		return s.fn(ctx, msg)
	}
	return s.err
}

func TestWrapTransport_NilReturnsUntypedNilInterface(t *testing.T) {
	tr := WrapTransport(nil, nil, "noreply@qoe.fi")
	if tr != nil {
		t.Fatalf("WrapTransport(nil, nil, ...) = %T, attendu nil sans typed-nil", tr)
	}
}

func TestGateway_ListSuppressed_SkipsTransportAndCountsMetric(t *testing.T) {
	for _, tc := range []struct {
		name  string
		state SuppressionState
	}{
		{name: "global", state: SuppressionState{Global: true}},
		{name: "publisher", state: SuppressionState{Publisher: true}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			tr := &stubTransport{name: "smtp"}
			gw := NewGateway(nil, tr, "noreply@qoe.fi")
			reg := observability.NewRegistry()
			gw.metrics = reg
			gw.suppressFn = func(context.Context, string, string) (SuppressionState, error) {
				return tc.state, nil
			}

			err := gw.Dispatch(context.Background(), Message{
				To:          "Lecteur <blocked@example.com>",
				Subject:     "Édition",
				HTML:        "<p>Hi</p>",
				MessageType: "creator.newsletter",
				PublisherID: "pub-1",
				IsBulk:      true,
			})
			if err != nil {
				t.Fatalf("Dispatch inattendu: %v", err)
			}
			if len(tr.calls) != 0 {
				t.Fatalf("transport appelé %d fois pour un destinataire supprimé", len(tr.calls))
			}
			rendered := reg.Render()
			wantMetric := `qoe_email_dispatches_total{message_type="creator.newsletter",provider="smtp",outcome="suppressed"} 1`
			if !strings.Contains(rendered, wantMetric) {
				t.Fatalf("métrique attendue absente: %s\nrendu:\n%s", wantMetric, rendered)
			}
		})
	}
}

func TestGateway_SecurityAndServiceNeverSuppressed(t *testing.T) {
	for _, msgType := range []string{"auth.code", "security.alert", "legal.version_notice", "subscriber.confirm"} {
		t.Run(msgType, func(t *testing.T) {
			tr := &stubTransport{name: "smtp"}
			gw := NewGateway(nil, tr, "noreply@qoe.fi")
			reg := observability.NewRegistry()
			gw.metrics = reg
			lookupCalled := false
			gw.suppressFn = func(context.Context, string, string) (SuppressionState, error) {
				lookupCalled = true
				return SuppressionState{Global: true, Publisher: true}, nil
			}

			err := gw.Dispatch(context.Background(), Message{
				To:          "user@example.com",
				Subject:     "Action critique",
				HTML:        "<p>OK</p>",
				MessageType: msgType,
			})
			if err != nil {
				t.Fatalf("Dispatch(%s): %v", msgType, err)
			}
			if lookupCalled {
				t.Fatalf("LookupSuppression consulté pour %s (ne doit jamais être neutralisé)", msgType)
			}
			if len(tr.calls) != 1 {
				t.Fatalf("transport non appelé pour %s", msgType)
			}
			if tr.calls[0].From != "noreply@qoe.fi" {
				t.Errorf("defaultFrom non appliqué : %q", tr.calls[0].From)
			}
		})
	}
}

func TestGateway_PermanentBounceRecordedWithoutTrippingBreaker(t *testing.T) {
	tr := &stubTransport{
		name: "smtp",
		err:  errors.New("smtp: send failed: 550 5.1.1 User unknown"),
	}
	gw := NewGateway(nil, tr, "noreply@qoe.fi")
	reg := observability.NewRegistry()
	gw.metrics = reg

	var recorded []struct{ email, reason, source string }
	gw.recordBncFn = func(_ context.Context, email, reason, source string) error {
		recorded = append(recorded, struct{ email, reason, source string }{email, reason, source})
		return nil
	}

	// 6 bounces permanents successifs > FailureThreshold (5) : le circuit doit rester fermé.
	for i := 0; i < 6; i++ {
		err := gw.Dispatch(context.Background(), Message{
			To:          "Ghost <Bounced@Example.com>",
			Subject:     "Ping",
			HTML:        "<p>Ping</p>",
			MessageType: "creator.newsletter",
		})
		if err == nil || errors.Is(err, resilience.ErrCircuitOpen) {
			t.Fatalf("itération %d : attendu erreur 550 directe, reçu %v", i, err)
		}
	}

	if len(tr.calls) != 6 {
		t.Fatalf("transport calls = %d, attendu 6 (le circuit ne doit pas s'ouvrir sur 5xx)", len(tr.calls))
	}
	if len(recorded) != 6 {
		t.Fatalf("bounces enregistrés = %d, attendu 6", len(recorded))
	}
	if recorded[0].email != "bounced@example.com" || recorded[0].reason != "hard_bounce" {
		t.Errorf("enregistrement inattendu: %+v", recorded[0])
	}
	wantMetric := `qoe_email_dispatches_total{message_type="creator.newsletter",provider="smtp",outcome="bounced"} 6`
	if !strings.Contains(reg.Render(), wantMetric) {
		t.Fatalf("métrique bounced absente: %s", wantMetric)
	}
}

func TestGateway_TransientErrorsOpenCircuitBreaker(t *testing.T) {
	tr := &stubTransport{
		name: "smtp",
		err:  errors.New("dial tcp 127.0.0.1:587: connect: connection refused"),
	}
	gw := NewGateway(nil, tr, "noreply@qoe.fi")
	reg := observability.NewRegistry()
	gw.metrics = reg

	bounces := 0
	gw.recordBncFn = func(context.Context, string, string, string) error {
		bounces++
		return nil
	}

	// FailureThreshold vaut 5 dans NewGateway : 5 échecs ouvrent le circuit.
	for i := 0; i < 5; i++ {
		err := gw.Dispatch(context.Background(), Message{
			To:          "reader@example.com",
			Subject:     "Test",
			HTML:        "<p>Test</p>",
			MessageType: "subscriber.confirm",
		})
		if err == nil || errors.Is(err, resilience.ErrCircuitOpen) {
			t.Fatalf("échec %d : erreur inattendue %v", i, err)
		}
	}

	// Le 6e appel doit court-circuiter sur ErrCircuitOpen sans appeler le transport.
	err6 := gw.Dispatch(context.Background(), Message{
		To:          "reader@example.com",
		Subject:     "Test",
		HTML:        "<p>Test</p>",
		MessageType: "subscriber.confirm",
	})
	if !errors.Is(err6, resilience.ErrCircuitOpen) {
		t.Fatalf("6e appel = %v, attendu resilience.ErrCircuitOpen", err6)
	}
	if len(tr.calls) != 5 {
		t.Fatalf("transport calls = %d, attendu 5 avant circuit open", len(tr.calls))
	}
	if bounces != 0 {
		t.Fatalf("bounces enregistrés = %d sur panne réseau, attendu 0", bounces)
	}
	wantMetric := `qoe_email_dispatches_total{message_type="subscriber.confirm",provider="smtp",outcome="failed"} 6`
	if !strings.Contains(reg.Render(), wantMetric) {
		t.Fatalf("métrique failed absente: %s\nrendu:\n%s", wantMetric, reg.Render())
	}
}
