package articles

import (
	"strings"
	"testing"
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
