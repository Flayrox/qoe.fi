package analytics

import "testing"

// TestCanViewAnalytics fixe la parité avec @qoe/auth : un viewer n'obtient
// pas les analytics par défaut, mais un override explicite le peut.
func TestCanViewAnalytics(t *testing.T) {
	cases := []struct {
		name   string
		role   string
		perms  []string
		status string
		want   bool
	}{
		{"owner", "owner", nil, "active", true},
		{"editor", "editor", nil, "active", true},
		{"writer", "writer", nil, "active", false},
		{"viewer", "viewer", nil, "active", false},
		{"viewer override", "viewer", []string{"media:view_analytics"}, "active", true},
		{"editor retiré", "editor", []string{"-media:view_analytics"}, "active", false},
		{"invitation en attente", "viewer", []string{"media:view_analytics"}, "invited", false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := canViewAnalytics(c.role, c.perms, c.status); got != c.want {
				t.Fatalf("canViewAnalytics(%s) = %v, attendu %v", c.name, got, c.want)
			}
		})
	}
}
