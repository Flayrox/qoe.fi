package analytics

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
)

func TestParseSince(t *testing.T) {
	// Périodes connues.
	for _, p := range []string{"24h", "7d", "30d", "90d", ""} {
		r := httptest.NewRequest("GET", "/?period="+p, nil)
		s, err := parseSince(r)
		if err != nil || s == nil {
			t.Fatalf("period=%q → (%v, %v), attendu une date", p, s, err)
		}
	}
	// all → nil, sans erreur.
	s, err := parseSince(httptest.NewRequest("GET", "/?period=all", nil))
	if err != nil || s != nil {
		t.Fatalf("all → (%v, %v), attendu (nil, nil)", s, err)
	}
	// Période inconnue → 400 (plus de repli silencieux sur 30j).
	if _, err := parseSince(httptest.NewRequest("GET", "/?period=bogus", nil)); err == nil {
		t.Fatal("period=bogus → err = nil, attendu une erreur")
	}
	// startAt (epoch ms) prioritaire.
	s, err = parseSince(httptest.NewRequest("GET", "/?startAt=1700000000000", nil))
	want := time.UnixMilli(1700000000000)
	if err != nil || s == nil || !s.Equal(want) {
		t.Fatalf("startAt → (%v, %v), attendu %v", s, err, want)
	}
	// startAt illisible → erreur, jamais un repli sur 30j.
	if _, err := parseSince(httptest.NewRequest("GET", "/?startAt=abc", nil)); err == nil {
		t.Fatal("startAt invalide → err = nil, attendu une erreur")
	}
	if _, err := parseSince(httptest.NewRequest("GET", "/?startAt=-5", nil)); err == nil {
		t.Fatal("startAt négatif → err = nil, attendu une erreur")
	}
}

func TestParsePeriod(t *testing.T) {
	now := time.Now().UnixMilli()
	start, end, err := parsePeriod(httptest.NewRequest("GET", "/", nil))
	if err != nil {
		t.Fatalf("défaut: %v", err)
	}
	if end < now || end-now > 5000 || end-start <= 0 {
		t.Fatalf("défaut start/end = %d/%d (now=%d)", start, end, now)
	}
	r := httptest.NewRequest("GET", "/?startAt=1000&endAt=2000", nil)
	s, e, err := parsePeriod(r)
	if err != nil || s != 1000 || e != 2000 {
		t.Fatalf("explicite = %d/%d (%v), attendu 1000/2000", s, e, err)
	}
	// endAt illisible → 400.
	r = httptest.NewRequest("GET", "/?startAt=3000&endAt=abc", nil)
	if _, _, err := parsePeriod(r); err == nil {
		t.Fatal("endAt illisible → err = nil, attendu une erreur")
	}
	// endAt antérieur à startAt → 400.
	r = httptest.NewRequest("GET", "/?startAt=3000&endAt=2000", nil)
	if _, _, err := parsePeriod(r); err == nil {
		t.Fatal("endAt < startAt → err = nil, attendu une erreur")
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
