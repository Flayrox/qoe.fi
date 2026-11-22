package clientip

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func request(remote string, headers map[string][]string) *http.Request {
	r := httptest.NewRequest(http.MethodGet, "/v1/feed", nil)
	r.RemoteAddr = remote
	for k, values := range headers {
		for _, v := range values {
			r.Header.Add(k, v)
		}
	}
	return r
}

// TestFromRequestHops fige la lecture « à l'envers » : le client ne peut pas
// choisir son IP en forgeant l'en-tête, et une valeur non-IP n'est jamais
// propagée.
func TestFromRequestHops(t *testing.T) {
	cases := []struct {
		name    string
		remote  string
		headers map[string][]string
		hops    int
		want    string
	}{
		{
			name:   "en-tête absent : adresse TCP",
			remote: "203.0.113.7:44321",
			hops:   1,
			want:   "203.0.113.7",
		},
		{
			name:    "un proxy : le client est le seul saut",
			remote:  "10.0.0.5:1234",
			headers: map[string][]string{"X-Forwarded-For": {"198.51.100.24"}},
			hops:    1,
			want:    "198.51.100.24",
		},
		{
			name:    "en-tête forgé : le saut ajouté par le proxy gagne",
			remote:  "10.0.0.5:1234",
			headers: map[string][]string{"X-Forwarded-For": {"6.6.6.6", "198.51.100.24"}},
			hops:    1,
			want:    "198.51.100.24",
		},
		{
			name:    "deux proxys de confiance",
			remote:  "10.0.0.5:1234",
			headers: map[string][]string{"X-Forwarded-For": {"198.51.100.24", "10.0.0.5"}},
			hops:    2,
			want:    "198.51.100.24",
		},
		{
			name:    "valeur non-IP ignorée",
			remote:  "10.0.0.5:1234",
			headers: map[string][]string{"X-Forwarded-For": {"pas-une-ip", "198.51.100.24"}},
			hops:    1,
			want:    "198.51.100.24",
		},
		{
			// X-Real-IP n'est pas un en-tête de proxy standard : le client peut
			// l'envoyer seul, donc il est ignoré au profit de la connexion TCP.
			name:    "X-Real-IP ignoré (en-tête client)",
			remote:  "10.0.0.5:1234",
			headers: map[string][]string{"X-Real-IP": {"203.0.113.9"}},
			hops:    1,
			want:    "10.0.0.5",
		},
		{
			name:    "X-Real-IP fantaisiste rejeté",
			remote:  "203.0.113.7:44321",
			headers: map[string][]string{"X-Real-IP": {"evil.example"}},
			hops:    1,
			want:    "203.0.113.7",
		},
		{
			name:    "chaîne plus courte que les sauts attendus",
			remote:  "10.0.0.5:1234",
			headers: map[string][]string{"X-Forwarded-For": {"198.51.100.24"}},
			hops:    3,
			want:    "198.51.100.24",
		},
		{
			name:    "adresse IPv6 mappée normalisée",
			remote:  "10.0.0.5:1234",
			headers: map[string][]string{"X-Forwarded-For": {"::ffff:198.51.100.24"}},
			hops:    1,
			want:    "198.51.100.24",
		},
	}
	for _, tc := range cases {
		if got := FromRequestHops(request(tc.remote, tc.headers), tc.hops); got != tc.want {
			t.Errorf("%s : got %q, want %q", tc.name, got, tc.want)
		}
	}
}

func TestHopsBorne(t *testing.T) {
	t.Setenv(EnvTrustedHops, "99")
	if got := Hops(); got != maxHops {
		t.Errorf("TRUSTED_PROXY_HOPS=99 : got %d, want %d", got, maxHops)
	}
	t.Setenv(EnvTrustedHops, "bidon")
	if got := Hops(); got != DefaultTrustedHops {
		t.Errorf("valeur invalide : got %d, want %d", got, DefaultTrustedHops)
	}
}
