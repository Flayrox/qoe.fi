package posts

import (
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
)

func TestTextVal(t *testing.T) {
	if textVal(pgtype.Text{}) != "" {
		t.Error("invalid pgtype.Text → \"\"")
	}
	if textVal(pgtype.Text{String: "yo", Valid: true}) != "yo" {
		t.Error("valid pgtype.Text → valeur")
	}
	if v := textPtr(pgtype.Text{}); v != nil {
		t.Errorf("textPtr invalid = %v, attendu nil", *v)
	}
	if v := textPtr(pgtype.Text{String: "yo", Valid: true}); v == nil || *v != "yo" {
		t.Errorf("textPtr valid = %v", v)
	}
}

func TestTimePtr(t *testing.T) {
	if timePtr(pgtype.Timestamp{}) != nil {
		t.Error("timePtr invalid doit être nil")
	}
	ts := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	if got := timePtr(pgtype.Timestamp{Time: ts, Valid: true}); got == nil || *got != "2026-01-02T03:04:05Z" {
		t.Errorf("timePtr = %v", got)
	}
}

func TestIntPtr(t *testing.T) {
	if v := intPtr(42); v == nil || *v != 42 {
		t.Errorf("intPtr(42) = %v", v)
	}
	if v := pgtypeInt4Ptr(pgtype.Int4{}); v != nil {
		t.Errorf("pgtypeInt4Ptr invalid = %v", *v)
	}
	if v := pgtypeInt4Ptr(pgtype.Int4{Int32: 7, Valid: true}); v == nil || *v != 7 {
		t.Errorf("pgtypeInt4Ptr valid = %v", v)
	}
}

func TestInt4Ptr(t *testing.T) {
	if got := int4Ptr(nil); got.Valid {
		t.Error("int4Ptr(nil) doit être invalid")
	}
	got := int4Ptr(intPtr(5))
	if !got.Valid || int(got.Int32) != 5 {
		t.Errorf("int4Ptr(5) = %+v", got)
	}
}

func TestIsUniqueViolation(t *testing.T) {
	if isUniqueViolation(errors.New("autre")) {
		t.Error("erreur non-PG ne doit pas être une violation unique")
	}
	if isUniqueViolation(&pgconn.PgError{Code: "23505"}) != true {
		t.Error("code 23505 doit être une violation unique")
	}
	if isUniqueViolation(&pgconn.PgError{Code: "23503"}) != false {
		t.Error("code 23503 ne doit pas être une violation unique")
	}
}