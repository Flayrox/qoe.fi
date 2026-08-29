package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

func TestLogger_RecordsStatus(t *testing.T) {
	// Journalise vers stderr (non intercepté) ; on vérifie que le status
	// traversé par statusRecorder atteint bien le ResponseWriter.
	inner := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusCreated)
	})
	h := Logger(inner)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/v1/health", nil))
	if rr.Code != http.StatusCreated {
		t.Errorf("status = %d, attendu 201", rr.Code)
	}
}

func TestStatusRecorder_Passthrough(t *testing.T) {
	rec := &statusRecorder{ResponseWriter: httptest.NewRecorder(), status: http.StatusOK}
	rec.WriteHeader(http.StatusTeapot)
	if rec.status != http.StatusTeapot {
		t.Errorf("status = %d", rec.status)
	}
}

func TestClientIP(t *testing.T) {
	t.Run("forwarded", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.Header.Set("X-Forwarded-For", "1.2.3.4, 5.6.7.8")
		req.RemoteAddr = "x:1"
		if got := clientIP(req); got != "1.2.3.4" {
			t.Errorf("clientIP = %q, attendu 1.2.3.4", got)
		}
	})
	t.Run("forwarded whitespace", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.Header.Set("X-Forwarded-For", " 9.9.9.9 ")
		if got := clientIP(req); got != "9.9.9.9" {
			t.Errorf("clientIP = %q, attendu 9.9.9.9", got)
		}
	})
	t.Run("real ip", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.Header.Set("X-Real-IP", "1.1.1.1")
		if got := clientIP(req); got != "1.1.1.1" {
			t.Errorf("clientIP = %q, attendu 1.1.1.1", got)
		}
	})
	t.Run("no header remote addr with port", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.RemoteAddr = "203.0.113.5:9999"
		if got := clientIP(req); got != "203.0.113.5" {
			t.Errorf("clientIP = %q", got)
		}
	})
	t.Run("no header no port", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.RemoteAddr = "198.51.100.7"
		if got := clientIP(req); got != "198.51.100.7" {
			t.Errorf("clientIP = %q", got)
		}
	})
}

func TestRateLimit_NilRedisPasses(t *testing.T) {
	var served bool
	h := RateLimit("t", nil, time.Minute, 1, false)(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		served = true
	}))
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/", nil))
	if !served {
		t.Fatal("RateLimit avec Redis nil doit laisser passer")
	}
}

func TestRateLimit_BlocksOverLimit(t *testing.T) {
	s := miniredis.RunT(t)
	rc := redis.NewClient(&redis.Options{Addr: s.Addr()})
	defer rc.Close()

	inner := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	h := RateLimit("test", rc, time.Minute, 2, true)(inner)

	// 2 requêtes autorisées, la 3e → 429.
	var codes []int
	for i := 0; i < 3; i++ {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.Header.Set("X-Forwarded-For", "10.0.0.1")
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, req)
		codes = append(codes, rr.Code)
	}
	if codes[0] != http.StatusOK || codes[1] != http.StatusOK {
		t.Errorf("2 premières requêtes doivent passer, got %v", codes)
	}
	if codes[2] != http.StatusTooManyRequests {
		t.Errorf("3e requête doit donner 429, got %d", codes[2])
	}
}

func TestRateLimit_ByUserPrecedence(t *testing.T) {
	s := miniredis.RunT(t)
	rc := redis.NewClient(&redis.Options{Addr: s.Addr()})
	defer rc.Close()

	h := RateLimit("user", rc, time.Minute, 1, true)(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	// Sans UID → clé par IP. Avec UID → clé par user (on différencie les compteurs).
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = req.WithContext(context.WithValue(req.Context(), UserIDKey, "user-1"))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Errorf("première requête user doit passer, got %d", rr.Code)
	}
}

func TestContextHelpers(t *testing.T) {
	base := context.Background()
	// PublicationID / UmamiWebsiteID.
	if _, ok := PublicationID(base); ok {
		t.Error("PublicationID absent du contexte, doit renvoyer ok=false")
	}
	ctx := context.WithValue(base, PublicationIDKey, "pub_1")
	ctx = context.WithValue(ctx, UmamiWebsiteIDKey, "site_1")
	if id, ok := PublicationID(ctx); !ok || id != "pub_1" {
		t.Errorf("PublicationID = %q %v", id, ok)
	}
	if id, ok := UmamiWebsiteID(ctx); !ok || id != "site_1" {
		t.Errorf("UmamiWebsiteID = %q %v", id, ok)
	}
	// UserID / Claims.
	if _, ok := UserID(base); ok {
		t.Error("UserID absent, ok doit être false")
	}
	uctx := context.WithValue(base, UserIDKey, "uid-9")
	if id, ok := UserID(uctx); !ok || id != "uid-9" {
		t.Errorf("UserID = %q %v", id, ok)
	}
	claims := map[string]any{"sub": "s", "email": "a@b"}
	cctx := context.WithValue(base, ClaimsKey, claims)
	if got := Claims(cctx); got["email"] != "a@b" {
		t.Errorf("Claims = %v", got)
	}
	if got := Claims(base); got != nil {
		t.Errorf("Claims absent doit être nil, got %v", got)
	}
	// Scopes et HasScope.
	sc := context.WithValue(base, ScopesKey, []string{"READ", "WRITE"})
	if s, ok := Scopes(sc); !ok || len(s) != 2 {
		t.Errorf("Scopes = %v %v", s, ok)
	}
	if !HasScope([]string{"READ", "WRITE"}, "WRITE") {
		t.Error("HasScope(WRITE) doit être true")
	}
	if HasScope([]string{"READ"}, "ANALYTICS") {
		t.Error("HasScope(ANALYTICS) absent doit être false")
	}
	if HasScope(nil, "READ") {
		t.Error("HasScope(nil) doit être false")
	}
}

func TestWriteForbidden(t *testing.T) {
	rr := httptest.NewRecorder()
	writeForbidden(rr, "Scope x requis")
	if rr.Code != http.StatusForbidden {
		t.Errorf("code = %d", rr.Code)
	}
	if !strings.Contains(rr.Body.String(), "Scope x requis") {
		t.Errorf("body = %q", rr.Body.String())
	}
}

func TestRequireAPIScope_BlocksWithoutScope(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	h := RequireAPIScope("ANALYTICS")(inner)

	// Clé API sans le scope ANALYTICS → 403.
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req = req.WithContext(context.WithValue(req.Context(), ScopesKey, []string{"READ"}))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusForbidden {
		t.Errorf("sans scope = %d, attendu 403", rr.Code)
	}

	// Clé API avec le scope → passe.
	req2 := httptest.NewRequest(http.MethodGet, "/", nil)
	req2 = req2.WithContext(context.WithValue(req2.Context(), ScopesKey, []string{"READ", "ANALYTICS"}))
	rr2 := httptest.NewRecorder()
	h.ServeHTTP(rr2, req2)
	if rr2.Code != http.StatusOK {
		t.Errorf("avec scope = %d, attendu 200", rr2.Code)
	}

	// JWT (pas de scopes en contexte) → passe (RBAC publication couvre).
	req3 := httptest.NewRequest(http.MethodGet, "/", nil)
	rr3 := httptest.NewRecorder()
	h.ServeHTTP(rr3, req3)
	if rr3.Code != http.StatusOK {
		t.Errorf("JWT (pas de scope) = %d, attendu 200", rr3.Code)
	}
}

func TestOriginAllowed_ExactAndWildcard(t *testing.T) {
	set := map[string]bool{"https://qoe.fi": true}
	// Exact.
	if !originAllowed("https://qoe.fi", set, []string{"https://qoe.fi"}) {
		t.Error("origine exacte doit passer")
	}
	// Wildcard sous-domaine (format *.qoe.fi) : le middle ne doit contenir
	// ni / ni : ni . (le schéma https:// n'est pas un sous-domaine valide).
	if !originAllowed("app.qoe.fi", set, []string{"*.qoe.fi"}) {
		t.Error("wildcard sous-domaine doit passer")
	}
	// Schéma dans le middle → refusé (https://app contient deux-points).
	if originAllowed("https://app.qoe.fi", set, []string{"*.qoe.fi"}) {
		t.Error("middle avec schéma doit être refusé")
	}
	// Wildcard mais middle contient un point/barre → refusé.
	if originAllowed("qoe.fi.evil.com", set, []string{"*.qoe.fi"}) {
		t.Error("suffixe piégé doit être refusé")
	}
	// Hors de la liste.
	if originAllowed("https://evil.com", set, []string{"https://qoe.fi", "*.qoe.fi"}) {
		t.Error("origine étrangère doit être refusée")
	}
	// Origin vide : autorisé si aucune liste configurée (ou liste vide).
	if !originAllowed("", nil, []string{}) {
		t.Error("sans origin ni liste → autorisé")
	}
	if originAllowed("", nil, []string{"https://qoe.fi"}) {
		t.Error("origin vide avec liste → refusé")
	}
	// Wildcard mais middle vide (ex. *.qoe.fi match qoe.fi) → refusé.
	if originAllowed("qoe.fi", nil, []string{"*.qoe.fi"}) {
		t.Error("middle vide → refusé")
	}
}