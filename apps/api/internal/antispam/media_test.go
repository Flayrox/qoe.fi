package antispam

import (
	"errors"
	"strings"
	"testing"
)

// policy de test : CDN public + origine Supabase Storage.
func testMediaPolicy() MediaPolicy {
	return NewMediaPolicy("https://cdn.qoe.fi", "https://abc.supabase.co/")
}

func wantRejectionCode(t *testing.T, err error, code string) {
	t.Helper()
	if err == nil {
		t.Fatalf("erreur attendue (%s), aucune reçue", code)
	}
	var rej *RejectionError
	if !errors.As(err, &rej) {
		t.Fatalf("erreur non typée RejectionError: %v", err)
	}
	if rej.Code != code {
		t.Fatalf("code = %q, attendu %q (message: %s)", rej.Code, code, rej.Message)
	}
}

func TestMediaPolicy_Accepts(t *testing.T) {
	p := testMediaPolicy()
	ok := []string{
		"",
		"   ",
		"/storage/v1/object/public/articles-media/a.webp",
		"https://cdn.qoe.fi/articles/a.webp",
		"https://CDN.QOE.FI/articles/a.webp",     // hôte insensible à la casse
		"https://cdn.qoe.fi:443/articles/a.webp", // port explicite
		"https://abc.supabase.co/storage/v1/object/public/articles-media/a.webp",
	}
	for _, raw := range ok {
		if err := p.Validate(raw); err != nil {
			t.Errorf("URL refusée à tort (%q): %v", raw, err)
		}
	}
}

func TestMediaPolicy_RejectsExternalHost(t *testing.T) {
	p := testMediaPolicy()
	for _, raw := range []string{
		"https://evil.test/a.webp",
		"http://cdn.qoe.fi.evil.test/a.webp", // suffixe trompeur
		"https://abc.supabase.co.evil.test/storage/v1/object/public/a.webp",
	} {
		wantRejectionCode(t, p.Validate(raw), CodeUnscreenedMedia)
	}
}

func TestMediaPolicy_RejectsUnsafeForms(t *testing.T) {
	p := testMediaPolicy()
	wantRejectionCode(t, p.Validate("https://user:pass@cdn.qoe.fi/a.webp"), CodeUnsafeURL)
	wantRejectionCode(t, p.Validate("https://cdn.qoe.fi/a.webp\nHost: evil"), CodeUnsafeURL)
	wantRejectionCode(t, p.Validate("ftp://cdn.qoe.fi/a.webp"), CodeUnsafeURL)
	wantRejectionCode(t, p.Validate("//evil.test/a.webp"), CodeUnsafeURL)
	wantRejectionCode(t, p.Validate("javascript:alert(1)"), CodeUnsafeURL)
	wantRejectionCode(t, p.Validate("data:image/png;base64,AAAA"), CodeUnsafeURL)
}

func TestMediaPolicy_FailClosedWithoutOrigins(t *testing.T) {
	p := NewMediaPolicy()
	if err := p.Validate("/local/a.webp"); err != nil {
		t.Fatalf("chemin relatif refusé: %v", err)
	}
	wantRejectionCode(t, p.Validate("https://cdn.qoe.fi/a.webp"), CodeUnscreenedMedia)
}

func TestMediaPolicy_JSONList(t *testing.T) {
	p := testMediaPolicy()
	if err := p.Validate(`["https://cdn.qoe.fi/a.webp","https://abc.supabase.co/storage/v1/object/public/b.webp"]`); err != nil {
		t.Fatalf("liste valide refusée: %v", err)
	}

	// Une seule entrée hors plateforme suffit à refuser la publication.
	wantRejectionCode(t,
		p.Validate(`["https://cdn.qoe.fi/a.webp","https://evil.test/b.png"]`),
		CodeUnscreenedMedia)

	wantRejectionCode(t, p.Validate(`[not-json`), CodeUnsafeURL)
	wantRejectionCode(t, p.Validate(`[{"url":"https://cdn.qoe.fi/a.webp"}]`), CodeUnsafeURL)

	tooMany := `["` + strings.Repeat(`https://cdn.qoe.fi/a.webp","`, MaxMediaURLsPerField) + `https://cdn.qoe.fi/a.webp"]`
	wantRejectionCode(t, p.Validate(tooMany), CodeUnsafeURL)
}

func TestNewMediaPolicy_NormalizesOrigins(t *testing.T) {
	p := NewMediaPolicy(" https://cdn.qoe.fi/path ", "cdn.qoe.fi", "", "pas une url", "https://cdn.qoe.fi")
	origins := p.Origins()
	if len(origins) != 1 || origins[0] != "cdn.qoe.fi" {
		t.Fatalf("origines = %v, attendu [cdn.qoe.fi] (dédoublonnées)", origins)
	}
	// « pas une url » contient une espace : hôte invalide, donc ignorée.
	if err := p.Validate("https://cdn.qoe.fi/a.webp"); err != nil {
		t.Fatalf("CDN refusé: %v", err)
	}
	wantRejectionCode(t, p.Validate("https://pas une url/a.webp"), CodeUnsafeURL)
}
