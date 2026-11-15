package workers

import (
	"testing"
	"time"
)

func TestPeriodEnd_UtiliseCurrentPeriodEnd(t *testing.T) {
	now := time.Date(2026, 11, 15, 12, 0, 0, 0, time.UTC)
	obj := map[string]any{"current_period_end": float64(1767225600)} // 2027-01-01
	got := periodEnd(obj, now)
	want := time.Unix(1767225600, 0).UTC()
	if !got.Equal(want) {
		t.Fatalf("periodEnd = %s, attendu %s", got, want)
	}
}

func TestPeriodEnd_RepliUnMois(t *testing.T) {
	now := time.Date(2026, 1, 31, 12, 0, 0, 0, time.UTC)
	if got := periodEnd(map[string]any{}, now); !got.Equal(now.AddDate(0, 1, 0)) {
		t.Fatalf("repli = %s", got)
	}
	if got := periodEnd(nil, now); !got.Equal(now.AddDate(0, 1, 0)) {
		t.Fatalf("nil = %s", got)
	}
}
