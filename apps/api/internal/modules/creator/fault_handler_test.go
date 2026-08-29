package creator

import (
	"context"
	"net/http"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	db "github.com/qoefi/api/internal/database"
)

// faultRouter construit le routeur avec un handler dont le queryer/pool peut
// être mis en faute, pour couvrir les branches d'erreur des handlers.
func faultRouter(fq *faultQ, fp *faultPool) *chi.Mux {
	h := &Handler{pool: fp, q: fq}
	r := chi.NewRouter()
	h.RegisterPublic(r)
	h.RegisterProtected(r, func(string) func(http.Handler) http.Handler {
		return func(next http.Handler) http.Handler { return next }
	})
	return r
}

// seedCategory insère une catégorie appartenant à la publication alice.
func seedCategory(t *testing.T, pubID string) string {
	t.Helper()
	var id string
	if err := poolTest.QueryRow(context.Background(),
		`INSERT INTO "Category" (id, name, slug, "publicationId") VALUES (gen_random_uuid()::text, 'Foot', 'foot', $1) RETURNING id`,
		pubID,
	).Scan(&id); err != nil {
		t.Fatalf("seed category: %v", err)
	}
	return id
}

func TestFault_Handlers_QueryErrors(t *testing.T) {
	alicePubID, aliceUserID, _, bobUserID := seedFollows(t)
	catID := seedCategory(t, alicePubID)

	cases := []struct {
		name       string
		qf         map[string]error
		method, url string
		userID     string
		body       string
		want       int
	}{
		{"categories-500", map[string]error{"ListCategoriesByPublication": errBoom}, http.MethodGet, "/v1/categories?publicationId=" + alicePubID, aliceUserID, "", http.StatusInternalServerError},
		{"createCategory-500", map[string]error{"CreateCategory": errBoom}, http.MethodPost, "/v1/categories", aliceUserID, `{"publicationId":"` + alicePubID + `","name":"Nouvelle","slug":"nouvelle"}`, http.StatusInternalServerError},
		{"updateCategory-500", map[string]error{"UpdateCategory": errBoom}, http.MethodPatch, "/v1/categories/" + catID, aliceUserID, `{"name":"Renommee","slug":"renommee"}`, http.StatusInternalServerError},
		{"deleteCategory-500", map[string]error{"DeleteCategory": errBoom}, http.MethodDelete, "/v1/categories/" + catID, aliceUserID, "", http.StatusInternalServerError},
		// alice suit bob (aucun follow existant) → chemin InsertFollow.
		{"followToggle-insert-500", map[string]error{"InsertFollow": errBoom}, http.MethodPost, "/v1/users/" + bobUserID + "/follow", aliceUserID, "", http.StatusInternalServerError},
		// GetExistingFollow en erreur (non-NoRows) → 500.
		{"followToggle-check-500", map[string]error{"GetExistingFollow": errBoom}, http.MethodPost, "/v1/users/" + bobUserID + "/follow", aliceUserID, "", http.StatusInternalServerError},
		{"userMe-500", map[string]error{"GetUserByIDFull": errBoom}, http.MethodGet, "/v1/users/me", aliceUserID, "", http.StatusInternalServerError},
		{"userFollowing-500", map[string]error{"ListFollowingByUser": errBoom}, http.MethodGet, "/v1/users/alice/following", "", "", http.StatusInternalServerError},
		{"userFollowing-pub-500", map[string]error{"GetPublicationBySlugOrSubdomain": errBoom}, http.MethodGet, "/v1/users/alice/following", "", "", http.StatusInternalServerError},
		{"userFollowing-owner-500", map[string]error{"GetPublicationOwner": errBoom}, http.MethodGet, "/v1/users/alice/following", "", "", http.StatusInternalServerError},
		{"userFollowers-500", map[string]error{"ListFollowersByPublication": errBoom}, http.MethodGet, "/v1/users/alice/followers", "", "", http.StatusInternalServerError},
		{"userByUsername-500", map[string]error{"GetPublicationBySlugOrSubdomain": errBoom}, http.MethodGet, "/v1/users/alice", "", "", http.StatusInternalServerError},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := faultRouter(&faultQ{Queries: db.New(poolTest), fail: tc.qf}, &faultPool{Pool: poolTest})
			w := authedRequest(r, tc.method, tc.url, tc.userID, tc.body)
			if w.Code != tc.want {
				t.Fatalf("%s %s → %d (%s), attendu %d", tc.method, tc.url, w.Code, w.Body.String(), tc.want)
			}
		})
	}
}

func TestFault_Handlers_PoolErrors(t *testing.T) {
	// userByUsername : publication introuvable (ErrNoRows) puis fallback
	// pool.QueryRow en erreur → 404 (l'erreur pool n'écrase pas le NoRows).
	r := faultRouter(
		&faultQ{Queries: db.New(poolTest), fail: map[string]error{"GetPublicationBySlugOrSubdomain": pgx.ErrNoRows}},
		&faultPool{Pool: poolTest, failQueryRow: true},
	)
	w := authedRequest(r, http.MethodGet, "/v1/users/ghost", "", "")
	if w.Code != http.StatusNotFound {
		t.Fatalf("userByUsername pool fallback → %d (%s), attendu 404", w.Code, w.Body.String())
	}
}
