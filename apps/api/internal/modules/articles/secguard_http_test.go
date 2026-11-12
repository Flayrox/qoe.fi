package articles

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/antispam"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/secguard"
	"github.com/qoefi/api/internal/trust"
	"github.com/redis/go-redis/v9"
)

func newSecGuardTestRouter(t *testing.T, userID string, maxBodyBytes int64, withGuard bool) (*chi.Mux, *secguard.Guard) {
	t.Helper()
	var sec *secguard.Guard
	if withGuard {
		mr := miniredis.RunT(t)
		rc := redis.NewClient(&redis.Options{Addr: mr.Addr()})
		t.Cleanup(func() { _ = rc.Close() })
		sec = secguard.New(nil, rc)
	}

	r := chi.NewRouter()
	if maxBodyBytes > 0 {
		r.Use(middleware.MaxBodyBytes(maxBodyBytes))
	}
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			if userID != "" {
				ctx := context.WithValue(req.Context(), middleware.UserIDKey, userID)
				req = req.WithContext(ctx)
			}
			next.ServeHTTP(w, req)
		})
	})

	h := NewHandler(nil).SetSecurityGuard(sec)
	h.RegisterProtected(r, func(string) func(http.Handler) http.Handler {
		return func(next http.Handler) http.Handler { return next }
	})
	return r, sec
}

func doSecReq(t *testing.T, r *chi.Mux, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	var req *http.Request
	if body == "" {
		req = httptest.NewRequest(method, path, nil)
	} else {
		req = httptest.NewRequest(method, path, bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
	}
	req.RemoteAddr = "198.51.100.10:1234"
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	return rr
}

func TestArticlesSecguard_413_PayloadTooLarge(t *testing.T) {
	r, _ := newSecGuardTestRouter(t, "user-413", 64, true)
	oversized := `{"publisherId":"pub1","title":"` + strings.Repeat("a", 128) + `"}`

	cases := []struct {
		name   string
		method string
		path   string
		body   string
	}{
		{"create", http.MethodPost, "/v1/articles", oversized},
		{"createComment", http.MethodPost, "/v1/articles/art-1/comments", `{"content":"` + strings.Repeat("x", 128) + `"}`},
		{"update", http.MethodPatch, "/v1/articles/art-1", `{"title":"` + strings.Repeat("a", 128) + `"}`},
		{"bulkUpdate", http.MethodPatch, "/v1/articles/bulk", `{"ids":["` + strings.Repeat("i", 128) + `"]}`},
		{"forkPersonal", http.MethodPost, "/v1/articles/art-1/fork-personal", `{"snapshotId":"` + strings.Repeat("s", 128) + `"}`},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rr := doSecReq(t, r, tc.method, tc.path, tc.body)
			if rr.Code != http.StatusRequestEntityTooLarge {
				t.Fatalf("%s: attendu 413, obtenu %d (body=%s)", tc.name, rr.Code, rr.Body.String())
			}
		})
	}
}

func TestArticlesSecguard_400_OversizedTitleXSSAndUnsafeURL(t *testing.T) {
	for _, withGuard := range []bool{true, false} {
		label := "with_guard"
		if !withGuard {
			label = "nil_guard"
		}
		t.Run(label, func(t *testing.T) {
			longTitle := strings.Repeat("é", antispam.MaxArticleTitleRunes+1)
			bodyLongTitle, _ := json.Marshal(map[string]any{
				"publisherId": "pub-1",
				"title":       longTitle,
				"content":     "<p>Texte propre</p>",
			})
			rTitle, _ := newSecGuardTestRouter(t, "user-val-title", 1<<20, withGuard)
			rr := doSecReq(t, rTitle, http.MethodPost, "/v1/articles", string(bodyLongTitle))
			if rr.Code != http.StatusBadRequest {
				t.Fatalf("titre > 200 runes: attendu 400, obtenu %d (%s)", rr.Code, rr.Body.String())
			}

			bodyXSSArticle, _ := json.Marshal(map[string]any{
				"publisherId": "pub-1",
				"title":       "Article valide",
				"content":     "<p>Bonjour</p><script>alert(1)</script>",
			})
			rXSS, _ := newSecGuardTestRouter(t, "user-val-xss", 1<<20, withGuard)
			rr2 := doSecReq(t, rXSS, http.MethodPost, "/v1/articles", string(bodyXSSArticle))
			if rr2.Code != http.StatusBadRequest {
				t.Fatalf("XSS article: attendu 400, obtenu %d (%s)", rr2.Code, rr2.Body.String())
			}

			bodyUnsafeURL, _ := json.Marshal(map[string]any{
				"publisherId": "pub-1",
				"title":       "Article valide",
				"content":     "<p>Texte propre</p>",
				"imageUrl":    "javascript:alert(1)",
			})
			rURL, _ := newSecGuardTestRouter(t, "user-val-url", 1<<20, withGuard)
			rr3 := doSecReq(t, rURL, http.MethodPost, "/v1/articles", string(bodyUnsafeURL))
			if rr3.Code != http.StatusBadRequest {
				t.Fatalf("imageUrl javascript:: attendu 400, obtenu %d (%s)", rr3.Code, rr3.Body.String())
			}

			rCom, _ := newSecGuardTestRouter(t, "user-val-com", 1<<20, withGuard)
			rr4 := doSecReq(t, rCom, http.MethodPost, "/v1/articles/art-1/comments", `{"content":"<script>alert(1)</script>"}`)
			if rr4.Code != http.StatusBadRequest {
				t.Fatalf("XSS commentaire: attendu 400, obtenu %d (%s)", rr4.Code, rr4.Body.String())
			}
		})
	}
}

func TestArticlesSecguard_429_SimHashCommentVsRepeatedUpdate(t *testing.T) {
	r, sec := newSecGuardTestRouter(t, "user-sim", 1<<20, true)
	ctx := context.Background()
	prof := trust.Profile{UserID: "user-sim", Tier: trust.TierStandard, AccountAge: 10 * 24 * time.Hour}

	// Enregistre un premier commentaire légitime dans le garde (simule une création réussie).
	msg1 := "Voici un commentaire détaillé sur l'économie numérique européenne en 2026."
	w1 := httptest.NewRecorder()
	if !sec.EnforceContentWrite(ctx, w1, "user-sim", "comments", msg1, prof, func(tier trust.Tier) error {
		return antispam.ValidateComment(msg1, tier)
	}) {
		t.Fatalf("premier commentaire rejeté de façon inattendue: %d", w1.Code)
	}

	// Un quasi-doublon SimHash via HTTP POST /comments doit être bloqué en 429.
	msg2 := "Voici un commentaire détaillé sur l'économie numérique européenne en 2027!"
	dupPayload, _ := json.Marshal(map[string]string{"content": msg2})
	rrDup := doSecReq(t, r, http.MethodPost, "/v1/articles/art-1/comments", string(dupPayload))
	if rrDup.Code != http.StatusTooManyRequests {
		t.Fatalf("doublon SimHash commentaire: attendu 429, obtenu %d (%s)", rrDup.Code, rrDup.Body.String())
	}

	// À l'inverse, des PATCH /v1/articles/{id} répétés avec le même contenu (autosave / Ctrl+S)
	// ne doivent JAMAIS déclencher de faux positif SimHash (ni 429 ni 400).
	updatePayload, _ := json.Marshal(map[string]string{
		"title":         "Analyse approfondie de la politique monétaire européenne",
		"content":       "Voici mon analyse détaillée sur l'économie numérique européenne en 2026 avec de nombreux paragraphes.",
		"contentFormat": "markdown",
	})
	for i := 0; i < 5; i++ {
		rrUpd := doSecReq(t, r, http.MethodPatch, "/v1/articles/art-1", string(updatePayload))
		if rrUpd.Code == http.StatusTooManyRequests || rrUpd.Code == http.StatusBadRequest {
			t.Fatalf("update #%d bloqué à tort par SimHash/antispam: code=%d body=%s", i+1, rrUpd.Code, rrUpd.Body.String())
		}
	}
}

func TestSnapshotHelpers_HashAndMilestone(t *testing.T) {
	h1 := snapshotContentHash("Titre A", "Contenu B")
	h2 := snapshotContentHash("Titre A", "Contenu B")
	if h1 == "" || h1 != h2 {
		t.Fatalf("snapshotContentHash non déterministe: %q vs %q", h1, h2)
	}
	if snapshotContentHash("Titre A", "Contenu C") == h1 {
		t.Fatal("contenu différent doit produire un hash différent")
	}
	if snapshotContentHash("ab", "c") == snapshotContentHash("a", "bc") {
		t.Fatal("séparateur NUL doit empêcher la collision de frontière")
	}

	for _, r := range []string{"INITIAL", "PUBLISHED", "BEFORE_REVOCATION"} {
		if !isMilestoneSnapshotReason(r) {
			t.Errorf("%q doit être un jalon", r)
		}
	}
	for _, r := range []string{"", "MANUAL", "AUTO_SAVE", "AUTHOR_SWITCH", "SUBMITTED"} {
		if isMilestoneSnapshotReason(r) {
			t.Errorf("%q ne doit pas être un jalon", r)
		}
	}
}
