package ai

// Provider (fiche Plus P1) : sans configuration → désactivé (503 explicite),
// jamais de génération inventée. Pur, sans base.

import (
	"context"
	"testing"
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
