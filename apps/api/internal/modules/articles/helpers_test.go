package articles

import (
	"testing"
	"time"
)

func TestIsValidContentFormat2(t *testing.T) {
	for _, ok := range []string{"", "html", "markdown"} {
		if !IsValidContentFormat(ok) {
			t.Errorf("%q doit être valide", ok)
		}
	}
	if IsValidContentFormat("xml") {
		t.Error("xml ne doit pas être valide")
	}
}

func TestPageToOffsetU(t *testing.T) {
	if PageToOffset(1, 10) != 0 {
		t.Error("page 1 → offset 0")
	}
	if PageToOffset(3, 10) != 20 {
		t.Error("page 3 → offset 20")
	}
	if PageToOffset(0, 10) != 0 {
		t.Error("page 0 → clamp 1 → 0")
	}
}

func TestParsePageLimitU(t *testing.T) {
	page, limit := ParsePageLimit("", "")
	if page != 1 || limit != 10 {
		t.Errorf("defaults = (%d,%d), attendu (1,10)", page, limit)
	}
	page, limit = ParsePageLimit("2", "25")
	if page != 2 || limit != 25 {
		t.Errorf("parse = (%d,%d), attendu (2,25)", page, limit)
	}
	page, limit = ParsePageLimit("0", "500")
	if page != 1 || limit != 100 {
		t.Errorf("clamp = (%d,%d), attendu (1,100)", page, limit)
	}
	page, limit = ParsePageLimit("abc", "xyz")
	if page != 1 || limit != 10 {
		t.Errorf("non numérique = (%d,%d)", page, limit)
	}
}

func TestPeriodCutoffU(t *testing.T) {
	for _, p := range []string{"7d", "30d", "90d", "bogus"} {
		c := periodCutoff(p)
		if c == nil {
			t.Errorf("%q doit donner une date", p)
		}
		if c.Before(time.Now().Add(-1000 * 24 * time.Hour)) {
			t.Errorf("%q cutoff trop ancien: %v", p, c)
		}
	}
	if c := periodCutoff("all"); c != nil {
		t.Errorf("'all' doit retourner nil, got %v", c)
	}
}