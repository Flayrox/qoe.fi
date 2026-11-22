package users

// Tests de non-régression de l'audit L29i : fail-open d'inscription, export
// RGPD partiel, handle effacé, onboarding partiel, prix du wallet piloté par
// le client, double débit, chemins GoTrue arbitraires, erreurs DB en 400.

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/testutil"
)

func seedUsersFixture(t *testing.T) *testutil.PostFixtures {
	t.Helper()
	requirePool(t)
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	return fx
}

func TestUsers_RegistrationStatusFailsClosed(t *testing.T) {
	seedUsersFixture(t)
	// La lecture du kill-switch échouait : `readConfig` renvoyait "" et
	// l'inscription était annoncée OUVERTE sur une panne DB.
	r := faultRouter(&faultPool{pooler: poolTest, failQueryRow: true})
	w := do(r, http.MethodGet, "/v1/auth/registration-status?email=x@test.dev", "", "")
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("kill-switch illisible = %d (%s), attendu 500 (jamais « ouvert » sur panne)", w.Code, w.Body.String())
	}
}

func TestUsers_DataExportFailsOnQueryError(t *testing.T) {
	fx := seedUsersFixture(t)
	r := faultRouter(&faultPool{pooler: poolTest, failQuery: true})
	w := do(r, http.MethodGet, "/v1/me/data-export", fx.AuthorID, "")
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("export sur panne = %d, attendu 500 (un export partiel ne doit pas être servi comme complet)", w.Code)
	}
}

func TestUsers_DataExportIncludesPersonalData(t *testing.T) {
	fx := seedUsersFixture(t)
	ctx := context.Background()
	if _, err := poolTest.Exec(ctx, `
		UPDATE "User" SET "phoneNumber" = '+33600000000', "phoneVerifiedAt" = now(),
		       gender = 'FEMALE', "ageRange" = 'AGE_25_34', "countryCode" = 'FR',
		       "languageCode" = 'fr', "walletBalanceCents" = 1234
		WHERE id = $1`, fx.AuthorID); err != nil {
		t.Fatalf("fixture: %v", err)
	}

	r := newRouter()
	w := do(r, http.MethodGet, "/v1/me/data-export", fx.AuthorID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("export = %d %s", w.Code, w.Body.String())
	}
	var data struct {
		Account map[string]any `json:"account"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &data); err != nil {
		t.Fatalf("json: %v", err)
	}
	for _, key := range []string{"phoneNumber", "gender", "ageRange", "countryCode", "languageCode", "walletBalanceCents"} {
		if _, ok := data.Account[key]; !ok {
			t.Fatalf("export RGPD sans %q : %v", key, data.Account)
		}
	}
}

func TestUsers_EmptyUsernameDoesNotWipeHandle(t *testing.T) {
	fx := seedUsersFixture(t)
	r := newRouter()
	// Un username vide = « inchangé » (les clients envoient tous les champs) :
	// il effaçait la colonne et le profil public perdait son @handle.
	w := do(r, http.MethodPatch, "/v1/me/profile", fx.AuthorID, `{"username":""}`)
	if w.Code != http.StatusOK {
		t.Fatalf("username vide = %d (%s), attendu 200 sans changement", w.Code, w.Body.String())
	}
	var username *string
	if err := poolTest.QueryRow(context.Background(),
		`SELECT username FROM "User" WHERE id = $1`, fx.AuthorID).Scan(&username); err != nil {
		t.Fatalf("reload: %v", err)
	}
	if username == nil || *username != "alice" {
		t.Fatalf("handle effacé par un PATCH vide : %v", username)
	}
}

func TestUsers_OnboardingRollsBackOnFailure(t *testing.T) {
	fx := seedUsersFixture(t)
	fp := &faultPool{pooler: poolTest, failExecContains: "MutedWord"}
	r := faultRouter(fp)

	w := do(r, http.MethodPost, "/v1/me/onboarding-complete", fx.ViewerID,
		`{"interests":["tech"],"mutedWords":["spoiler"],"onboardingText":"Hello"}`)
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("onboarding sur échec d'écriture = %d, attendu 500", w.Code)
	}
	var done bool
	if err := poolTest.QueryRow(context.Background(),
		`SELECT "hasCompletedOnboarding" FROM "User" WHERE id = $1`, fx.ViewerID).Scan(&done); err != nil {
		t.Fatalf("reload: %v", err)
	}
	if done {
		t.Fatal("onboarding marqué terminé alors que l'enregistrement a échoué (état partiel)")
	}
}

func TestUsers_OnboardingBoundsCreators(t *testing.T) {
	fx := seedUsersFixture(t)
	r := newRouter()
	creators := make([]string, 80)
	for i := range creators {
		creators[i] = fmt.Sprintf("00000000-0000-0000-0000-%012x", i+1)
	}
	body, _ := json.Marshal(map[string]any{"creatorsToFollow": creators})
	w := do(r, http.MethodPost, "/v1/me/onboarding-complete", fx.ViewerID, string(body))
	if w.Code != http.StatusBadRequest {
		t.Fatalf("80 créateurs à suivre = %d, attendu 400 (entrée non bornée)", w.Code)
	}
}

func TestUsers_SearchBoundsQuery(t *testing.T) {
	seedUsersFixture(t)
	r := newRouter()
	w := do(r, http.MethodGet, "/v1/users/search?q="+strings.Repeat("a", 300), "", "")
	if w.Code != http.StatusBadRequest {
		t.Fatalf("recherche de 300 caractères = %d, attendu 400", w.Code)
	}
}

func TestUsers_BlockUnknownTargetIsNotFound(t *testing.T) {
	fx := seedUsersFixture(t)
	r := newRouter()
	w := do(r, http.MethodPost, "/v1/me/blocked-users/00000000-0000-0000-0000-0000000000ff/toggle", fx.AuthorID, "")
	if w.Code != http.StatusNotFound {
		t.Fatalf("blocage d'un compte inconnu = %d (%s), attendu 404", w.Code, w.Body.String())
	}
}

func TestUsers_LoginEnvironmentKeepsUTF8(t *testing.T) {
	fx := seedUsersFixture(t)
	svc := NewService(poolTest)
	ua := strings.Repeat("é", 300) // 600 octets, 300 runes
	if _, err := svc.CheckLoginEnvironment(context.Background(), fx.AuthorID, "203.0.113.9:4444", ua); err != nil {
		t.Fatalf("check: %v", err)
	}
	var stored string
	if err := poolTest.QueryRow(context.Background(),
		`SELECT "userAgent" FROM "SecurityEvent" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
		fx.AuthorID).Scan(&stored); err != nil {
		t.Fatalf("reload: %v", err)
	}
	if !utf8.ValidString(stored) {
		t.Fatalf("user-agent tronqué au milieu d'une rune : %q", stored)
	}
	if utf8.RuneCountInString(stored) > 220 {
		t.Fatalf("user-agent à %d runes, borne 220", utf8.RuneCountInString(stored))
	}
}

// walletFixture crédite Bob et renvoie la publication d'Alice (propriétaire).
func walletFixture(t *testing.T, balance int) (fx *testutil.PostFixtures, publisherID string) {
	t.Helper()
	fx = seedUsersFixture(t)
	ctx := context.Background()
	if _, err := poolTest.Exec(ctx,
		`UPDATE "User" SET "walletBalanceCents" = $2 WHERE id = $1`, fx.ViewerID, balance); err != nil {
		t.Fatalf("solde: %v", err)
	}
	if err := poolTest.QueryRow(ctx,
		`SELECT "publisherId" FROM "User" WHERE id = $1`, fx.AuthorID).Scan(&publisherID); err != nil {
		t.Fatalf("publication: %v", err)
	}
	return fx, publisherID
}

func TestUsers_WalletIgnoresClientPrice(t *testing.T) {
	fx, publisherID := walletFixture(t, 1000)
	r := newRouter()
	w := do(r, http.MethodPost, "/v1/me/wallet/unlock", fx.ViewerID,
		`{"creatorId":"`+publisherID+`","costCents":1}`)
	if w.Code != http.StatusOK {
		t.Fatalf("unlock = %d %s", w.Code, w.Body.String())
	}
	var balance int32
	if err := poolTest.QueryRow(context.Background(),
		`SELECT "walletBalanceCents" FROM "User" WHERE id = $1`, fx.ViewerID).Scan(&balance); err != nil {
		t.Fatalf("solde: %v", err)
	}
	if balance == 999 {
		t.Fatalf("prix piloté par le client : débit de 1 centime (solde %d)", balance)
	}
	if balance >= 1000 {
		t.Fatalf("aucun débit (solde %d)", balance)
	}
}

func TestUsers_WalletCannotOverdraw(t *testing.T) {
	fx, publisherID := walletFixture(t, 100)
	ctx := context.Background()

	svc := NewService(poolTest)
	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, _ = svc.UnlockArticleWithWallet(ctx, fx.ViewerID, publisherID)
		}()
	}
	wg.Wait()

	var balance int32
	if err := poolTest.QueryRow(ctx,
		`SELECT "walletBalanceCents" FROM "User" WHERE id = $1`, fx.ViewerID).Scan(&balance); err != nil {
		t.Fatalf("solde: %v", err)
	}
	if balance < 0 {
		t.Fatalf("solde négatif après deux débits concurrents : %d", balance)
	}
}

func TestUsers_MFAVerifyRejectsForeignPath(t *testing.T) {
	fx := seedUsersFixture(t)
	hit := make(chan string, 4)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hit <- r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{}`))
	}))
	t.Cleanup(srv.Close)

	svc := NewServiceWithGoTrue(poolTest, srv.URL, "service-role")
	h := NewHandler(svc)
	r := chi.NewRouter()
	h.Register(r)
	h.RegisterPublic(r)

	w := do(r, http.MethodPost, "/v1/me/mfa/totp/verify", fx.AuthorID,
		`{"path":"/auth/v1/admin/users/`+fx.ViewerID+`","password":"x"}`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("chemin GoTrue arbitraire = %d (%s), attendu 400", w.Code, w.Body.String())
	}
	select {
	case p := <-hit:
		t.Fatalf("la requête a atteint GoTrue sur %q", p)
	case <-time.After(50 * time.Millisecond):
	}
}

func TestUsers_IdentityUnknownIsNotFound(t *testing.T) {
	seedUsersFixture(t)
	r := newRouter()
	w := do(r, http.MethodGet, "/v1/me/identity", "00000000-0000-0000-0000-0000000000ee", "")
	if w.Code != http.StatusNotFound {
		t.Fatalf("identité inconnue = %d, attendu 404", w.Code)
	}
}

func TestUsers_MuteWordDatabaseErrorIsNot400(t *testing.T) {
	fx := seedUsersFixture(t)
	r := faultRouter(&faultPool{pooler: poolTest, failExec: true})
	w := do(r, http.MethodPost, "/v1/me/muted-words", fx.AuthorID, `{"word":"spoiler"}`)
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("panne DB = %d (%s), attendu 500", w.Code, w.Body.String())
	}
}

func TestUsers_ProfileDatabaseErrorIsNot400(t *testing.T) {
	fx := seedUsersFixture(t)
	r := faultRouter(&faultPool{pooler: poolTest, failExec: true})
	w := do(r, http.MethodPatch, "/v1/me/profile", fx.AuthorID, `{"name":"Nouveau"}`)
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("panne DB = %d (%s), attendu 500", w.Code, w.Body.String())
	}
}
