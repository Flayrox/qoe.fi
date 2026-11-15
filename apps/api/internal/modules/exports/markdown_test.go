package exports

import (
	"strings"
	"testing"
)

func TestHTMLToMarkdown_CouvreLesBlocsDeLEditeur(t *testing.T) {
	html := `<h2>Un titre</h2><p>Un <strong>mot</strong> et un <em>autre</em>.</p>` +
		`<p><a href="https://qoe.fi">lien</a> <img src="https://cdn.test/a.png" alt="photo"></p>` +
		`<ul><li>un</li><li>deux</li></ul><blockquote>citation</blockquote>`

	md := HTMLToMarkdown(html)

	for _, want := range []string{
		"## Un titre",
		"**mot**",
		"*autre*",
		"[lien](https://qoe.fi)",
		"![photo](https://cdn.test/a.png)",
		"- un",
		"- deux",
		"> citation",
	} {
		if !strings.Contains(md, want) {
			t.Fatalf("markdown sans %q :\n%s", want, md)
		}
	}
	if strings.Contains(md, "<p>") || strings.Contains(md, "<strong>") {
		t.Fatalf("balises non converties :\n%s", md)
	}
}

func TestHTMLToMarkdown_EntitesEtEspaces(t *testing.T) {
	md := HTMLToMarkdown(`<p>A&nbsp;&amp;&nbsp;B &laquo; cité &raquo;</p>`)
	if !strings.Contains(md, "A & B « cité »") {
		t.Fatalf("entités mal décodées : %q", md)
	}
	if strings.HasPrefix(md, "\n") {
		t.Fatalf("le markdown ne doit pas commencer par une ligne vide")
	}
}

func TestSafeFileName(t *testing.T) {
	cases := map[string]string{
		"Mon article d'été": "mon-article-dt",
		"../etc/passwd":     "etc-passwd",
		"":                  "article",
		"---":               "article",
	}
	for in, want := range cases {
		if got := SafeFileName(in); got != want {
			t.Fatalf("SafeFileName(%q) = %q, attendu %q", in, got, want)
		}
	}
}
