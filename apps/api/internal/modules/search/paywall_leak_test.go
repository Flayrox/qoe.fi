package search

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/meilisearch/meilisearch-go"
)

// Contenu de test avec marqueur de paywall explicite.
const leakyPremiumContent = `<p>Teaser public.</p><!--members-only--><p>PAYANT SENSIBLE : la suite réservée.</p>`

func searchWithQuery(h *Handler, target string) *httptest.ResponseRecorder {
	r := chi.NewRouter()
	h.RegisterPublic(r)
	req := httptest.NewRequest(http.MethodGet, target, nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func premiumHits() meilisearch.Hits {
	return meilisearch.Hits{
		meilisearch.Hit{
			"id":        json.RawMessage(`"art_premium"`),
			"title":     json.RawMessage(`"Enquête"`),
			"isPremium": json.RawMessage(`true`),
			"content":   json.RawMessage(strconvQuote(leakyPremiumContent)),
		},
		meilisearch.Hit{
			"id":        json.RawMessage(`"art_free"`),
			"title":     json.RawMessage(`"Libre"`),
			"isPremium": json.RawMessage(`false`),
			"content":   json.RawMessage(`"<p>Tout public</p>"`),
		},
	}
}

func strconvQuote(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}

// 🔒 Zéro-fuite : la recherche publique (Cmd+K du reader) ne doit jamais
// renvoyer le passage réservé d'un article premium dans ses hits.
func TestSearchArticlesPublic_RedactsPremiumContent(t *testing.T) {
	h := &Handler{searcher: stubSearcher{
		resp: &meilisearch.SearchResponse{Hits: premiumHits()},
	}}
	w := searchWithQuery(h, "/search/articles?q=enquete")

	if w.Code != http.StatusOK {
		t.Fatalf("code = %d, attendu 200", w.Code)
	}
	if strings.Contains(w.Body.String(), "PAYANT SENSIBLE") {
		t.Fatal("fuite du passage réservé dans la recherche publique")
	}

	var out struct {
		Hits []map[string]json.RawMessage `json:"hits"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("json: %v", err)
	}
	if len(out.Hits) != 2 {
		t.Fatalf("hits = %d, attendu 2", len(out.Hits))
	}
	var premium string
	if err := json.Unmarshal(out.Hits[0]["content"], &premium); err != nil {
		t.Fatalf("content premium: %v", err)
	}
	if !strings.Contains(premium, "Teaser public.") {
		t.Fatalf("le teaser public doit rester visible, got %q", premium)
	}
	// L'article public n'est pas altéré.
	var free string
	if err := json.Unmarshal(out.Hits[1]["content"], &free); err != nil {
		t.Fatalf("content public: %v", err)
	}
	if !strings.Contains(free, "Tout public") {
		t.Fatalf("contenu public altéré: %q", free)
	}
}

// Le scope studio (filtre publicationId, créateur authentifié) conserve le
// contenu complet : la rédaction doit pouvoir chercher dans ses propres écrits.
func TestSearchArticlesStudioScope_KeepsFullContent(t *testing.T) {
	h := &Handler{searcher: stubSearcher{
		resp: &meilisearch.SearchResponse{Hits: premiumHits()},
	}}
	w := searchWithQuery(h, "/search/articles?q=enquete&publicationId=pub_1")

	if !strings.Contains(w.Body.String(), "PAYANT SENSIBLE") {
		t.Fatal("le scope studio doit conserver le contenu complet")
	}
}

// Test unitaire de la fonction de rédaction : les hits sans drapeau
// `isPremium` (documents anciens) ne doivent pas paniquer et rester intacts.
func TestRedactPremiumHitContents_MissingFlags(t *testing.T) {
	hits := meilisearch.Hits{
		meilisearch.Hit{"id": json.RawMessage(`"x"`), "content": json.RawMessage(`"<p>ok</p>"`)},
	}
	redactPremiumHitContents(hits)
	var got string
	if err := json.Unmarshal(hits[0]["content"], &got); err != nil {
		t.Fatalf("content: %v", err)
	}
	if !strings.Contains(got, "ok") {
		t.Fatalf("hit sans isPremium altéré: %q", got)
	}
}
