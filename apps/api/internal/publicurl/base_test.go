package publicurl

import "testing"

func TestBase(t *testing.T) {
	cases := []struct {
		name string
		env  string
		want string
	}{
		{"défaut sans variable", "", DefaultBase},
		{"surcharge self-host", "http://localhost:8080", "http://localhost:8080"},
		{"slash final retiré", "https://staging.qoe.fi/", "https://staging.qoe.fi"},
		{"espaces parasites ignorés", "  https://staging.qoe.fi/  ", "https://staging.qoe.fi"},
		{"espaces seuls = défaut", "   ", DefaultBase},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("QOE_CONFIRM_BASE_URL", tc.env)
			if got := Base(); got != tc.want {
				t.Fatalf("Base() = %q, attendu %q", got, tc.want)
			}
		})
	}
}
