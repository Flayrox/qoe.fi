package ai

// Provider (fiche Plus P1) : sans configuration → désactivé (503 explicite),
// jamais de génération inventée. Pur, sans base.

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/qoefi/api/internal/observability"
	"github.com/qoefi/api/internal/resilience"
)

func TestNewProvider_DisabledByDefault(t *testing.T) {
	t.Setenv("AI_PROVIDER", "")
	t.Setenv("AI_API_KEY", "")
	p := NewProvider()
	if p.Name() != "disabled" {
		t.Fatalf("sans config : provider disabled attendu, obtenu %s", p.Name())
	}
	if _, err := p.Generate(context.Background(), Request{User: "x"}); err == nil {
		t.Fatal("disabled : erreur attendue (jamais de faux contenu)")
	}
}

func TestNewProvider_RequiresKey(t *testing.T) {
	t.Setenv("AI_PROVIDER", "openai-compatible")
	t.Setenv("AI_API_KEY", "")
	if p := NewProvider(); p.Name() != "disabled" {
		t.Fatalf("sans clé : disabled attendu, obtenu %s", p.Name())
	}
}

func TestNewProvider_OpenAICompatible(t *testing.T) {
	t.Setenv("AI_PROVIDER", "openai-compatible")
	t.Setenv("AI_API_KEY", "sk-test-fausse")
	t.Setenv("AI_MODEL", "")
	p := NewProvider()
	if p.Name() == "disabled" {
		t.Fatal("avec clé : provider réel attendu")
	}
}

func TestOpenAICompatible_CircuitBreaker(t *testing.T) {
	var calls atomic.Int32
	var status atomic.Int32
	status.Store(http.StatusBadRequest)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.WriteHeader(int(status.Load()))
		_, _ = w.Write([]byte(`{"error":"upstream"}`))
	}))
	defer srv.Close()

	p := &openAICompatible{
		key:    "sk-test",
		model:  "gpt-test",
		base:   srv.URL,
		client: srv.Client(),
		cb: resilience.NewCircuitBreaker(resilience.Options{
			Name:             "test-openai",
			FailureThreshold: 2,
			Cooldown:         time.Minute,
			CallTimeout:      time.Second,
			Registry:         observability.NewRegistry(),
		}),
	}

	// Erreurs 400 ne déclenchent pas le disjoncteur.
	for i := 0; i < 3; i++ {
		if _, err := p.Generate(context.Background(), Request{User: "hi"}); err == nil {
			t.Fatal("erreur 400 attendue")
		}
	}
	if p.cb.State() != resilience.StateClosed {
		t.Fatalf("400 ne doit pas ouvrir le circuit (state=%s)", p.cb.State())
	}

	// Erreurs 500 répétés -> ouverture puis court-circuit immédiat.
	status.Store(http.StatusInternalServerError)
	_, _ = p.Generate(context.Background(), Request{User: "hi"})
	_, _ = p.Generate(context.Background(), Request{User: "hi"})
	callsBefore := calls.Load()
	_, err := p.Generate(context.Background(), Request{User: "hi"})
	if !errors.Is(err, resilience.ErrCircuitOpen) {
		t.Fatalf("3e 500 attendu ErrCircuitOpen, obtenu %v", err)
	}
	if calls.Load() != callsBefore {
		t.Fatal("aucun appel réseau attendu quand le circuit est ouvert")
	}
}
