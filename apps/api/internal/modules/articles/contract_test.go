package articles

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

// ─────────────────────────────────────────────────────────────────────────────
// Golden tests — Contrat API créateurs
//
// Les fixtures dans testdata/ sont issues du contrat Hono réel
// (apps/api/src/app.ts) : enveloppe `{data, pagination}`, items `contentHtml`
// tronqués, `category` embarquée. Toute divergence de forme (nommage, ordre
// des champs, pagination) casse le test.
// ─────────────────────────────────────────────────────────────────────────────

func mustReadGolden(t *testing.T, name string) []byte {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatalf("lecture fixture %s: %v", name, err)
	}
	return b
}

func mustMarshal(t *testing.T, v any) []byte {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	return b
}

// sampleCategory et sampleItem reproduisent les valeurs verrouillées par la
// fixture Hono (apps/api/src/test/creator-api/articles.test.ts).
func sampleCategory() *CreatorCategory {
	return &CreatorCategory{ID: "cat-1", Name: "Tech", Slug: "tech", Description: nil}
}

func sampleArticleResponse() ArticleResponse {
	return ArticleResponse{
		ID: "art_1", Title: "First Post", Slug: "first-post",
		Content:     "<p>Free teaser</p>",
		IsTruncated: true, Visibility: VisPaidSubscribers,
		ReadingTime: 5, IsPremium: true,
		CreatedAt: "2026-08-01T10:00:00Z", UpdatedAt: "2026-08-01T10:00:00Z",
		PaywallMeta: &PaywallMeta{
			Visibility:            VisPaidSubscribers,
			TeaserParagraphsCount: 1,
			RequiredTierID:        nil,
			TotalLengthBytes:      120,
			PreviewLengthBytes:    60,
		},
	}
}

// assertGoldenJSON compare sémantiquement (JSON parsé) : la forme compte
// (noms de champs, valeurs), pas l'ordre des clés ni le formatage des fixtures.
func assertGoldenJSON(t *testing.T, got []byte, fixture string) {
	t.Helper()
	var gotV, wantV any
	if err := json.Unmarshal(got, &gotV); err != nil {
		t.Fatalf("got non-JSON: %v", err)
	}
	if err := json.Unmarshal(mustReadGolden(t, fixture), &wantV); err != nil {
		t.Fatalf("fixture %s non-JSON: %v", fixture, err)
	}
	if !reflect.DeepEqual(gotV, wantV) {
		t.Errorf("contrat divergent du golden Hono (%s)\n--- got ---\n%s\n--- want ---\n%s", fixture, got, mustReadGolden(t, fixture))
	}
}

func TestToCreatorItemGolden(t *testing.T) {
	item := ToCreatorItem(sampleArticleResponse(), sampleCategory())
	assertGoldenJSON(t, mustMarshal(t, item), "creator-article-item.golden.json")
}

func TestToCreatorListGolden(t *testing.T) {
	item := ToCreatorItem(sampleArticleResponse(), sampleCategory())
	resp := ToCreatorList([]CreatorItem{item}, 1, 1, 10)
	assertGoldenJSON(t, mustMarshal(t, resp), "creator-articles-list.golden.json")
}

func TestParsePageLimit(t *testing.T) {
	cases := []struct {
		pageStr, limitStr string
		wantPage, wantLim int
	}{
		{"", "", 1, 10},           // défauts Hono
		{"3", "20", 3, 20},        // pagination explicite
		{"999", "1000", 999, 100}, // limit bornée à 100
		{"0", "0", 1, 10},         // valeurs invalides → défauts
		{"abc", "-5", 1, 10},      // non numériques → défauts
	}
	for _, c := range cases {
		page, limit := ParsePageLimit(c.pageStr, c.limitStr)
		if page != c.wantPage || limit != c.wantLim {
			t.Errorf("ParsePageLimit(%q, %q) = (%d, %d), want (%d, %d)", c.pageStr, c.limitStr, page, limit, c.wantPage, c.wantLim)
		}
	}
}

func TestPageToOffset(t *testing.T) {
	cases := []struct {
		page, limit, want int
	}{
		{1, 10, 0},
		{3, 10, 20},
		{2, 50, 50},
		{0, 10, 0}, // page < 1 → clamp à 1
		{1, 0, 0},  // limit < 1 → clamp à 1
	}
	for _, c := range cases {
		if got := PageToOffset(c.page, c.limit); got != c.want {
			t.Errorf("PageToOffset(%d, %d) = %d, want %d", c.page, c.limit, got, c.want)
		}
	}
}

// TestCreatorItemZeroLeak verrouille la propriété contractuelle la plus
// sensible : le contenu payant n'est JAMAIS transmis dans un item créateur.
func TestCreatorItemZeroLeak(t *testing.T) {
	raw := "<p>Free teaser</p><div data-type=\"paywall-divider\"></div><p>Secret premium body</p>"

	cut := SliceContentAtPaywall(raw, UserEntitlements{}, VisPaidSubscribers, nil)
	resp := ArticleResponse{
		ID: "art_1", Title: "Premium", Slug: "premium",
		Content: cut.Content, IsTruncated: cut.IsTruncated,
		Visibility: VisPaidSubscribers, PaywallMeta: cut.PaywallMeta,
	}
	item := ToCreatorItem(resp, nil)

	if strings.Contains(item.ContentHTML, "Secret premium body") {
		t.Fatalf("fuite paywall : contenu payant transmis dans contentHtml=%q", item.ContentHTML)
	}
	if !item.IsTruncated {
		t.Error("isTruncated doit être true pour un article tronqué")
	}
	if item.PaywallMeta == nil {
		t.Error("paywallMeta doit être présent quand le contenu est tronqué")
	}
}
