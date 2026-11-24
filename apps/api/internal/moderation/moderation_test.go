package moderation

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/hibiken/asynq"
	"github.com/qoefi/api/internal/observability"
	"github.com/qoefi/api/internal/queue"
	"github.com/qoefi/api/internal/resilience"
	"github.com/qoefi/api/internal/trust"
)

func TestScanFastPath(t *testing.T) {
	if v := ScanFastPath("Bonjour à tous, voici un article de fond."); v.Action != ActionAllow {
		t.Fatalf("texte légitime bloqué/flagué: %+v", v)
	}
	if v := ScanFastPath(""); v.Action != ActionAllow {
		t.Fatalf("texte vide doit être autorisé: %+v", v)
	}
	if v := ScanFastPath("je vais te tuer demain"); !v.Blocked() || v.ReasonCode != "MODERATION_THREAT" {
		t.Fatalf("menace directe doit bloquer: %+v", v)
	}
	// Contournement homoglyphe + leetspeak (h + cyrillique і/t/1/3 + s1eg he1l)
	if v := ScanFastPath("513g h31l"); !v.Blocked() {
		t.Fatalf("leetspeak violent doit bloquer: %+v", v)
	}
	if v := ScanFastPath("s\u200B\u200B\u200B\u200B\u200Bcam claim free airdrop with seed phrase"); v.Action != ActionFlag || !v.AsyncScreen {
		t.Fatalf("arnaque crypto obfusquée doit flaguer pour revue asynchrone: %+v", v)
	}
}

func TestCheckSync_TrustAndSurfaces(t *testing.T) {
	svc := NewService(nil, nil)
	ctx := context.Background()

	// Compte standard avec texte sain : allow sans asynchrone.
	v := svc.CheckSync(ctx, CheckInput{
		Surface:   SurfacePost,
		UserID:    "u1",
		Text:      "Analyse claire et mesurée.",
		TrustTier: trust.TierStandard,
	})
	if v.Blocked() || v.AsyncScreen {
		t.Fatalf("standard sain inattendu: %+v", v)
	}

	// Compte Restricted / Low ou signalement : déclenche revue IA asynchrone.
	for _, tc := range []CheckInput{
		{Surface: SurfaceComment, UserID: "u2", Text: "Texte apparemment anodin", TrustTier: trust.TierRestricted},
		{Surface: SurfaceDM, UserID: "u3", Text: "Message entrant", TrustTier: trust.TierLow},
		{Surface: SurfaceUserReport, UserID: "u4", Text: "Contenu signalé par un lecteur", TrustTier: trust.TierTrusted},
	} {
		got := svc.CheckSync(ctx, tc)
		if !got.AsyncScreen {
			t.Fatalf("revue asynchrone attendue pour %+v, obtenu %+v", tc, got)
		}
	}

	if !strings.Contains(observability.Default().Render(), "qoe_moderation_decisions_total") {
		t.Fatal("métrique qoe_moderation_decisions_total non enregistrée")
	}
}

func TestEnqueueAndScreenAsync_WithOpenAIMockAndBreaker(t *testing.T) {
	mr := miniredis.RunT(t)
	ac := asynq.NewClient(asynq.RedisClientOpt{Addr: mr.Addr()})
	defer ac.Close()

	var status atomic.Int32
	status.Store(http.StatusOK)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if status.Load() != http.StatusOK {
			w.WriteHeader(int(status.Load()))
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"results": [{
				"flagged": true,
				"categories": {"hate": true, "sexual/minors": true},
				"category_scores": {"hate": 0.92, "sexual/minors": 0.99}
			}]
		}`))
	}))
	defer srv.Close()

	svc := NewService(nil, ac)
	svc.SetOpenAIConfig("sk-test-real-key", srv.URL, srv.Client())
	svc.cb = resilience.NewCircuitBreaker(resilience.Options{
		Name:             "test-openai-moderation",
		FailureThreshold: 2,
		Cooldown:         time.Minute,
		CallTimeout:      time.Second,
		Registry:         observability.NewRegistry(),
	})

	svc.EnqueueScreen(CheckInput{Surface: SurfacePost, SubjectID: "p1", UserID: "u1", Text: "test"})

	res, err := svc.ScreenAsync(context.Background(), queue.ModerationScreenPayload{
		Surface:   SurfacePost,
		SubjectID: "p1",
		UserID:    "u1",
		Text:      "contenu problématique",
	})
	if err != nil {
		t.Fatalf("ScreenAsync: %v", err)
	}
	if !res.Flagged || !res.IsCSAM || !res.IsSevereHarm {
		t.Fatalf("résultat CSAM/severe attendu, obtenu %+v", res)
	}

	// Indisponibilité OpenAI -> bascule en mode dégradé fail-open + ouvre le disjoncteur.
	status.Store(http.StatusInternalServerError)
	_, _ = svc.ScreenAsync(context.Background(), queue.ModerationScreenPayload{Surface: SurfacePost, Text: "x"})
	resFail, err := svc.ScreenAsync(context.Background(), queue.ModerationScreenPayload{Surface: SurfacePost, Text: "x"})
	if err != nil || !resFail.DegradedFailOpen {
		t.Fatalf("fail-open dégradé attendu, obtenu %+v err=%v", resFail, err)
	}
	if svc.cb.State() != resilience.StateOpen {
		t.Fatalf("circuit breaker attendu open après 2 pannes 500, obtenu %s", svc.cb.State())
	}

	// Sans clé API active -> skip propre.
	svcNoKey := NewService(nil, nil)
	svcNoKey.SetOpenAIConfig("", srv.URL, srv.Client())
	cleanRes, err := svcNoKey.ScreenAsync(context.Background(), queue.ModerationScreenPayload{Surface: SurfacePost, Text: "texte normal"})
	if err != nil || cleanRes.Flagged {
		t.Fatalf("sans clé API attendu noop propre: %+v err=%v", cleanRes, err)
	}
}
