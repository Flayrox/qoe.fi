package textutil

import "testing"

func TestTruncateUTF8(t *testing.T) {
	cases := []struct {
		in   string
		n    int
		want string
	}{
		{"abc", 10, "abc"},
		{"abc", 0, ""},
		{"abc", -1, ""},
		{"abc", 2, "ab"},
		{"éé", 3, "é"}, // 2 octets par rune : on ne coupe pas au milieu
		{"aé", 2, "a"},
	}
	for _, c := range cases {
		if got := TruncateUTF8(c.in, c.n); got != c.want {
			t.Fatalf("TruncateUTF8(%q, %d) = %q, attendu %q", c.in, c.n, got, c.want)
		}
	}
}
