package apiaccess

import (
	"errors"
	"reflect"
	"testing"
)

func TestRegistryComplete(t *testing.T) {
	// Chaque module a une clé unique, un label et une description.
	seen := map[string]bool{}
	for _, m := range Registry {
		if m.Key == "" || m.Label == "" || m.Description == "" {
			t.Fatalf("module incomplet: %+v", m)
		}
		if seen[m.Key] {
			t.Fatalf("clé de module dupliquée: %s", m.Key)
		}
		seen[m.Key] = true
	}
	if len(ModuleKeys()) != len(Registry) {
		t.Fatalf("ModuleKeys() = %d, attendu %d", len(ModuleKeys()), len(Registry))
	}
}

func TestHasGrant(t *testing.T) {
	grants := []string{"api:read", "webhooks"}
	if !HasGrant(grants, "api:read") {
		t.Fatal("HasGrant(api:read) = false, attendu true")
	}
	if HasGrant(grants, "oauth") {
		t.Fatal("HasGrant(oauth) = true, attendu false")
	}
	if HasGrant(nil, "webhooks") {
		t.Fatal("HasGrant(nil) = true, attendu false")
	}
}

func TestAnyGrant(t *testing.T) {
	if !AnyGrant([]string{"oauth"}, "api:read", "oauth") {
		t.Fatal("AnyGrant = false, attendu true")
	}
	if AnyGrant([]string{"api:write"}, "api:read", "oauth") {
		t.Fatal("AnyGrant = true, attendu false")
	}
}

func TestValidateGrants(t *testing.T) {
	if err := ValidateGrants([]string{"api:read", "webhooks", "oauth"}); err != nil {
		t.Fatalf("ValidateGrants(connus) = %v, attendu nil", err)
	}
	err := ValidateGrants([]string{"api:read", "superuser"})
	if !errors.Is(err, ErrUnknownModule) {
		t.Fatalf("ValidateGrants(inconnu) = %v, attendu ErrUnknownModule", err)
	}
}

func TestNormalizeGrants(t *testing.T) {
	got := NormalizeGrants([]string{"oauth", "api:read", "oauth", "api:read"})
	want := []string{"api:read", "oauth"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("NormalizeGrants = %v, attendu %v", got, want)
	}
}

func TestScopesForGrants(t *testing.T) {
	cases := []struct {
		name   string
		grants []string
		want   []string
	}{
		{"aucun", nil, nil},
		{"lecture seule", []string{"api:read"}, []string{"READ"}},
		{"lecture + écriture", []string{"api:read", "api:write"}, []string{"READ", "WRITE"}},
		{"tout", ModuleKeys(), []string{"READ", "WRITE", "ANALYTICS"}},
		{"oauth ne donne pas de scope API", []string{"oauth", "webhooks"}, nil},
	}
	for _, c := range cases {
		got := ScopesForGrants(c.grants)
		if !reflect.DeepEqual(got, c.want) {
			t.Errorf("%s: ScopesForGrants = %v, attendu %v", c.name, got, c.want)
		}
	}
}
