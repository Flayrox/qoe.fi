package moderation

import (
	"regexp"
	"strings"
	"unicode"

	"golang.org/x/text/unicode/norm"
)

var (
	homoglyphReplacer = strings.NewReplacer(
		// Cyrillique minuscule & majuscule
		"а", "a", "А", "a",
		"в", "b", "В", "b",
		"е", "e", "Е", "e",
		"ё", "e", "Ё", "e",
		"ж", "zh", "Ж", "zh",
		"з", "z", "З", "z",
		"к", "k", "К", "k",
		"м", "m", "М", "m",
		"н", "h", "Н", "h",
		"о", "o", "О", "o",
		"р", "p", "Р", "p",
		"с", "c", "С", "c",
		"т", "t", "Т", "t",
		"у", "y", "У", "y",
		"х", "x", "Х", "x",
		"і", "i", "І", "i",
		// Grec
		"α", "a", "Α", "a",
		"β", "b", "Β", "b",
		"γ", "g", "Γ", "g",
		"ε", "e", "Ε", "e",
		"η", "h", "Η", "h",
		"ι", "i", "Ι", "i",
		"κ", "k", "Κ", "k",
		"ο", "o", "Ο", "o",
		"ρ", "p", "Ρ", "p",
		"τ", "t", "Τ", "t",
		"υ", "u", "Υ", "u",
		"χ", "x", "Χ", "x",
		"ω", "w", "Ω", "w",
	)

	leetspeakReplacer = strings.NewReplacer(
		"0", "o",
		"1", "i",
		"3", "e",
		"4", "a",
		"5", "s",
		"7", "t",
		"8", "b",
		"@", "a",
		"$", "s",
		"!", "i",
	)

	criticalBlockPatterns = []struct {
		pattern *regexp.Regexp
		code    string
		reason  string
	}{
		{
			pattern: regexp.MustCompile(`(?i)(je vais (te|vous|les) (tuer|égorger|egorger|abattre|buter|déchiqueter|dechiqueter|massacrer))`),
			code:    "MODERATION_THREAT",
			reason:  "Menace de violence directe détectée.",
		},
		{
			pattern: regexp.MustCompile(`(?i)(i will (kill|murder|slaughter|behead|shoot) (you|them|all))`),
			code:    "MODERATION_THREAT",
			reason:  "Menace de violence directe détectée.",
		},
		{
			pattern: regexp.MustCompile(`(?i)\b(pedoporn|cp links?|child porn|lolita sex|pedo files?)\b`),
			code:    "MODERATION_CSAM",
			reason:  "Contenu strictement interdit détecté.",
		},
		{
			pattern: regexp.MustCompile(`(?i)\b(heil hitler|sieg heil|gas the jews|mort aux juifs|mort aux arabes|mort aux noirs)\b`),
			code:    "MODERATION_HATE_VIOLENT",
			reason:  "Discours haineux violent détecté.",
		},
	}

	suspiciousScamPatterns = []*regexp.Regexp{
		regexp.MustCompile(`(?i)\b(seed phrase|recovery phrase|claim free airdrop|verify your wallet|double your crypto|crypto giveaway)\b`),
		regexp.MustCompile(`(?i)\b(urgent.{0,20}(bank|compte|wallet).{0,20}(suspended|bloqué|bloque|verify|vérifier|verifier))\b`),
	}
)

func stripInvisible(s string) (clean string, strippedCount int) {
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		switch r {
		case '\u200B', '\u200C', '\u200D', '\u2060', '\uFEFF', '\u00AD':
			strippedCount++
			continue
		default:
			b.WriteRune(r)
		}
	}
	return b.String(), strippedCount
}

// NormalizeHomoglyphs normalise en NFKC, retire les caractères invisibles et
// remplace les homoglyphes cyrilliques/grecs courants en latin ASCII minuscule.
func NormalizeHomoglyphs(raw string) string {
	nfkc := norm.NFKC.String(raw)
	cleaned, _ := stripInvisible(nfkc)
	return strings.ToLower(homoglyphReplacer.Replace(cleaned))
}

// DecodeLeetspeak convertit les substitutions leetspeak classiques après
// normalisation des homoglyphes.
func DecodeLeetspeak(raw string) string {
	return leetspeakReplacer.Replace(NormalizeHomoglyphs(raw))
}

// ScanFastPath exécute le filtrage déterministe synchrone (< 1 ms) sur le texte.
func ScanFastPath(raw string) Verdict {
	if strings.TrimSpace(raw) == "" {
		return Verdict{Action: ActionAllow}
	}

	_, invisibleCount := stripInvisible(raw)
	normalized := NormalizeHomoglyphs(raw)
	leet := leetspeakReplacer.Replace(normalized)

	for _, rule := range criticalBlockPatterns {
		if rule.pattern.MatchString(raw) || rule.pattern.MatchString(normalized) || rule.pattern.MatchString(leet) {
			return Verdict{
				Action:     ActionBlock,
				ReasonCode: rule.code,
				Reason:     rule.reason,
			}
		}
	}

	flags := make(map[string]bool)
	if invisibleCount >= 5 {
		flags["obfuscation_invisible"] = true
	}
	for _, p := range suspiciousScamPatterns {
		if p.MatchString(raw) || p.MatchString(normalized) {
			flags["scam_pattern"] = true
			break
		}
	}
	if isExcessiveCaps(raw) || hasExcessiveRepeatedChars(raw) {
		flags["spam_formatting"] = true
	}

	if len(flags) > 0 {
		return Verdict{
			Action:      ActionFlag,
			ReasonCode:  "MODERATION_FLAGGED",
			Reason:      "Contenu signalé pour vérification asynchrone.",
			AsyncScreen: true,
			Flags:       flags,
		}
	}

	return Verdict{Action: ActionAllow}
}

func isExcessiveCaps(s string) bool {
	var letters, upper int
	for _, r := range s {
		if unicode.IsLetter(r) {
			letters++
			if unicode.IsUpper(r) {
				upper++
			}
		}
	}
	return letters >= 30 && float64(upper)/float64(letters) >= 0.85
}

func hasExcessiveRepeatedChars(s string) bool {
	var prev rune
	run := 0
	for _, r := range s {
		if r == prev && !unicode.IsSpace(r) {
			run++
			if run >= 10 {
				return true
			}
		} else {
			prev = r
			run = 1
		}
	}
	return false
}
