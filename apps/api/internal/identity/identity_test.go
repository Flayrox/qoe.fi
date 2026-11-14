package identity

import "testing"

func TestFromPublisherType(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{Media, Media},
		{Personal, Personal},
		{"", Personal},
		{"OTHER", Personal},
		{"media", Personal},
	}
	for _, tc := range cases {
		if got := FromPublisherType(tc.in); got != tc.want {
			t.Errorf("FromPublisherType(%q) = %q, attendu %q", tc.in, got, tc.want)
		}
	}
}
