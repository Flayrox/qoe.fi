package antispam

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/qoefi/api/internal/trust"
	"github.com/redis/go-redis/v9"
)

func newTestGuard(t *testing.T) (*miniredis.Miniredis, *redis.Client, *Guard) {
	t.Helper()
	s := miniredis.RunT(t)
	rc := redis.NewClient(&redis.Options{Addr: s.Addr()})
	t.Cleanup(func() { _ = rc.Close() })
	return s, rc, NewGuard(rc)
}

func assertRejection(t *testing.T, err error, wantStatus int, wantCode string) *RejectionError {
	t.Helper()
	if err == nil {
		t.Fatalf("erreur attendue (%d / %s), obtenu nil", wantStatus, wantCode)
	}
	var rej *RejectionError
	if !errors.As(err, &rej) {
		t.Fatalf("attendu *RejectionError, obtenu %T (%v)", err, err)
	}
	if rej.HTTPStatus != wantStatus {
		t.Errorf("HTTPStatus = %d, attendu %d", rej.HTTPStatus, wantStatus)
	}
	if rej.Code != wantCode {
		t.Errorf("Code = %q, attendu %q", rej.Code, wantCode)
	}
	if rej.Message == "" {
		t.Error("Message ne doit pas être vide")
	}
	return rej
}

func TestValidateLengths(t *testing.T) {
	// Pensée > 10 000 runes.
	err := ValidateThought(strings.Repeat("a", MaxThoughtRunes+1), nil, trust.TierStandard)
	assertRejection(t, err, 400, CodeContentTooLarge)

	// > 10 tags.
	tooManyTags := make([]string, MaxThoughtTags+1)
	for i := range tooManyTags {
		tooManyTags[i] = "finance"
	}
	assertRejection(t, ValidateThought("ok", tooManyTags, trust.TierStandard), 400, CodeContentTooLarge)

	// Tag > 40 runes.
	assertRejection(t, ValidateThought("ok", []string{strings.Repeat("t", MaxTagRunes+1)}, trust.TierStandard), 400, CodeContentTooLarge)

	// Commentaire > 4 000 runes.
	assertRejection(t, ValidateComment(strings.Repeat("é", MaxCommentRunes+1), trust.TierStandard), 400, CodeContentTooLarge)

	// DM > 4 000 runes.
	assertRejection(t, ValidateDM(strings.Repeat("x", MaxDMRunes+1), trust.TierStandard), 400, CodeContentTooLarge)

	// Article titre > 200 runes et corps > 512 Ko.
	assertRejection(t, ValidateArticle(strings.Repeat("t", MaxArticleTitleRunes+1), "corps valide", trust.TierStandard), 400, CodeContentTooLarge)
	assertRejection(t, ValidateArticle("Titre valide", strings.Repeat("b", MaxArticleBodyBytes+1), trust.TierStandard), 400, CodeContentTooLarge)

	// Limites exactes valides.
	if err := ValidateThought(strings.Repeat("a", MaxThoughtRunes), []string{"macro", "épargne"}, trust.TierStandard); err != nil {
		t.Errorf("pensée à la borne exacte rejetée: %v", err)
	}
	if err := ValidateArticle(strings.Repeat("t", MaxArticleTitleRunes), strings.Repeat("b", 1000), trust.TierStandard); err != nil {
		t.Errorf("article valide rejeté: %v", err)
	}
}

func TestCheckUnicodeHygiene(t *testing.T) {
	// Zalgo (> 3 diacritiques combinants consécutifs).
	zalgo := "H" + "\u0301\u0302\u0303\u0304" + "llo"
	assertRejection(t, CheckUnicodeHygiene(zalgo), 400, CodeSpamUnicode)

	// Flood de caractères invisibles (> 10 zero-width).
	zwFlood := "bonjour" + strings.Repeat("\u200B", 11) + "monde"
	assertRejection(t, CheckUnicodeHygiene(zwFlood), 400, CodeSpamUnicode)

	// Flood de retours à la ligne sur texte court (> 40).
	nlFlood := "spam" + strings.Repeat("\n", 41) + "fin"
	assertRejection(t, CheckUnicodeHygiene(nlFlood), 400, CodeSpamUnicode)

	// Français accentué normal et texte long multi-paragraphes autorisés.
	if err := CheckUnicodeHygiene("Économie européenne : où va l'épargne en 2026 ?\n\nAnalyse complète."); err != nil {
		t.Errorf("texte français normal rejeté: %v", err)
	}
	longArticle := strings.Repeat("Paragraphe analytique suffisamment long pour être légitime.\n", 45)
	if err := CheckUnicodeHygiene(longArticle); err != nil {
		t.Errorf("article long multi-paragraphes rejeté: %v", err)
	}
}

func TestValidateSafeURL(t *testing.T) {
	valid := []string{"", "https://qoe.fi/articles/1", "http://example.com", "/profil/alice"}
	for _, u := range valid {
		if err := ValidateSafeURL(u); err != nil {
			t.Errorf("URL valide rejetée %q: %v", u, err)
		}
	}

	invalid := []string{
		"javascript:alert(1)",
		"vbscript:msgbox(1)",
		"data:text/html,<script>alert(1)</script>",
		"//evil.example.com/phish",
		"https://qoe.fi/\x00bad",
	}
	for _, u := range invalid {
		assertRejection(t, ValidateSafeURL(u), 400, CodeUnsafeURL)
	}
}

func TestCheckNoXSS(t *testing.T) {
	malicious := []string{
		`<script>alert(1)</script>`,
		`<IFRAME src="https://evil.test"></iframe>`,
		`<svg onload=alert(1)>`,
		`<object data="x"></object>`,
		`<embed src="x">`,
		`<img src=x onerror=alert(1)>`,
		`<a href="JAVASCRIPT:void(0)">cliquez</a>`,
	}
	for _, m := range malicious {
		assertRejection(t, CheckNoXSS(m), 400, CodeUnsafeHTML)
	}

	benign := []string{
		"Pour x < y et a < b, le rendement reste positif.",
		"J'aime beaucoup cette analyse <3",
		"La condition button = 1 reste vraie dans ce modèle.",
	}
	for _, b := range benign {
		if err := CheckNoXSS(b); err != nil {
			t.Errorf("faux positif XSS sur %q: %v", b, err)
		}
	}
}

func TestTrustTierLinkAndMentionDensity(t *testing.T) {
	twoLinks := "Regardez https://a.example et https://b.example pour plus d'infos."
	threeMentions := "Salut @alice @bob @charlie, qu'en pensez-vous ? email test@example.com"

	links, mentions := CountLinksAndMentions(twoLinks + " " + threeMentions)
	if links != 2 {
		t.Errorf("links = %d, attendu 2", links)
	}
	if mentions != 3 {
		t.Errorf("mentions = %d, attendu 3 (l'email ne doit pas être compté)", mentions)
	}

	// LOW bloque 2 liens et 3 mentions.
	assertRejection(t, ValidateThought(twoLinks, nil, trust.TierLow), 400, CodeSpamLinkLimit)
	assertRejection(t, ValidateComment(threeMentions, trust.TierRestricted), 400, CodeSpamMentionLimit)

	// LOW autorise 1 lien et 2 mentions.
	if err := ValidateThought("Avis sur https://a.example avec @alice et @bob", nil, trust.TierLow); err != nil {
		t.Errorf("LOW doit autoriser 1 lien et 2 mentions: %v", err)
	}

	// STANDARD autorise 2 liens et 3 mentions.
	if err := ValidateThought(twoLinks+" "+threeMentions, nil, trust.TierStandard); err != nil {
		t.Errorf("STANDARD doit autoriser 2 liens / 3 mentions: %v", err)
	}
}

func TestSimHash64_NearDuplicateAndShortAllow(t *testing.T) {
	a := "Super promo crypto clique ici"
	b := "Super promo crypto clik ici!"
	hA := SimHash64(a)
	hB := SimHash64(b)
	dist := HammingDistance(hA, hB)
	if dist > 3 {
		t.Fatalf("HammingDistance(%q, %q) = %d, attendu <= 3", a, b, dist)
	}

	c := "Analyse trimestrielle de la politique monétaire européenne et des taux obligataires"
	if dUnrel := HammingDistance(hA, SimHash64(c)); dUnrel <= 3 {
		t.Fatalf("textes sans rapport trop proches: HammingDistance = %d", dUnrel)
	}

	ctx := context.Background()
	_, _, g := newTestGuard(t)

	// Texte très court (< 24 caractères normalisés) jamais bloqué même répété.
	for i := 0; i < 4; i++ {
		coord, err := g.CheckAndRecordFingerprint(ctx, "u-short", "comment", "Merci !")
		if err != nil || coord {
			t.Fatalf("texte court répété bloqué à l'essai %d: coord=%v err=%v", i, coord, err)
		}
	}

	// Quasi-doublon du même utilisateur bloqué en 429 SPAM_DUPLICATE.
	if _, err := g.CheckAndRecordFingerprint(ctx, "u1", "thought", a); err != nil {
		t.Fatalf("premier envoi valide bloqué: %v", err)
	}
	_, err := g.CheckAndRecordFingerprint(ctx, "u1", "thought", b)
	assertRejection(t, err, 429, CodeSpamDuplicate)
}

func TestCheckAndRecordFingerprint_CoordinatedCampaignLSH(t *testing.T) {
	ctx := context.Background()
	_, _, g := newTestGuard(t)

	// 3 comptes distincts postent la même campagne (avec légère mutation).
	posts := []struct {
		user string
		text string
	}{
		{"bot-1", "Super promo crypto clique ici maintenant"},
		{"bot-2", "Super promo crypto clik ici maintenant!"},
		{"bot-3", "Super promo crypto clique ici maintenant !!"},
	}

	for i, p := range posts {
		coord, err := g.CheckAndRecordFingerprint(ctx, p.user, "thought", p.text)
		if i < 2 {
			if err != nil || coord {
				t.Fatalf("envoi %d (%s) ne devait pas encore bloquer: coord=%v err=%v", i, p.user, coord, err)
			}
		} else {
			if !coord {
				t.Fatal("coordinated = false au 3e compte distinct, attendu true")
			}
			rej := assertRejection(t, err, 429, CodeSpamCoordinated)
			if !rej.Coordinated {
				t.Error("RejectionError.Coordinated doit être true")
			}
		}
	}
}

func TestGuard_AutoStrikeExponentialFreeze(t *testing.T) {
	ctx := context.Background()
	s, _, g := newTestGuard(t)

	if frozen, _ := g.IsWriteFrozen(ctx, "u1"); frozen {
		t.Fatal("u1 ne doit pas être gelé initialement")
	}

	for i := 1; i <= 2; i++ {
		strikes, cooldown, escalated := g.ApplyStrike(ctx, "u1")
		if strikes != i || cooldown != 0 || escalated {
			t.Fatalf("strike %d: strikes=%d cooldown=%d escalated=%v", i, strikes, cooldown, escalated)
		}
	}

	// 3e strike -> gel 15 min (900s), non escaladé.
	strikes, cooldown, escalated := g.ApplyStrike(ctx, "u1")
	if strikes != 3 || cooldown != 900 || escalated {
		t.Fatalf("3e strike attendu (3, 900, false), obtenu (%d, %d, %v)", strikes, cooldown, escalated)
	}
	frozen, retryAfter := g.IsWriteFrozen(ctx, "u1")
	if !frozen || retryAfter <= 0 || retryAfter > 900 {
		t.Fatalf("IsWriteFrozen attendu (true, 1..900), obtenu (%v, %d)", frozen, retryAfter)
	}

	// Avance de 16 min : le gel et les strikes expirent, mais sec:freeze_hist (1h) reste actif.
	s.FastForward(16 * time.Minute)
	if frozen, _ := g.IsWriteFrozen(ctx, "u1"); frozen {
		t.Fatal("le gel de 15 min doit être expiré après 16 min")
	}

	g.ApplyStrike(ctx, "u1")
	g.ApplyStrike(ctx, "u1")
	strikes2, cooldown2, escalated2 := g.ApplyStrike(ctx, "u1")
	if strikes2 != 3 || cooldown2 != 3600 || !escalated2 {
		t.Fatalf("récidive attendue (3, 3600, true), obtenu (%d, %d, %v)", strikes2, cooldown2, escalated2)
	}
}

func TestGuard_ColdDMAndFollowChurn(t *testing.T) {
	ctx := context.Background()
	_, rc, g := newTestGuard(t)

	// LOW : max 5 nouveaux destinataires non-abonnés.
	for i := 1; i <= 5; i++ {
		target := "rec-" + string(rune('a'+i))
		if err := CheckColdDM(ctx, "sender-low", target, false, trust.TierLow, rc); err != nil {
			t.Fatalf("cold DM %d/5 rejeté: %v", i, err)
		}
	}
	// Même destinataire déjà contacté aujourd'hui reste autorisé.
	if err := CheckColdDM(ctx, "sender-low", "rec-b", false, trust.TierLow, rc); err != nil {
		t.Errorf("ré-envoi au même destinataire doit rester autorisé: %v", err)
	}
	// 6e nouveau destinataire bloqué en 429.
	assertRejection(t, CheckColdDM(ctx, "sender-low", "rec-6", false, trust.TierLow, rc), 429, CodeWriteCooldown)

	// Si abonné (isFollower=true), aucune limite cold DM.
	if err := g.CheckColdDM(ctx, "sender-low", "rec-follower", true, trust.TierLow); err != nil {
		t.Errorf("DM vers abonné rejeté: %v", err)
	}

	// Follow churn tracking.
	churn1, actors1, err := g.TrackFollowChurn(ctx, "u-churn", "pub-1")
	if err != nil || churn1 != 1 || actors1 != 1 {
		t.Fatalf("TrackFollowChurn #1 = (%d, %d, %v), attendu (1, 1, nil)", churn1, actors1, err)
	}
	churn2, actors2, err := g.TrackFollowChurn(ctx, "u-churn", "pub-1")
	if err != nil || churn2 != 2 || actors2 != 1 {
		t.Fatalf("TrackFollowChurn #2 = (%d, %d, %v), attendu (2, 1, nil)", churn2, actors2, err)
	}
}

func TestSanitizeAndValidateText(t *testing.T) {
	// TrimSpace + normalisation NFC (e + \u0301 -> é en 1 rune).
	got, err := SanitizeAndValidateText("  Cafe\u0301  ", 1, 4, TextOptions{})
	if err != nil {
		t.Fatalf("NFC valide rejeté: %v", err)
	}
	if got != "Café" {
		t.Fatalf("got = %q, attendu %q", got, "Café")
	}

	// Null byte et contrôles C0/C1.
	assertRejection(t, func() error { _, err := SanitizeAndValidateText("abc\x00def", 1, 50, TextOptions{}); return err }(), 400, CodeSpamUnicode)
	assertRejection(t, func() error { _, err := SanitizeAndValidateText("abc\x07def", 1, 50, TextOptions{}); return err }(), 400, CodeSpamUnicode)
	assertRejection(t, func() error { _, err := SanitizeAndValidateText("abc\u0085def", 1, 50, TextOptions{}); return err }(), 400, CodeSpamUnicode)

	// Newline interdit si AllowNewlines=false, autorisé si AllowNewlines=true.
	assertRejection(t, func() error { _, err := SanitizeAndValidateText("ligne1\nligne2", 1, 50, TextOptions{AllowNewlines: false}); return err }(), 400, CodeSpamUnicode)
	if _, err := SanitizeAndValidateText("ligne1\n\tligne2", 1, 50, TextOptions{AllowNewlines: true}); err != nil {
		t.Fatalf("multiligne autorisé rejeté: %v", err)
	}

	// Contrôles Bidi interdits.
	bidiCases := []string{
		"abc\u202Edef", // RLO
		"abc\u202Adef", // LRE
		"abc\u2066def", // LRI
		"abc\u2069def", // PDI
		"abc\u200Edef", // LRM
		"abc\u200Fdef", // RLM
		"abc\u061Cdef", // ALM
	}
	for _, bc := range bidiCases {
		assertRejection(t, func() error { _, err := SanitizeAndValidateText(bc, 1, 50, TextOptions{}); return err }(), 400, CodeSpamUnicode)
	}

	// Bornes minRunes / maxRunes en runes UTF-8.
	assertRejection(t, func() error { _, err := SanitizeAndValidateText("   ", 1, 50, TextOptions{}); return err }(), 400, CodeContentTooShort)
	assertRejection(t, func() error { _, err := SanitizeAndValidateText("ab", 3, 50, TextOptions{}); return err }(), 400, CodeContentTooShort)
	assertRejection(t, func() error { _, err := SanitizeAndValidateText("éééé", 1, 3, TextOptions{}); return err }(), 400, CodeContentTooLarge)

	// Champ optionnel (minRunes=0) vide autorisé.
	if got, err := SanitizeAndValidateText("   ", 0, 50, TextOptions{}); err != nil || got != "" {
		t.Fatalf("champ optionnel vide: got=%q err=%v", got, err)
	}

	// CheckXSS optionnel.
	assertRejection(t, func() error {
		_, err := SanitizeAndValidateText("<script>alert(1)</script>", 1, 100, TextOptions{CheckXSS: true})
		return err
	}(), 400, CodeUnsafeHTML)
}
