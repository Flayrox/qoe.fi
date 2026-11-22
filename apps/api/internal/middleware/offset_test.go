package middleware

import "testing"

func TestParseOffset(t *testing.T) {
	cases := []struct {
		raw     string
		want    int
		wantErr bool
	}{
		{"", 0, false},
		{"0", 0, false},
		{"20", 20, false},
		{" 7 ", 7, false},
		{"-5", 0, false}, // borne basse, jamais de page négative
		{"abc", 0, true},
		{"1.5", 0, true},
	}
	for _, c := range cases {
		got, err := ParseOffset(c.raw)
		if c.wantErr {
			if err == nil {
				t.Fatalf("ParseOffset(%q) = %d, attendu une erreur", c.raw, got)
			}
			continue
		}
		if err != nil || got != c.want {
			t.Fatalf("ParseOffset(%q) = (%d, %v), attendu %d", c.raw, got, err, c.want)
		}
	}
}
