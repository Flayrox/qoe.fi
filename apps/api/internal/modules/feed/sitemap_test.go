package feed

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
)

// TestSitemapArticles — catalogue SEO slim paginé (index de sitemaps) :
// shape {items, total}, pagination par offset, borne de limite, 404-free.
func TestSitemapArticles(t *testing.T) {
	requirePool(t)
	if _, err := seedEngine(context.Background(), poolTest); err != nil {
		t.Fatalf("seed engine: %v", err)
	}
	r := newRouter(t, "")

	rr := keyGet(t, r, "/v1/seo/sitemap-articles?limit=5&offset=0")
	if rr.Code != http.StatusOK {
		t.Fatalf("sitemap-articles = %d %s", rr.Code, rr.Body.String())
	}
	var out struct {
		Items []struct {
			Slug      string `json:"slug"`
			Owner     string `json:"owner"`
			UpdatedAt string `json:"updatedAt"`
		} `json:"items"`
		Total  int64 `json:"total"`
		Limit  int   `json:"limit"`
		Offset int   `json:"offset"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
		t.Fatalf("json: %v", err)
	}
	if out.Total < int64(len(out.Items)) {
		t.Fatalf("total=%d < items=%d", out.Total, len(out.Items))
	}
	if out.Limit != 5 || out.Offset != 0 {
		t.Fatalf("pagination = (%d, %d), attendu (5, 0)", out.Limit, out.Offset)
	}
	for _, it := range out.Items {
		if it.Slug == "" || it.Owner == "" || it.UpdatedAt == "" {
			t.Fatalf("entrée incomplète : %+v", it)
		}
	}

	// Offset au-delà du total → page vide, total inchangé.
	rr2 := keyGet(t, r, "/v1/seo/sitemap-articles?limit=5&offset=1000000")
	if rr2.Code != http.StatusOK {
		t.Fatalf("offset énorme = %d", rr2.Code)
	}
	var out2 struct {
		Items []any `json:"items"`
		Total int64 `json:"total"`
	}
	if err := json.Unmarshal(rr2.Body.Bytes(), &out2); err != nil {
		t.Fatalf("json: %v", err)
	}
	if len(out2.Items) != 0 || out2.Total != out.Total {
		t.Fatalf("page vide = (%d items, total %d), attendu (0, %d)",
			len(out2.Items), out2.Total, out.Total)
	}

	// Limite excessive → bornée à 1000.
	rr3 := keyGet(t, r, "/v1/seo/sitemap-articles?limit=999999")
	var out3 struct {
		Limit int `json:"limit"`
	}
	if err := json.Unmarshal(rr3.Body.Bytes(), &out3); err != nil {
		t.Fatalf("json: %v", err)
	}
	if out3.Limit != 1000 {
		t.Fatalf("limite = %d, attendu borne 1000", out3.Limit)
	}
}
