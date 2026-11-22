package exports

import (
	"strings"
	"testing"
)

// TestAuditL29V_MarkdownKeepsAltBeforeSrc : la conversion ne reconnaissait une
// image que si `src` précédait `alt` ; un HTML importé dans l'autre ordre
// perdait son texte alternatif dans l'archive Markdown.
func TestAuditL29V_MarkdownKeepsAltBeforeSrc(t *testing.T) {
	cases := map[string]string{
		`<p><img alt="Schéma" src="/schema.png"></p>`: "![Schéma](/schema.png)",
		`<p><img alt='Schéma' src='/schema.png'></p>`: "![Schéma](/schema.png)",
		`<p><a href='/notice'>notice</a></p>`:         "[notice](/notice)",
		`<p><img src="/logo.png" alt="Logo"></p>`:     "![Logo](/logo.png)",
		`<p><img alt="Sans source"></p>`:              "",
	}
	for in, want := range cases {
		md := HTMLToMarkdown(in)
		if want == "" {
			if strings.Contains(md, "![") {
				t.Fatalf("%q → %q, attendu aucune image", in, md)
			}
			continue
		}
		if !strings.Contains(md, want) {
			t.Fatalf("%q → %q, attendu %q", in, md, want)
		}
	}
}
