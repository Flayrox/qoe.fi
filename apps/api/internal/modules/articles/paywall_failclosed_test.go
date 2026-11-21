package articles

import (
	"strings"
	"testing"
	"unicode/utf8"
)

// Une visibilité inconnue (valeur d'enum future, casse fautive, donnée
// corrompue) ne doit JAMAIS ouvrir le contenu : la décision d'accès est
// fermée par défaut.
func TestCheckContentAccess_UnknownVisibilityFailsClosed(t *testing.T) {
	cases := []string{"BOGUS", "members_only", "Paid_Subscribers", "PAYWALL", "PUBLIC "}
	readers := []UserEntitlements{
		{}, // anonyme
		{IsMember: true},
		{IsPaidSubscriber: true, TierID: tier("t1")}, // abonné payant, palier exact
	}
	for _, visibility := range cases {
		for _, e := range readers {
			if CheckContentAccess(visibility, e, tier("t1")) {
				t.Fatalf("visibilité %q : accès accordé à %+v (fail-open)", visibility, e)
			}
		}
	}
}

// La troncature doit suivre : le contenu au-delà du teaser n'est jamais servi.
func TestSliceContentAtPaywall_UnknownVisibilityTruncates(t *testing.T) {
	// Le repli sans marqueur sert les 2 premiers paragraphes en teaser ;
	// au-delà (paragraphe 3), plus rien ne doit fuiter.
	raw := "<p>teaser</p><p>teaser 2</p><p>SECRET</p>"
	res := SliceContentAtPaywall(raw, UserEntitlements{IsPaidSubscriber: true}, "BOGUS", nil)
	if res.AccessGranted {
		t.Fatal("AccessGranted=true sur visibilité inconnue")
	}
	if !res.IsTruncated {
		t.Fatal("IsTruncated=false sur visibilité inconnue")
	}
	if strings.Contains(res.Content, "SECRET") {
		t.Fatalf("contenu payant servi en clair : %q", res.Content)
	}
}

// Le repli « 500 premiers octets » ne doit pas couper un caractère UTF-8 en
// deux (sinon le JSON de réponse contient des U+FFFD et le teaser est corrompu).
func TestSliceContentAtPaywall_UTF8Boundary(t *testing.T) {
	// 200 « € » (3 octets) = 600 octets, aucun </p> : repli à 500 octets, qui
	// tombe au milieu du 167e caractère.
	raw := strings.Repeat("€", 200)
	res := SliceContentAtPaywall(raw, UserEntitlements{}, VisPaidSubscribers, nil)
	if !utf8.ValidString(res.Content) {
		t.Fatalf("teaser UTF-8 invalide (%d octets)", len(res.Content))
	}
	if len(res.Content) > 500 {
		t.Fatalf("teaser trop long : %d octets", len(res.Content))
	}
	if res.PaywallMeta == nil || res.PaywallMeta.PreviewLengthBytes != len(res.Content) {
		t.Fatalf("PreviewLengthBytes désaligné : %+v", res.PaywallMeta)
	}
	if strings.ContainsRune(res.Content, utf8.RuneError) && !strings.ContainsRune(raw, utf8.RuneError) {
		t.Fatal("caractère de remplacement introduit par la coupure")
	}
}
