package users

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/qoefi/api/internal/testutil"
)

// ─── Block / Mute (privacy_social.go) ───────────────────────────────────────

func TestBlockedUsers_ToggleAndList(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	r := newRouter()

	// Bloquer bob (viewer) depuis alice.
	w := do(r, http.MethodPost, "/v1/me/blocked-users/"+fx.ViewerID+"/toggle", fx.AuthorID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("toggle block = %d, attendu 200 (body %s)", w.Code, w.Body.String())
	}
	var res struct {
		Blocked bool `json:"blocked"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil || !res.Blocked {
		t.Fatalf("blocked = %+v, attendu true", res)
	}

	// Liste : bob présent.
	w = do(r, http.MethodGet, "/v1/me/blocked-users", fx.AuthorID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("list blocked = %d", w.Code)
	}
	var list struct {
		Users []socialUserDTO `json:"users"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &list); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(list.Users) != 1 || list.Users[0].ID != fx.ViewerID {
		t.Fatalf("blocked list = %+v, attendu [%s]", list.Users, fx.ViewerID)
	}

	// Débloquer → liste vide.
	w = do(r, http.MethodPost, "/v1/me/blocked-users/"+fx.ViewerID+"/toggle", fx.AuthorID, "")
	_ = json.Unmarshal(w.Body.Bytes(), &res)
	if res.Blocked {
		t.Fatalf("unblock: blocked = true, attendu false")
	}
	w = do(r, http.MethodGet, "/v1/me/blocked-users", fx.AuthorID, "")
	_ = json.Unmarshal(w.Body.Bytes(), &list)
	if len(list.Users) != 0 {
		t.Fatalf("blocked list après unblock = %+v, attendu vide", list.Users)
	}

	// Auto-blocage interdit.
	w = do(r, http.MethodPost, "/v1/me/blocked-users/"+fx.AuthorID+"/toggle", fx.AuthorID, "")
	if w.Code != http.StatusBadRequest {
		t.Fatalf("self block = %d, attendu 400", w.Code)
	}

	// Sans authentification → 401.
	w = do(r, http.MethodGet, "/v1/me/blocked-users", "", "")
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("blocked users sans auth = %d, attendu 401", w.Code)
	}
}

func TestMutedUsers_ToggleAndList(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	r := newRouter()

	w := do(r, http.MethodPost, "/v1/me/muted-users/"+fx.ViewerID+"/toggle", fx.AuthorID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("toggle mute = %d, attendu 200 (body %s)", w.Code, w.Body.String())
	}
	var res struct {
		Muted bool `json:"muted"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil || !res.Muted {
		t.Fatalf("muted = %+v, attendu true", res)
	}

	w = do(r, http.MethodGet, "/v1/me/muted-users", fx.AuthorID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("list muted = %d", w.Code)
	}
	var list struct {
		Users []socialUserDTO `json:"users"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &list); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(list.Users) != 1 || list.Users[0].ID != fx.ViewerID {
		t.Fatalf("muted list = %+v, attendu [%s]", list.Users, fx.ViewerID)
	}

	w = do(r, http.MethodPost, "/v1/me/muted-users/"+fx.ViewerID+"/toggle", fx.AuthorID, "")
	_ = json.Unmarshal(w.Body.Bytes(), &res)
	if res.Muted {
		t.Fatalf("unmute: muted = true, attendu false")
	}

	// Auto-masquage interdit.
	w = do(r, http.MethodPost, "/v1/me/muted-users/"+fx.AuthorID+"/toggle", fx.AuthorID, "")
	if w.Code != http.StatusBadRequest {
		t.Fatalf("self mute = %d, attendu 400", w.Code)
	}
}

// ─── Helpers purs ───────────────────────────────────────────────────────────

func TestDerivedUserName(t *testing.T) {
	cases := []struct {
		email, username, want string
	}{
		{"alice@test.dev", "Alice-42", "alice42"},   // sanitisé (le `-` est retiré)
		{"alice@test.dev", "bob", "bob"},             // claim valide
		{"alice@test.dev", "@#", "alice"},            // invalide → préfixe email
		{"alice@test.dev", "admin", "alice"},         // réservé → préfixe email
		{"bob@test.dev", "", "bob"},                  // vide → préfixe email
		{"", "", "user"},                             // tout vide → fallback
	}
	for _, c := range cases {
		if got := derivedUserName(c.email, c.username); got != c.want {
			t.Errorf("derivedUserName(%q, %q) = %q, attendu %q", c.email, c.username, got, c.want)
		}
	}
}

func TestIsUniqueViolationAndEmailConflict(t *testing.T) {
	if !isUniqueViolation(&pgconn.PgError{Code: "23505"}) {
		t.Fatal("isUniqueViolation(23505) = false, attendu true")
	}
	if isUniqueViolation(errors.New("boom")) {
		t.Fatal("isUniqueViolation(autre) = true, attendu false")
	}
	if !isEmailConflict(&pgconn.PgError{Code: "23505", ConstraintName: "User_email_key"}) {
		t.Fatal("isEmailConflict(User_email_key) = false, attendu true")
	}
	if isEmailConflict(&pgconn.PgError{Code: "23505", ConstraintName: "other"}) {
		t.Fatal("isEmailConflict(autre contrainte) = true, attendu false")
	}
}
