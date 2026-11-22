package netguard

import (
	"net/http"
	"testing"
)

// TestRedirectsExceeded fige la borne de redirections : suivre la n-ième
// redirection se fait avec len(via) == n (la requête d'origine est incluse).
// Exactement maxRedirects sauts sont donc autorisés, pas un de plus ni un de
// moins — la lecture inverse (">= interné ») avait été soupçonnée à tort.
func TestRedirectsExceeded(t *testing.T) {
	viaOf := func(n int) []*http.Request {
		out := make([]*http.Request, n)
		for i := range out {
			out[i] = &http.Request{}
		}
		return out
	}
	cases := []struct {
		via  int
		want bool
	}{
		{0, false},               // requête d'origine
		{1, false},               // 1re redirection
		{maxRedirects, false},    // dernière redirection autorisée
		{maxRedirects + 1, true}, // au-delà de la borne
		{maxRedirects + 5, true}, // toujours refusé
	}
	for _, tc := range cases {
		if got := redirectsExceeded(viaOf(tc.via)); got != tc.want {
			t.Errorf("via=%d : redirectsExceeded = %v, attendu %v", tc.via, got, tc.want)
		}
	}
}
