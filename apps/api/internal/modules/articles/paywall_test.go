package articles

import (
	"strings"
	"testing"
)

func tier(s string) *string { return &s }

func TestCheckContentAccess(t *testing.T) {
	none := UserEntitlements{}
	paid := UserEntitlements{IsPaidSubscriber: true}
	member := UserEntitlements{IsMember: true}

	if !CheckContentAccess("PUBLIC", none, nil) {
		t.Error("PUBLIC doit être accessible sans droits")
	}
	if !CheckContentAccess("", none, nil) {
		t.Error("visibilité vide → accès public")
	}
	if !CheckContentAccess(VisMembersOnly, member, nil) {
		t.Error("member accède à MEMBERS_ONLY")
	}
	if !CheckContentAccess(VisMembersOnly, paid, nil) {
		t.Error("paid accède à MEMBERS_ONLY")
	}
	if CheckContentAccess(VisMembersOnly, none, nil) {
		t.Error("ni member ni paid : MEMBERS_ONLY refusé")
	}
	if !CheckContentAccess(VisPaidSubscribers, paid, nil) {
		t.Error("paid accède à PAID_SUBSCRIBERS")
	}
	if CheckContentAccess(VisPaidSubscribers, member, nil) {
		t.Error("member (sans paywall) : PAID_SUBSCRIBERS refusé")
	}
	// TIER_SPECIFIC.
	if CheckContentAccess(VisTierSpecific, none, tier("t1")) {
		t.Error("tier sans abonnement refusé")
	}
	if !CheckContentAccess(VisTierSpecific, paid, nil) {
		t.Error("tier sans tier requis → accessible au paid")
	}
	if !CheckContentAccess(VisTierSpecific, UserEntitlements{IsPaidSubscriber: true, TierID: tier("t1")}, tier("t1")) {
		t.Error("tier correspondant → accessible")
	}
	if CheckContentAccess(VisTierSpecific, UserEntitlements{IsPaidSubscriber: true, TierID: tier("t2")}, tier("t1")) {
		t.Error("tier différent → refusé")
	}
	// Inconnu → true (par défaut ouvert).
	if !CheckContentAccess("BOGUS", none, nil) {
		t.Error("visibilité inconnue → accès ouvert")
	}
}

func TestSliceContentAtPaywall_Marker(t *testing.T) {
	raw := "<p>Intro</p><!--paywall--><p>SECRET</p>"
	paid := UserEntitlements{}
	res := SliceContentAtPaywall(raw, paid, VisPaidSubscribers, nil)
	if res.IsTruncated == false || res.AccessGranted {
		t.Fatalf("doit être tronqué et refusé: %+v", res)
	}
	if strings.Contains(res.Content, "SECRET") {
		t.Fatalf("fuite: le contenu payant ne doit jamais passer: %q", res.Content)
	}
	if res.PaywallMeta == nil || res.PaywallMeta.TeaserParagraphsCount != 1 {
		t.Fatalf("paywallMeta = %+v", res.PaywallMeta)
	}
	// Drophead / autres marqueurs reconnus.
	if res := SliceContentAtPaywall(`<p>a</p><!--qoe-paywall--><p>secret</p>`, paid, VisPaidSubscribers, nil); res.AccessGranted || strings.Contains(res.Content, "secret") {
		t.Fatalf("marqueur qoe non honoré: %+v", res)
	}
}

func TestSliceContentAtPaywall_AccessGranted(t *testing.T) {
	raw := "<p>Intro</p><!--paywall--><p>SECRET</p>"
	res := SliceContentAtPaywall(raw, UserEntitlements{IsPaidSubscriber: true}, VisPaidSubscribers, nil)
	if !res.AccessGranted || res.Content != raw || res.IsTruncated {
		t.Fatalf("paid → accès complet: %+v", res)
	}
	if res := SliceContentAtPaywall("", UserEntitlements{}, VisPaidSubscribers, nil); !res.AccessGranted {
		t.Fatalf("contenu vide → accès: %+v", res)
	}
}

func TestSliceContentAtPaywall_Fallback(t *testing.T) {
	paid := UserEntitlements{}
	// 2 paragraphes sans marqueur → 2 teasers.
	two := "<p>a</p><p>b</p><p>c</p>"
	if res := SliceContentAtPaywall(two, paid, VisPaidSubscribers, nil); res.PaywallMeta == nil || res.PaywallMeta.TeaserParagraphsCount != 2 || res.AccessGranted {
		t.Fatalf("2 paras → teaser 2: %+v", res)
	}
	// 1 paragraphe → teaser 1.
	one := "<p>seul</p>"
	if res := SliceContentAtPaywall(one, paid, VisPaidSubscribers, nil); res.PaywallMeta == nil || res.PaywallMeta.TeaserParagraphsCount != 1 {
		t.Fatalf("1 para → teaser 1: %+v", res)
	}
	// Texte sans </p> > 500 chars → tout côté (500 chars), teaser 1.
	long := strings.Repeat("x", 600)
	if res := SliceContentAtPaywall(long, paid, VisPaidSubscribers, nil); res.PaywallMeta == nil || res.PaywallMeta.PreviewLengthBytes != 500 || res.PaywallMeta.TeaserParagraphsCount != 1 {
		t.Fatalf("long texte → preview 500: %+v", res.PaywallMeta)
	}
}

func TestParagraphIndexes(t *testing.T) {
	if got := paragraphIndexes(""); len(got) != 0 {
		t.Fatalf("vide → %v", got)
	}
	if got := paragraphIndexes("<p>a</p><p>b</p>"); len(got) != 2 {
		t.Fatalf("2 fermetures → %v", got)
	}
}
