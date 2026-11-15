package ai

import (
	"context"
	"strings"
	"testing"
)

func TestSplitTitleSuggestions(t *testing.T) {
	out := "1. La lisière des données\n- Ce que la forêt nous apprend\n• Un autre titre\n4) Dernier titre\n"
	got := splitTitleSuggestions(out)
	want := []string{
		"La lisière des données",
		"Ce que la forêt nous apprend",
		"Un autre titre",
		"Dernier titre",
	}
	if len(got) != len(want) {
		t.Fatalf("got %d suggestions, want %d: %#v", len(got), len(want), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("suggestion %d = %q, want %q", i, got[i], want[i])
		}
	}
}

func TestEditorAssistValidatesBeforeGate(t *testing.T) {
	svc := NewService(nil, nil)
	if _, err := svc.EditorAssist(context.Background(), "user-1", "image", "texte", "", "fr"); err == nil {
		t.Fatal("une tâche inconnue doit être refusée")
	}
	if _, err := svc.EditorAssist(context.Background(), "user-1", "title", "   ", "", "fr"); err == nil {
		t.Fatal("un texte vide doit être refusé")
	}
}

func TestEditorAssistPromptKeepsContext(t *testing.T) {
	system, user := editorAssistPrompt("fr", "seo", "Mon titre", "Le corps de l'article")
	if !strings.Contains(system, "méta description") {
		t.Fatalf("prompt SEO inattendu: %q", system)
	}
	if !strings.Contains(user, "Mon titre") || !strings.Contains(user, "Le corps") {
		t.Fatalf("le contexte manque: %q", user)
	}
}
