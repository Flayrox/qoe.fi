package home

// =====================================================================
// 🌍 Tests de la langue d'inscription (Subscriber.locale)
// =====================================================================
// La langue des emails (confirmation, bienvenue) est celle du lecteur :
// résolue à l'inscription ( ?locale= puis Accept-Language, bornée fr/en )
// et stockée sur l'abonné.

import (
	"context"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/qoefi/api/internal/testutil"
)

func TestNormalizeSubscribeLocale(t *testing.T) {
	cases := map[string]string{
		"fr":        "fr",
		"en":        "en",
		"en-US":     "en",
		"fr-CA":     "fr",
		"de-DE":     "fr",
		"":          "fr",
		" en;q=0.9": "en",
	}
	for raw, want := range cases {
		r := httptest.NewRequest("POST", "/v1/home/subscribe", nil)
		r.URL.RawQuery = "locale=" + url.QueryEscape(raw)
		if got := normalizeSubscribeLocale(r); got != want {
			t.Errorf("locale(%q) = %q, attendu %q", raw, got, want)
		}
	}
	// Header Accept-Language sans query param.
	r := httptest.NewRequest("POST", "/v1/home/subscribe", nil)
	r.Header.Set("Accept-Language", "en-GB,en;q=0.8")
	if got := normalizeSubscribeLocale(r); got != "en" {
		t.Errorf("Accept-Language en-GB → %q, attendu en", got)
	}
}

func TestSubscribeToNewsletter_StoresLocale(t *testing.T) {
	ctx := context.Background()
	seedHomeWidgets(t, ctx)
	svc := newTestService()

	if _, err := svc.SubscribeToNewsletter(ctx, "locale-fr@qoe.test", "pub_home_001", "fr"); err != nil {
		t.Fatalf("subscribe fr: %v", err)
	}
	if _, err := svc.SubscribeToNewsletter(ctx, "locale-en@qoe.test", "pub_home_001", "en"); err != nil {
		t.Fatalf("subscribe en: %v", err)
	}

	var frLocale, enLocale string
	pool := testutil.MustPool(t)
	if err := pool.QueryRow(ctx,
		`SELECT locale FROM "Subscriber" WHERE email = 'locale-fr@qoe.test' AND "publicationId" = 'pub_home_001'`).Scan(&frLocale); err != nil {
		t.Fatalf("lecture locale fr: %v", err)
	}
	if err := pool.QueryRow(ctx,
		`SELECT locale FROM "Subscriber" WHERE email = 'locale-en@qoe.test' AND "publicationId" = 'pub_home_001'`).Scan(&enLocale); err != nil {
		t.Fatalf("lecture locale en: %v", err)
	}
	if frLocale != "fr" || enLocale != "en" {
		t.Errorf("locales stockées = (%q, %q), attendu (fr, en)", frLocale, enLocale)
	}

	// Re-inscription : la locale d'origine est conservée (le conflit ne
	// réécrit pas la langue).
	if _, err := svc.SubscribeToNewsletter(ctx, "locale-en@qoe.test", "pub_home_001", "fr"); err != nil {
		t.Fatalf("resubscribe: %v", err)
	}
	if err := pool.QueryRow(ctx,
		`SELECT locale FROM "Subscriber" WHERE email = 'locale-en@qoe.test' AND "publicationId" = 'pub_home_001'`).Scan(&enLocale); err != nil {
		t.Fatalf("relecture locale: %v", err)
	}
	if enLocale != "en" {
		t.Errorf("re-inscription a écrasé la locale : %q, attendu en", enLocale)
	}
}
