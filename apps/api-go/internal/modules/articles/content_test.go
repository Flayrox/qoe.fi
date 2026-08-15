package articles

import (
	"strings"
	"testing"
)

func TestNormalizeContentMarkdown(t *testing.T) {
	md := "# Titre\n\nUn **paragraphe** avec du contenu.\n\n- item 1\n- item 2\n"
	html := NormalizeContent(md, ContentFormatMarkdown)

	for _, want := range []string{"<h1>Titre</h1>", "<strong>paragraphe</strong>", "<li>item 1</li>"} {
		if !strings.Contains(html, want) {
			t.Errorf("markdown → HTML : %q introuvable dans %q", want, html)
		}
	}
}

// TestNormalizeContentMarkdownEscapesRawHTML : le raw HTML injecté dans du
// markdown ne doit JAMAIS passer tel quel (sécurité, zéro XSS).
func TestNormalizeContentMarkdownEscapesRawHTML(t *testing.T) {
	md := "Texte <script>alert(1)</script>"
	html := NormalizeContent(md, ContentFormatMarkdown)
	if strings.Contains(html, "<script>") {
		t.Fatalf("fuite raw HTML depuis markdown : %q", html)
	}
}

func TestNormalizeContentHTMLPassthrough(t *testing.T) {
	html := "<p>Déjà du HTML</p>"
	if got := NormalizeContent(html, ContentFormatHTML); got != html {
		t.Errorf("html → tel quel attendu, got %q", got)
	}
	// Chaîne vide = html (comportement historique, rétro-compatible).
	if got := NormalizeContent(html, ""); got != html {
		t.Errorf("vide → html (historique) attendu, got %q", got)
	}
}

func TestIsValidContentFormat(t *testing.T) {
	for _, ok := range []string{"", "html", "markdown"} {
		if !IsValidContentFormat(ok) {
			t.Errorf("format %q doit être valide", ok)
		}
	}
	for _, bad := range []string{"xml", "MD", "text", "markdown2"} {
		if IsValidContentFormat(bad) {
			t.Errorf("format %q doit être invalide", bad)
		}
	}
}
