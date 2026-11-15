package search

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/meilisearch/meilisearch-go"
)

// stubSearcher implémente Searcher pour les tests. `got` capture la requête
// réellement transmise à Meilisearch (limite, offset, filtre).
type stubSearcher struct {
	resp *meilisearch.SearchResponse
	err  error
	got  *meilisearch.SearchRequest
}

func (s stubSearcher) Search(_ string, req *meilisearch.SearchRequest) (*meilisearch.SearchResponse, error) {
	if s.got != nil {
		*s.got = *req
	}
	return s.resp, s.err
}

func doSearch(h *Handler, query string) *httptest.ResponseRecorder {
	return doSearchURL(h, "/search/articles?q="+query)
}

func doSearchURL(h *Handler, url string) *httptest.ResponseRecorder {
	r := chi.NewRouter()
	h.RegisterPublic(r)
	req := httptest.NewRequest(http.MethodGet, url, nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestSearchArticlesEmptyQuery(t *testing.T) {
	h := &Handler{searcher: stubSearcher{err: errors.New("ne doit pas être appelé")}}
	w := doSearch(h, "")

	if w.Code != http.StatusOK {
		t.Fatalf("code = %d, attendu 200", w.Code)
	}
	var out struct {
		Hits               []any `json:"hits"`
		EstimatedTotalHits int64 `json:"estimatedTotalHits"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("json invalide: %v", err)
	}
	if out.Hits == nil {
		t.Fatal("hits doit être [] et non null")
	}
	if out.EstimatedTotalHits != 0 {
		t.Fatalf("estimatedTotalHits = %d, attendu 0", out.EstimatedTotalHits)
	}
}

func TestSearchArticlesHits(t *testing.T) {
	hit := meilisearch.Hit{"id": json.RawMessage(`"art_1"`), "title": json.RawMessage(`"Climat"`)}
	h := &Handler{searcher: stubSearcher{
		resp: &meilisearch.SearchResponse{Hits: meilisearch.Hits{hit}, EstimatedTotalHits: 42},
	}}
	w := doSearch(h, "climat")

	if w.Code != http.StatusOK {
		t.Fatalf("code = %d, attendu 200", w.Code)
	}
	var out struct {
		Hits               []map[string]json.RawMessage `json:"hits"`
		EstimatedTotalHits int64                        `json:"estimatedTotalHits"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("json invalide: %v", err)
	}
	if len(out.Hits) != 1 {
		t.Fatalf("hits = %d, attendu 1", len(out.Hits))
	}
	if out.EstimatedTotalHits != 42 {
		t.Fatalf("estimatedTotalHits = %d, attendu 42", out.EstimatedTotalHits)
	}
	var id string
	if err := json.Unmarshal(out.Hits[0]["id"], &id); err != nil || id != "art_1" {
		t.Fatalf("id hit = %q, attendu art_1 (err=%v)", id, err)
	}
}

// dixHits construit n hits minimaux pour piloter la pagination.
func dixHits(n int) meilisearch.Hits {
	hits := make(meilisearch.Hits, 0, n)
	for i := 0; i < n; i++ {
		hits = append(hits, meilisearch.Hit{
			"id":    json.RawMessage(fmt.Sprintf(`"art_%d"`, i)),
			"title": json.RawMessage(`"Titre"`),
		})
	}
	return hits
}

func TestSearchArticlesRespectsLimitAndCursor(t *testing.T) {
	var got meilisearch.SearchRequest
	h := &Handler{searcher: stubSearcher{
		resp: &meilisearch.SearchResponse{Hits: dixHits(25), EstimatedTotalHits: 100},
		got:  &got,
	}}
	w := doSearchURL(h, "/search/articles?q=climat&limit=25&cursor=50")

	if w.Code != http.StatusOK {
		t.Fatalf("code = %d, attendu 200", w.Code)
	}
	if got.Limit != 25 {
		t.Fatalf("limit envoyée à Meili = %d, attendu 25", got.Limit)
	}
	if got.Offset != 50 {
		t.Fatalf("offset envoyé à Meili = %d, attendu 50", got.Offset)
	}
}

func TestSearchArticlesClampsLimit(t *testing.T) {
	cases := []struct {
		name string
		url  string
		want int64
	}{
		{"défaut sans paramètre", "/search/articles?q=x", 10},
		{"zéro retombe sur le défaut", "/search/articles?q=x&limit=0", 10},
		{"négatif retombe sur le défaut", "/search/articles?q=x&limit=-4", 10},
		{"non numérique retombe sur le défaut", "/search/articles?q=x&limit=abc", 10},
		{"borne haute", "/search/articles?q=x&limit=999", 50},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var got meilisearch.SearchRequest
			h := &Handler{searcher: stubSearcher{
				resp: &meilisearch.SearchResponse{Hits: dixHits(1), EstimatedTotalHits: 1},
				got:  &got,
			}}
			w := doSearchURL(h, tc.url)
			if w.Code != http.StatusOK {
				t.Fatalf("code = %d, attendu 200", w.Code)
			}
			if got.Limit != tc.want {
				t.Fatalf("limit = %d, attendu %d", got.Limit, tc.want)
			}
		})
	}
}

func TestSearchArticlesNextCursor(t *testing.T) {
	cases := []struct {
		name       string
		total      int64
		hits       int
		offset     string
		wantCursor string
	}{
		{"première page incomplète → fin", 7, 7, "", ""},
		{"première page pleine → suite", 42, 10, "", "10"},
		{"page intermédiaire", 42, 10, "10", "20"},
		{"dernière page", 42, 2, "40", ""},
		// Meilisearch peut omettre l'estimation sur certains index : une page
		// pleine doit alors laisser la possibilité de continuer.
		{"estimation absente mais page pleine", 0, 10, "", "10"},
		// Tous les hits d'une page filtrée font retomber l'estimation à 0 : le
		// curseur doit avancer des hits bruts consommés (même règle que
		// « estimation absente mais page pleine » ci-dessus), sinon « Charger
		// plus » rejouerait la même page vide.
		{"page suivante après page filtrée → fin", 10, 0, "10", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h := &Handler{searcher: stubSearcher{
				resp: &meilisearch.SearchResponse{Hits: dixHits(tc.hits), EstimatedTotalHits: tc.total},
			}}
			url := "/search/articles?q=x"
			if tc.offset != "" {
				url += "&cursor=" + tc.offset
			}
			w := doSearchURL(h, url)
			if w.Code != http.StatusOK {
				t.Fatalf("code = %d, attendu 200", w.Code)
			}
			var out struct {
				NextCursor *string `json:"nextCursor"`
			}
			if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
				t.Fatalf("json invalide: %v", err)
			}
			got := ""
			if out.NextCursor != nil {
				got = *out.NextCursor
			}
			if got != tc.wantCursor {
				t.Fatalf("nextCursor = %q, attendu %q", got, tc.wantCursor)
			}
		})
	}
}

// Une page dont tous les hits bruts ont été filtrés doit avancer le curseur,
// sinon le bouton « Charger plus » rejoue la même page vide.
func TestNextArticlesCursorFilteredPage(t *testing.T) {
	if got := nextArticlesCursor(0, 10, 0, 10); got != "10" {
		t.Fatalf("page filtrée: curseur = %v, attendu 10", got)
	}
	if got := nextArticlesCursor(10, 0, 0, 10); got != nil {
		t.Fatalf("fin de liste: curseur = %v, attendu nil", got)
	}
	if got := nextArticlesCursor(20, 3, 23, 10); got != nil {
		t.Fatalf("dernière page: curseur = %v, attendu nil", got)
	}
}

func TestSearchArticlesRejectsInvalidCursor(t *testing.T) {
	for _, cursor := range []string{"-1", "abc", "100001"} {
		t.Run(cursor, func(t *testing.T) {
			h := &Handler{searcher: stubSearcher{err: errors.New("ne doit pas être appelé")}}
			w := doSearchURL(h, "/search/articles?q=x&cursor="+cursor)
			if w.Code != http.StatusBadRequest {
				t.Fatalf("code = %d, attendu 400 (curseur %q)", w.Code, cursor)
			}
		})
	}
}

func TestSearchArticlesMeiliError(t *testing.T) {
	h := &Handler{searcher: stubSearcher{err: errors.New("meili down")}}
	w := doSearch(h, "climat")

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("code = %d, attendu 500", w.Code)
	}
}

func TestSearchArticlesPremiumRedactedWithPublisherID(t *testing.T) {
	// Fuite paywall : même avec publisherId, un appel anonyme (sans pool
	// donc sans preuve de propriété) doit retronquer le contenu premium.
	hit := meilisearch.Hit{
		"id":        json.RawMessage(`"art_9"`),
		"isPremium": json.RawMessage(`true`),
		"content":   json.RawMessage(`"teaser<!--members-only-->passage réservé"`),
	}
	h := &Handler{searcher: stubSearcher{
		resp: &meilisearch.SearchResponse{Hits: meilisearch.Hits{hit}, EstimatedTotalHits: 1},
	}}
	r := chi.NewRouter()
	h.RegisterPublic(r)
	req := httptest.NewRequest(http.MethodGet, "/search/articles?q=climat&publisherId=pub_1", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("code = %d, attendu 200", w.Code)
	}
	var out struct {
		Hits []map[string]json.RawMessage `json:"hits"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("json invalide: %v", err)
	}
	if len(out.Hits) != 1 {
		t.Fatalf("hits = %d, attendu 1", len(out.Hits))
	}
	var content string
	if err := json.Unmarshal(out.Hits[0]["content"], &content); err != nil {
		t.Fatalf("content illisible: %v", err)
	}
	if strings.Contains(content, "passage réservé") {
		t.Fatalf("fuite paywall : contenu premium complet exposé : %q", content)
	}
}

// ─── Recherche sémantique (/search/semantic) ─────────────────────────

func TestSearchSemanticEmptyQuery(t *testing.T) {
	h := &Handler{semantic: nil}
	r := chi.NewRouter()
	h.RegisterPublic(r)
	req := httptest.NewRequest(http.MethodGet, "/search/semantic?q=", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("code = %d, attendu 200", w.Code)
	}
	var out struct {
		Items []any `json:"items"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("json invalide: %v", err)
	}
	if out.Items == nil {
		t.Fatal("items doit être [] et non null")
	}
}

func TestSearchSemanticServiceUnavailable(t *testing.T) {
	// Sans EMBEDDING_URL → 503 (le fallback lexical reste disponible).
	t.Setenv("EMBEDDING_URL", "")
	// Le handler réel (semantic non nil) avec un vrai service → erreur 503.
	h := &Handler{semantic: &SemanticService{}}
	r := chi.NewRouter()
	h.RegisterPublic(r)
	req := httptest.NewRequest(http.MethodGet, "/search/semantic?q=climat", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("code = %d, attendu 503", w.Code)
	}
}
