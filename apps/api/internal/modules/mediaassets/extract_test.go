package mediaassets

import (
	"reflect"
	"testing"
)

func TestExtractImageURLs(t *testing.T) {
	html := `<p>Hello</p>
		<img src="https://cdn.qoe.fi/articles/a.webp" alt="a">
		<IMG SRC='https://cdn.qoe.fi/articles/b.jpg' width="10">
		<img src="https://cdn.qoe.fi/articles/a.webp">
		<img src="/relative/path.png">
		<img src="data:image/png;base64,xx">
		<img alt="no src">`
	got := ExtractImageURLs(html)
	want := []string{
		"https://cdn.qoe.fi/articles/a.webp",
		"https://cdn.qoe.fi/articles/b.jpg",
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("ExtractImageURLs = %v, attendu %v", got, want)
	}
}

func TestExtractImageURLs_Empty(t *testing.T) {
	if got := ExtractImageURLs(""); len(got) != 0 {
		t.Errorf("vide = %v", got)
	}
	if got := ExtractImageURLs("<p>sans image</p>"); len(got) != 0 {
		t.Errorf("sans image = %v", got)
	}
}

func TestExtractImageURLs_Malformed(t *testing.T) {
	// src sans guillemets : ignoré (pas de match fiable).
	if got := ExtractImageURLs(`<img src=https://cdn.qoe.fi/x.webp>`); len(got) != 0 {
		t.Errorf("sans guillemets = %v", got)
	}
	// Espaces autour du = acceptés.
	got := ExtractImageURLs(`<img  src = "https://cdn.qoe.fi/y.webp" >`)
	if len(got) != 1 || got[0] != "https://cdn.qoe.fi/y.webp" {
		t.Errorf("espaces = %v", got)
	}
}

func TestNormalizeAssetURLs(t *testing.T) {
	got := normalizeAssetURLs([]string{
		"  https://cdn.qoe.fi/a.webp  ",
		"https://cdn.qoe.fi/a.webp",
		"",
		"   ",
		"/relative.png",
		"javascript:alert(1)",
		"http://cdn.qoe.fi/b.webp",
	})
	want := []string{"http://cdn.qoe.fi/b.webp", "https://cdn.qoe.fi/a.webp"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("normalize = %v, attendu %v", got, want)
	}
	if got := normalizeAssetURLs(nil); len(got) != 0 {
		t.Errorf("nil = %v", got)
	}
}
