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
	reHeading = regexp.MustCompile(`(?is)<h([1-6])[^>]*>(.*?)</h[1-6]>`)
	rePara    = regexp.MustCompile(`(?is)</p\s*>`)
	reBold    = regexp.MustCompile(`(?is)</?(strong|b)\b[^>]*>`)
	reItalic  = regexp.MustCompile(`(?is)</?(em|i)\b[^>]*>`)
	// Les attributs sont lus indépendamment de leur ordre et des guillemets :
	// un HTML importé écrit souvent `alt` avant `src`, ou en guillemets
	// simples, et la conversion perdait alors le texte alternatif ou le lien.
	reImgTag  = regexp.MustCompile(`(?is)<img\b[^>]*>`)
	reAnchor  = regexp.MustCompile(`(?is)<a\b([^>]*)>(.*?)</a>`)
	reSrcAttr = regexp.MustCompile(`(?is)\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')`)
	reAltAttr = regexp.MustCompile(`(?is)\balt\s*=\s*(?:"([^"]*)"|'([^']*)')`)
	reHref    = regexp.MustCompile(`(?is)\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')`)
	reLi      = regexp.MustCompile(`(?is)<li[^>]*>(.*?)</li>`)
	reQuote   = regexp.MustCompile(`(?is)<blockquote[^>]*>(.*?)</blockquote>`)
	reBr      = regexp.MustCompile(`(?is)<br\s*/?>`)
	reTags    = regexp.MustCompile(`(?is)<[^>]+>`)
	reSpaces  = regexp.MustCompile(`[ \t]+`)
	reBlank   = regexp.MustCompile(`\n{3,}`)
)

// attrValue extrait la valeur d'un attribut (guillemets doubles ou simples).
func attrValue(re *regexp.Regexp, tag string) string {
	m := re.FindStringSubmatch(tag)
	if m == nil {
		return ""
	}
	if m[1] != "" {
		return m[1]
	}
	return m[2]
}

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
	out = reImgTag.ReplaceAllStringFunc(out, func(tag string) string {
		src := attrValue(reSrcAttr, tag)
		if src == "" {
			// Sans source, il n'y a pas d'image à exporter.
			return ""
		}
		return "![" + attrValue(reAltAttr, tag) + "](" + src + ")"
	})
	out = reAnchor.ReplaceAllStringFunc(out, func(m string) string {
		sub := reAnchor.FindStringSubmatch(m)
		if sub == nil {
			return m
		}
		href := attrValue(reHref, sub[1])
		if href == "" {
			return sub[2]
		}
		return "[" + sub[2] + "](" + href + ")"
	})
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
