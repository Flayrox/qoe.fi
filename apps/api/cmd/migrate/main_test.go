package main

import (
	"strings"
	"testing"
)

func TestIsDestructive(t *testing.T) {
	for _, c := range []string{"down", "down-to"} {
		if !isDestructive(c) {
			t.Fatalf("%q doit être destructif", c)
		}
	}
	for _, c := range []string{"up", "up-to", "status", "version", ""} {
		if isDestructive(c) {
			t.Fatalf("%q ne doit pas être destructif", c)
		}
	}
}

func TestMustVersion(t *testing.T) {
	if got := mustVersion("42"); got != 42 {
		t.Fatalf("mustVersion(42) = %d, attendu 42", got)
	}
	if got := mustVersion("0"); got != 0 {
		t.Fatalf("mustVersion(0) = %d, attendu 0", got)
	}
}

func TestMustVersionInvalid(t *testing.T) {
	// log.Fatalf → os.Exit ; on capture via re-exec est lourd, on vérifie juste
	// que le parse échoue pour des entrées non numériques (le Fatal est
	// couvert par la logique ParseInt).
	for _, v := range []string{"abc", "", "-", "1.5"} {
		if _, err := parseVersion(v); err == nil {
			t.Fatalf("parseVersion(%q) attendu une erreur", v)
		}
	}
}

func TestValidateDestructiveDatabase(t *testing.T) {
	// Base *_test → OK (insensible à la casse du suffixe ? non : suffixe exact).
	if err := validateDestructiveDatabase("postgres://u:p@localhost:5432/qoe_test"); err != nil {
		t.Fatalf("qoe_test: %v", err)
	}
	if err := validateDestructiveDatabase("postgres://u:p@localhost:5432/My_Test"); err != nil {
		t.Fatalf("My_Test: %v", err)
	}
	// Base de dev → refusée.
	err := validateDestructiveDatabase("postgres://u:p@localhost:5432/qoe_dev")
	if err == nil || !strings.Contains(err.Error(), "qoe_dev") {
		t.Fatalf("qoe_dev attendu refus: %v", err)
	}
	// DSN invalide.
	if err := validateDestructiveDatabase("://pas-un-dsn"); err == nil {
		t.Fatal("DSN invalide attendu erreur")
	}
	// Sans nom de base.
	if err := validateDestructiveDatabase("postgres://u:p@localhost:5432/"); err == nil {
		t.Fatal("base vide attendu erreur")
	}
}
