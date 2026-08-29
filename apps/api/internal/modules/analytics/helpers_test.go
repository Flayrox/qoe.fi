package analytics

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
)

func TestParseSince(t *testing.T) {
	// Périodes.
	for _, p := range []string{"24h", "7d", "90d", "30d", ""} {
		r := httptest.NewRequest("GET", "/?period="+p, nil)
		s := parseSince(r)
		if s == nil {
			t.Fatalf("period=%q → nil, attendu une date", p)
		}
	}
	// all → nil.
	if s := parseSince(httptest.NewRequest("GET", "/?period=all", nil)); s != nil {
		t.Fatalf("all → %v, attendu nil", s)
	}
	// Période inconnue → défaut 30j.
	if s := parseSince(httptest.NewRequest("GET", "/?period=bogus", nil)); s == nil {
		t.Fatal("bogus → nil, attendu défaut")
	}
	// startAt (epoch ms) prioritaire.
	r := httptest.NewRequest("GET", "/?startAt=1700000000000", nil)
	s := parseSince(r)
	want := time.UnixMilli(1700000000000)
	if s == nil || !s.Equal(want) {
		t.Fatalf("startAt → %v, attendu %v", s, want)
	}
	// startAt invalide → ignoré (period vide → 30j).
	if s := parseSince(httptest.NewRequest("GET", "/?startAt=abc", nil)); s == nil {
		t.Fatal("startAt invalide → nil inattendu")
	}
}

func TestParsePeriod(t *testing.T) {
	now := time.Now().UnixMilli()
	start, end := parsePeriod(httptest.NewRequest("GET", "/", nil))
	if end < now || end-now > 5000 || end-start <= 0 {
		t.Fatalf("défaut start/end = %d/%d (now=%d)", start, end, now)
	}
	r := httptest.NewRequest("GET", "/?startAt=1000&endAt=2000", nil)
	s, e := parsePeriod(r)
	if s != 1000 || e != 2000 {
		t.Fatalf("explicite = %d/%d, attendu 1000/2000", s, e)
	}
	// endAt invalide (< start) → ignoré → défaut, startAt gardé.
	r = httptest.NewRequest("GET", "/?startAt=3000&endAt=abc", nil)
	s, e = parsePeriod(r)
	if s != 3000 || e <= 3000 {
		t.Fatalf("endAt invalide = %d/%d, attendu start 3000 et end>start", s, e)
	}
}

func TestRound2AndTextPtr(t *testing.T) {
	if round2(3.14159) != 3.14 {
		t.Errorf("round2(3.14159) = %v", round2(3.14159))
	}
	if round2(2.999) != 3.0 {
		t.Errorf("round2(2.999) = %v", round2(2.999))
	}
	if v := textPtr(pgtype.Text{}); v != nil {
		t.Errorf("textPtr invalid = %v", *v)
	}
	if v := textPtr(pgtype.Text{String: "x", Valid: true}); v == nil || *v != "x" {
		t.Errorf("textPtr valid = %v", v)
	}
}