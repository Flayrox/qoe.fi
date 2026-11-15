// Conversion HTML → Markdown pour l'export.
//
// Volontairement compacte : elle couvre ce que produit l'éditeur (titres,
// paragraphes, gras/italique, liens, images, listes, citations) et laisse le
// HTML brut dans un fichier séparé pour ne rien perdre.
package exports

import (
	"regexp"
	"strings"
)

var (
	reHeading  = regexp.MustCompile(`(?is)<h([1-6])[^>]*>(.*?)</h[1-6]>`)
	rePara     = regexp.MustCompile(`(?is)</p\s*>`)
	reBold     = regexp.MustCompile(`(?is)</?(strong|b)\b[^>]*>`)
	reItalic   = regexp.MustCompile(`(?is)</?(em|i)\b[^>]*>`)
	reLink     = regexp.MustCompile(`(?is)<a\s[^>]*href="([^"]*)"[^>]*>(.*?)</a>`)
	reImage    = regexp.MustCompile(`(?is)<img\s[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*/?>`)
	reImageAlt = regexp.MustCompile(`(?is)<img\s[^>]*src="([^"]*)"[^>]*/?>`)
	reLi       = regexp.MustCompile(`(?is)<li[^>]*>(.*?)</li>`)
	reQuote    = regexp.MustCompile(`(?is)<blockquote[^>]*>(.*?)</blockquote>`)
	reBr       = regexp.MustCompile(`(?is)<br\s*/?>`)
	reTags     = regexp.MustCompile(`(?is)<[^>]+>`)
	reSpaces   = regexp.MustCompile(`[ \t]+`)
	reBlank    = regexp.MustCompile(`\n{3,}`)
)

// HTMLToMarkdown convertit un fragment HTML en Markdown lisible.
func HTMLToMarkdown(html string) string {
	out := html

	out = reHeading.ReplaceAllStringFunc(out, func(m string) string {
		sub := reHeading.FindStringSubmatch(m)
		if len(sub) != 3 {
			return m
		}
		level := int(sub[1][0] - '0')
		return "\n\n" + strings.Repeat("#", level) + " " + strings.TrimSpace(sub[2]) + "\n\n"
	})
	out = rePara.ReplaceAllString(out, "\n\n")
	out = reBr.ReplaceAllString(out, "\n")
	out = reLi.ReplaceAllString(out, "\n- $1")
	out = reQuote.ReplaceAllString(out, "\n> $1\n")
	out = reBold.ReplaceAllString(out, "**")
	out = reItalic.ReplaceAllString(out, "*")
	out = reImage.ReplaceAllString(out, "![$2]($1)")
	out = reImageAlt.ReplaceAllString(out, "![]($1)")
	out = reLink.ReplaceAllString(out, "[$2]($1)")
	out = reTags.ReplaceAllString(out, "")
	out = decodeEntities(out)
	out = reSpaces.ReplaceAllString(out, " ")
	out = reBlank.ReplaceAllString(out, "\n\n")
	return strings.TrimSpace(out) + "\n"
}

func decodeEntities(s string) string {
	replacer := strings.NewReplacer(
		"&nbsp;", " ",
		"&amp;", "&",
		"&lt;", "<",
		"&gt;", ">",
		"&quot;", `"`,
		"&#39;", "'",
		"&rsquo;", "’",
		"&laquo;", "«",
		"&raquo;", "»",
	)
	return replacer.Replace(s)
}
