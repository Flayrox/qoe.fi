package posts

import (
	"errors"
	"testing"
	"time"
)

// Le curseur est la seule chose qui garantit « ni doublon ni trou » entre deux
// pages : il doit faire un aller-retour exact, et un curseur illisible ne doit
// jamais être pris pour « première page ».
func TestReplyCursor_RoundTrip(t *testing.T) {
	at := time.Date(2026, 11, 24, 12, 34, 56, 0, time.UTC)
	id := "9f1c0f9e-0000-4000-8000-000000000001"

	cursor := EncodeReplyCursor(at, id)
	gotAt, gotID, err := DecodeReplyCursor(cursor)
	if err != nil {
		t.Fatalf("décodage: %v", err)
	}
	if !gotAt.Valid || !gotAt.Time.Equal(at) {
		t.Fatalf("horodatage = %v, attendu %v", gotAt.Time, at)
	}
	if !gotID.Valid || gotID.String != id {
		t.Fatalf("id = %q, attendu %q", gotID.String, id)
	}
}

func TestReplyCursor_EmptyIsFirstPage(t *testing.T) {
	at, id, err := DecodeReplyCursor("")
	if err != nil {
		t.Fatalf("un curseur vide vaut première page, pas une erreur: %v", err)
	}
	if at.Valid || id.Valid {
		t.Fatalf("curseur vide ne doit rien porter: at=%v id=%v", at.Valid, id.Valid)
	}
}

func TestReplyCursor_InvalidIsRejected(t *testing.T) {
	for _, raw := range []string{"pas-du-base64!!", "bm9waXBl", "MjAyNi0xMS0yNFQxMjozNDo1Nlo="} {
		if _, _, err := DecodeReplyCursor(raw); !errors.Is(err, ErrInvalidCursor) {
			t.Fatalf("curseur %q: err = %v, attendu ErrInvalidCursor", raw, err)
		}
	}
}

func TestNormalizeReplyLimit(t *testing.T) {
	cases := map[int]int{0: DefaultReplyLimit, -5: DefaultReplyLimit, 1: 1, 500: MaxReplyLimit}
	for in, want := range cases {
		if got := NormalizeReplyLimit(in); got != want {
			t.Fatalf("NormalizeReplyLimit(%d) = %d, attendu %d", in, got, want)
		}
	}
}
