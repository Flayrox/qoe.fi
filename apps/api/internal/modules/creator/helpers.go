package creator

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/qoefi/api/internal/middleware"
)

var errForbidden = errors.New("permission insuffisante")

// newArticleID génère un identifiant d'article aléatoire (préfixe lisible +
// 8 octets d'entropie), sans collision d'horloge.
func newArticleID(prefix string) (string, error) {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return "api_" + prefix + "-" + hex.EncodeToString(b), nil
}

// capitalizeFirst met la première rune en majuscule sans toucher au reste
// (remplace strings.Title, déprécié et trop agressif sur les points).
func capitalizeFirst(s string) string {
	if s == "" {
		return s
	}
	r, size := utf8.DecodeRuneInString(s)
	return strings.ToUpper(string(r)) + s[size:]
}

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
