package media

import (
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
)

func TestTimestampPtr(t *testing.T) {
	if got := timestampPtr(pgtype.Timestamp{}); got != nil {
		t.Fatalf("timestampPtr(invalid) = %v, attendu nil", got)
	}
	ts := pgtype.Timestamp{Valid: true, Time: time.Date(2026, 8, 1, 12, 0, 0, 0, time.UTC)}
	got := timestampPtr(ts)
	if got == nil || *got != "2026-08-01T12:00:00Z" {
		t.Fatalf("timestampPtr = %v, attendu 2026-08-01T12:00:00Z", got)
	}
}

func TestTextPtr(t *testing.T) {
	if got := textPtr(pgtype.Text{}); got != nil {
		t.Fatalf("textPtr(invalid) = %v, attendu nil", got)
	}
	if got := textPtr(pgtype.Text{String: "x", Valid: true}); got == nil || *got != "x" {
		t.Fatalf("textPtr(x) = %v", got)
	}
}


