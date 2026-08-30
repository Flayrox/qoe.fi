package identifier

import "testing"

func TestUsernameValidation(t *testing.T) {
	for _, tc := range []struct {
		value string
		ok    bool
	}{
		{"@Alice_01", true},
		{"a..b", false},
		{"ab", false},
		{"a b", false},
		{"admin", true}, // syntaxiquement valide; denylist vérifiée séparément
		{"x/y", false},
		{"<script>", false},
	} {
		if got := ValidUsername(tc.value); got != tc.ok {
			t.Errorf("ValidUsername(%q)=%v, want %v", tc.value, got, tc.ok)
		}
	}
	if !IsReserved("ADMIN") {
		t.Fatal("reserved names must be case-insensitive")
	}
}

func TestSubdomainValidation(t *testing.T) {
	for _, tc := range []struct {
		value string
		ok    bool
	}{
		{"blog-qoe", true},
		{"a.b", false},
		{"a--b", false},
		{"-bad", false},
		{"bad-", false},
		{"ab", false},
		{"evil<script>", false},
	} {
		if got := ValidSubdomain(tc.value); got != tc.ok {
			t.Errorf("ValidSubdomain(%q)=%v, want %v", tc.value, got, tc.ok)
		}
	}
}
