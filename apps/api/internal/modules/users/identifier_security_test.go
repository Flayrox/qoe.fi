package users

import "testing"

func TestSafeProvisionedUsernameRejectsClaimInjectionAndReservedNames(t *testing.T) {
	cases := []struct {
		name, email, claim, want string
	}{
		{"reserved claim falls back to email", "alice@example.test", "admin", "alice"},
		{"script claim is stripped to a safe identifier", "bob@example.test", "<script>alert(1)</script>", "scriptalert1script"},
		{"email fallback is normalized", "Jane.Doe+tag@example.test", "", "aneoetag"},
		{"missing values use safe fallback", "", "!!!", "user"},
		{"valid claim is kept", "ignored@example.test", "@valid_name", "valid_name"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := safeProvisionedUsername(tc.email, tc.claim); got != tc.want {
				t.Fatalf("safeProvisionedUsername(%q,%q)=%q, want %q", tc.email, tc.claim, got, tc.want)
			}
		})
	}
}
