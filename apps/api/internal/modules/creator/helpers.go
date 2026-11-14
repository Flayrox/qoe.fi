package creator

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/qoefi/api/internal/middleware"
)

var errForbidden = errors.New("permission insuffisante")

// toUUID convertit un id texte en pgtype.UUID (readerId UUID).
func toUUID(id string) pgtype.UUID {
	uuid := pgtype.UUID{}
	_ = uuid.Scan(id)
	return uuid
}

func textVal(p *string) pgtype.Text {
	if p == nil || *p == "" {
		return pgtype.Text{}
	}
	return pgtype.Text{String: *p, Valid: true}
}

func textPtr(t pgtype.Text) *string {
	if !t.Valid {
		return nil
	}
	return &t.String
}

func stringPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func timestampPtr(t pgtype.Timestamp) *string {
	if !t.Valid {
		return nil
	}
	s := t.Time.Format(time.RFC3339)
	return &s
}

// parseLimitCursor borne limit (20 défaut, 100 max) et offset.
func parseLimitCursor(r *http.Request) (int, int) {
	limit := middleware.ClampLimit(r.URL.Query().Get("limit"), 20, 100)
	offset, _ := strconv.Atoi(r.URL.Query().Get("cursor"))
	if offset < 0 {
		offset = 0
	}
	return limit, offset
}
