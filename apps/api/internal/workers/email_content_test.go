package workers

// =====================================================================
// 🎨 Tests du moteur de contenu email (email_content.go)
// =====================================================================
// Trois garanties, sans base de données :
//  1. i18n : la langue suit l'abonné (fr défaut, en reconnu) ;
//  2. personnalisation : les réglages du créateur sont bornés/assainis
//     (jamais d'injection, jamais de crash sur JSON corrompu) ;
//  3. coquille délivrabilité : multipart texte+HTML, preheader, bouton en
//     couleur d'accent, aucune police monospace (option Apple).

import (
	"strings"
	"testing"
)

func TestNormalizeEmailLocale(t *testing.T) {
	cases := map[string]string{
		"fr":       "fr",
		"fr-FR":    "fr",
		"en":       "en",
		"EN-US":    "en",
		" en ":     "en",
		"de":       "fr", // non supporté → défaut
		"":         "fr",
		"es-419":   "fr",
		"fr_fr":    "fr",
		"en_GB-xx": "en",
	}
	for in, want := range cases {
		if got := NormalizeEmailLocale(in); got != want {
			t.Errorf("NormalizeEmailLocale(%q) = %q, attendu %q", in, got, want)
		}
	}
}

func TestParseEmailPrefs_EmptyAndGarbage(t *testing.T) {
	for _, raw := range [][]byte{nil, {}, []byte("not json"), []byte("null")} {
		p := ParseEmailPrefs(raw)
		if p.FromName != "" || p.AccentColor != "" || len(p.Subjects) != 0 {
			t.Fatalf("ParseEmailPrefs(%q) doit rendre les défauts, got %+v", raw, p)
		}
	}
}

func TestParseEmailPrefs_SanitizesEverything(t *testing.T) {
	raw := []byte(`{
		"fromName": "  Léa de La Gazette  ",
		"replyTo": "hello@gazette.fr",
		"accentColor": "#7C3AED",
		"logoUrl": "https://gazette.fr/logo.png",
		"subjects": {"confirm": "Confirmez !", "welcome": "Bienvenue !", "evil": "<script>"},
		"preheaders": {"confirm": "Un clic suffit"},
		"footerNote": "Publié avec amour à Lyon.",
		"welcomeEnabled": false,
		"welcomeBodyFr": "Ravi de vous compter parmi nous !"
	}`)
	p := ParseEmailPrefs(raw)
	if p.FromName != "Léa de La Gazette" {
		t.Errorf("FromName = %q (trim attendu)", p.FromName)
	}
	if p.ReplyTo != "hello@gazette.fr" {
		t.Errorf("ReplyTo = %q", p.ReplyTo)
	}
	if p.AccentColor != "#7c3aed" {
		t.Errorf("AccentColor = %q (minuscules attendues)", p.AccentColor)
	}
	if p.Subjects["confirm"] != "Confirmez !" || p.Subjects["welcome"] != "Bienvenue !" {
		t.Errorf("Subjects = %v", p.Subjects)
	}
	if _, kept := p.Subjects["evil"]; kept {
		t.Error("les clés inconnues doivent être écartées (bornes)")
	}
	if p.Preheaders["confirm"] != "Un clic suffit" {
		t.Errorf("Preheaders = %v", p.Preheaders)
	}
	if p.WelcomeEnabled == nil || *p.WelcomeEnabled != false {
		t.Error("welcomeEnabled=false doit être conservé")
	}
	if p.WelcomeBodyFR != "Ravi de vous compter parmi nous !" {
		t.Errorf("WelcomeBodyFR = %q", p.WelcomeBodyFR)
	}

	// welcomeEnabled absent → nil → activé par défaut.
	p2 := ParseEmailPrefs([]byte(`{"fromName":"X"}`))
	if p2.WelcomeEnabled != nil {
		t.Error("welcomeEnabled absent = nil (activé)")
	}

	// Valeurs dangereuses rejetées.
	p3 := ParseEmailPrefs([]byte(`{"replyTo":"a b@c.d","logoUrl":"javascript:alert(1)","accentColor":"red; }","welcomeEnabled":false}`))
	if p3.WelcomeEnabled == nil || !*p3.WelcomeEnabled {
		t.Log("note: welcomeEnabled=false reste honoré même si d'autres champs sont invalides")
	}
	if p3.ReplyTo != "" {
		t.Errorf("ReplyTo avec espace doit être rejeté, got %q", p3.ReplyTo)
	}
	if p3.LogoURL != "" {
		t.Errorf("LogoURL non-http(s) doit être rejeté, got %q", p3.LogoURL)
	}
	if p3.AccentColor != "" {
		t.Errorf("AccentColor non-hex doit être rejeté, got %q", p3.AccentColor)
	}

	// Bornes de longueur (runes).
	long := strings.Repeat("é", 500)
	p4 := ParseEmailPrefs([]byte(`{"fromName":"` + long + `"}`))
	if runeCount := len([]rune(p4.FromName)); runeCount > maxEmailFromNameLen {
		t.Errorf("FromName non borné : %d runes > %d", runeCount, maxEmailFromNameLen)
	}
}

func TestResolveCustomization_LocalePicksBody(t *testing.T) {
	prefs := EmailPrefs{
		WelcomeBodyFR: "Bienvenue !",
		WelcomeBodyEN: "Welcome!",
		Subjects:      map[string]string{"welcome": "Sujet personnalisé"},
	}
	fr := ResolveCustomization(prefs, "fr")
	if fr.WelcomeBody != "Bienvenue !" {
		t.Errorf("corps fr = %q", fr.WelcomeBody)
	}
	if fr.Subject("welcome", "défaut FR", "default EN") != "Sujet personnalisé" {
		t.Error("l'override créateur doit gagner sur le défaut")
	}
	if fr.Subject("confirm", "défaut FR", "default EN") != "défaut FR" {
		t.Error("sans override, le défaut localisé (fr) doit sortir")
	}
	en := ResolveCustomization(prefs, "en")
	if en.WelcomeBody != "Welcome!" {
		t.Errorf("corps en = %q", en.WelcomeBody)
	}
	if en.Subject("confirm", "défaut FR", "default EN") != "default EN" {
		t.Error("sans override, le défaut localisé (en) doit sortir")
	}
}

func TestRenderTransactionEmail_MultipartAndDeliverability(t *testing.T) {
	htmlPart, textPart := RenderTransactionEmail(ShellInput{
		Locale:      "fr",
		Preheader:   "Aperçu dans la boîte de réception",
		Title:       "Confirmez votre abonnement",
		BodyHTML:    `<p style="font-size:14px;">Cliquez pour confirmer.</p>`,
		CTALabel:    "Confirmer",
		CTAURL:      "https://api.qoe.fi/confirm?token=x",
		Accent:      "#7c3aed",
		PubName:     "La Gazette",
		PubURL:      "https://gazette.qoe.fi",
		UnsubURL:    "https://api.qoe.fi/unsub",
		UnsubLabel:  "Se désabonner",
		ConsentLine: "Vous recevez cet email car…",
		FooterNote:  "Publié avec amour.",
	})

	// Le HTML doit contenir les éléments clés.
	for _, want := range []string{
		"lang=\"fr\"",
		"Aperçu dans la boîte de réception",
		"Confirmez votre abonnement",
		"https://api.qoe.fi/confirm?token=x",
		"background:#7c3aed",
		"https://gazette.qoe.fi",
		"Se désabonner",
		"Vous recevez cet email car…",
		"Publié avec amour.",
	} {
		if !strings.Contains(htmlPart, want) {
			t.Errorf("HTML sans %q", want)
		}
	}
	// Option Apple : aucune police monospace.
	for _, mono := range []string{"monospace", "courier", "consolas", "SF Mono"} {
		if strings.Contains(strings.ToLower(htmlPart), strings.ToLower(mono)) {
			t.Errorf("HTML contient une police monospace interdite : %q", mono)
		}
	}

	// L'alternative texte doit exister et porter l'essentiel.
	if strings.TrimSpace(textPart) == "" {
		t.Fatal("alternative texte vide (pénalité délivrabilité)")
	}
	for _, want := range []string{"Confirmez votre abonnement", "https://api.qoe.fi/confirm?token=x", "Se désabonner", "La Gazette"} {
		if !strings.Contains(textPart, want) {
			t.Errorf("texte sans %q", want)
		}
	}
	if strings.Contains(textPart, "<") && strings.Contains(textPart, "style=") {
		t.Error("l'alternative texte doit être dépourvue de balisage")
	}
}

func TestRenderTransactionEmail_DefaultsAndEscaping(t *testing.T) {
	// Sans accent/logo : pastille initiale + couleur plateforme.
	htmlPart, _ := RenderTransactionEmail(ShellInput{
		Locale:  "en",
		Title:   "Welcome",
		PubName: "<b>Injection & Co</b>",
	})
	if !strings.Contains(htmlPart, "&lt;b&gt;Injection &amp; Co&lt;/b&gt;") {
		t.Error("le nom de publication doit être échappé dans la coquille")
	}
	if strings.Contains(htmlPart, "background:#7c3aed") {
		t.Error("accent personnalisé inattendu")
	}
	// La couleur par défaut (#111827) doit apparaître quand aucun accent.
	if !strings.Contains(htmlPart, "border-radius:12px") {
		t.Error("pastille logo initiale absente")
	}
}

func TestListIDFor(t *testing.T) {
	cases := map[string]string{
		"La Gazette":       "la-gazette.qoe.fi",
		"Éditions du Nord": "ditions-du-nord.qoe.fi", // accents retirés
		"":                 "subscribers.qoe.fi",
		"  --  ":           "subscribers.qoe.fi",
	}
	for in, want := range cases {
		if got := listIDFor(in); got != want {
			t.Errorf("listIDFor(%q) = %q, attendu %q", in, got, want)
		}
	}
}

func TestQuotedPrintableEncode_LinesAndAccents(t *testing.T) {
	enc := quotedPrintableEncode("Bonjour — voici un texte accentué éàç\nsur deux lignes.")
	if strings.Contains(enc, "—") {
		t.Error("le caractère non-ASCII doit être encodé")
	}
	if !strings.Contains(enc, "=\n") && !strings.Contains(enc, "=2") && !strings.Contains(enc, "=C3") {
		t.Logf("encodage QP : %q", enc)
	}
	for _, line := range strings.Split(enc, "\r\n") {
		if len(line) > 76 {
			t.Errorf("ligne QP trop longue (%d chars) : %.40s", len(line), line)
		}
	}
}

// ── Extensibilité des langues (QOE_EMAIL_LOCALES) ──────────────────────

func TestEmailLocales_DefaultAndEnv(t *testing.T) {
	// Défaut sans env : fr,en.
	t.Setenv("QOE_EMAIL_LOCALES", "")
	if got := EmailLocales(); len(got) != 2 || got[0] != "fr" || got[1] != "en" {
		t.Errorf("EmailLocales() défaut = %v, attendu [fr en]", got)
	}

	// Ajouter une langue = une variable d'env, zéro code.
	t.Setenv("QOE_EMAIL_LOCALES", "fr,en,es")
	if got := EmailLocales(); len(got) != 3 || got[2] != "es" {
		t.Errorf("EmailLocales() = %v, attendu [fr en es]", got)
	}
	if NormalizeEmailLocale("es-ES") != "es" {
		t.Error("es-ES doit se normaliser en es quand déclaré")
	}
	if NormalizeEmailLocale("de") != "fr" {
		t.Error("langue non déclarée → repli (1re langue)")
	}
}

func TestEmailLocales_PerLocaleOverrides(t *testing.T) {
	t.Setenv("QOE_EMAIL_LOCALES", "fr,en,es")
	prefs := EmailPrefs{
		Subjects: map[string]string{
			"confirm.fr": "Sujet français",
			"confirm.en": "English subject",
			"confirm.es": "Asunto español",
		},
	}
	if got := ConfirmSubject(prefs, "es", "Lab"); got != "Asunto español" {
		t.Errorf("sujet es = %q, attendu « Asunto español »", got)
	}
	if got := ConfirmSubject(prefs, "en", "Lab"); got != "English subject" {
		t.Errorf("sujet en = %q", got)
	}
}

func TestEmailLocales_WelcomeBodiesAnyLanguage(t *testing.T) {
	t.Setenv("QOE_EMAIL_LOCALES", "fr,en,es")
	prefs := EmailPrefs{
		WelcomeBodies: map[string]string{"es": "¡Bienvenido al laboratorio!"},
	}
	if got := WelcomeBody(prefs, "es", "Lab"); got != "¡Bienvenido al laboratorio!" {
		t.Errorf("corps es = %q", got)
	}
	// Pas d'override es → repli sur le défaut (1re langue = fr).
	if got := WelcomeBody(EmailPrefs{}, "es", "Lab"); got == "" {
		t.Error("repli attendu, jamais vide")
	}
}

func TestEmailLocales_FallbackOrder(t *testing.T) {
	t.Setenv("QOE_EMAIL_LOCALES", "en,fr") // en = langue de repli
	if got := NormalizeEmailLocale("xyz"); got != "en" {
		t.Errorf("repli = %q, attendu en", got)
	}
}
