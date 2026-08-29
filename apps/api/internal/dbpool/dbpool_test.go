package dbpool

import (
	"context"
	"strings"
	"testing"
)

func TestNew_EmptyURLError(t *testing.T) {
	_, err := New(context.Background(), "", 5)
	if err == nil {
		t.Fatal("URL vide doit renvoyer une erreur")
	}
	if !strings.Contains(err.Error(), "DATABASE_URL est vide") {
		t.Errorf("message = %q, attendu « DATABASE_URL est vide »", err.Error())
	}
}

func TestNew_InvalidURLError(t *testing.T) {
	_, err := New(context.Background(), "not a valid url \x7f", 5)
	if err == nil {
		t.Fatal("URL invalide doit renvoyer une erreur de parse")
	}
	if !strings.Contains(err.Error(), "parse DATABASE_URL") {
		t.Errorf("erreur = %q, attendu « parse DATABASE_URL »", err.Error())
	}
	// On n'atteint jamais un Ping : l'échec de parse doit être immédiat.
}

func TestNew_EmptyPoolSizeOrDefault(t *testing.T) {
	// poolSize n'est pas validé par New directement (utilisé par pgxpool);
	// on vérifie au moins que la signature accepte 0 sans panique avant le parse.
	_, err := New(context.Background(), "postgres://user:pass@127.0.0.1:1/db?sslmode=disable", 0)
	// Le parse réussit (DSN valide) puis Ping échoue (port 1 fermé). On veut
	// soit une erreur de ping, soit une connexion — mais JAMAIS une erreur
	// « DATABASE_URL est vide » ni de parse.
	if err != nil && strings.Contains(err.Error(), "DATABASE_URL est vide") {
		t.Fatalf("ne doit pas dire URL vide: %v", err)
	}
	if err != nil && strings.Contains(err.Error(), "parse DATABASE_URL") {
		t.Fatalf("DSN valide ne doit pas échouer au parse: %v", err)
	}
}