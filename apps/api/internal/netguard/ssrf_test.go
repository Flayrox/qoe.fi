package netguard

import (
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestIsPublicIP(t *testing.T) {
	cases := []struct {
		name string
		ip   net.IP
		want bool
	}{
		{"nil", nil, false},
		{"loopback v4", net.ParseIP("127.0.0.1"), false},
		{"metadata link-local", net.ParseIP("169.254.169.254"), false},
		{"rfc1918 10/8", net.ParseIP("10.0.0.1"), false},
		{"rfc1918 172.16/12", net.ParseIP("172.16.0.1"), false},
		{"rfc1918 192.168/16", net.ParseIP("192.168.1.1"), false},
		{"cgnat 100.64/10", net.ParseIP("100.64.0.1"), false},
		{"unspecified v4", net.ParseIP("0.0.0.0"), false},
		{"multicast v4", net.ParseIP("224.0.0.1"), false},
		{"reserved 240/4", net.ParseIP("240.0.0.1"), false},
		{"test-net-1", net.ParseIP("192.0.2.1"), false},
		{"loopback v6", net.ParseIP("::1"), false},
		{"ula v6 fc00::1", net.ParseIP("fc00::1"), false},
		{"ula v6 fd00::1", net.ParseIP("fd12:3456::1"), false},
		{"link-local v6", net.ParseIP("fe80::1"), false},
		{"multicast v6", net.ParseIP("ff02::1"), false},
		{"unspecified v6", net.ParseIP("::"), false},
		{"ipv4-mapped loopback", net.ParseIP("::ffff:127.0.0.1"), false},
		{"ipv4-mapped metadata", net.ParseIP("::ffff:169.254.169.254"), false},
		{"ipv4-mapped rfc1918", net.ParseIP("::ffff:10.0.0.1"), false},
		{"ipv6 doc", net.ParseIP("2001:db8::1"), false},
		{"public v4 1.1.1.1", net.ParseIP("1.1.1.1"), true},
		{"public v4 93.184.216.34", net.ParseIP("93.184.216.34"), true},
		{"ipv4-mapped public", net.ParseIP("::ffff:1.1.1.1"), true},
		{"public v6", net.ParseIP("2606:2800:220:1:248:1893:25c8:1946"), true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := IsPublicIP(tc.ip); got != tc.want {
				t.Fatalf("IsPublicIP(%v) = %v, attendu %v", tc.ip, got, tc.want)
			}
		})
	}
}

func TestValidateExternalURL(t *testing.T) {
	blocked := []struct {
		name string
		url  string
	}{
		{"vide", ""},
		{"scheme ftp", "ftp://example.com/file"},
		{"scheme file", "file:///etc/passwd"},
		{"scheme javascript", "javascript:alert(1)"},
		{"sans hote", "https:///path"},
		{"userinfo user", "https://user@example.com/hook"},
		{"userinfo user:pass", "https://user:pass@1.1.1.1/hook"},
		{"localhost", "http://localhost/hook"},
		{"localhost trailing dot", "https://localhost./hook"},
		{"sub localhost", "https://api.localhost:8080/hook"},
		{"dot local", "https://printer.local/hook"},
		{"dot internal", "https://metadata.google.internal/computeMetadata/v1/"},
		{"dot internal trailing dot", "http://service.internal./"},
		{"loopback 127.0.0.1", "http://127.0.0.1:8080/hook"},
		{"metadata 169.254.169.254", "http://169.254.169.254/latest/meta-data/"},
		{"rfc1918 10.0.0.1", "https://10.0.0.1/hook"},
		{"rfc1918 192.168.1.1", "https://192.168.1.1/hook"},
		{"cgnat 100.64.0.1", "https://100.64.0.1/hook"},
		{"ipv6 ::1", "http://[::1]:8080/hook"},
		{"ipv6 fc00::1", "https://[fc00::1]/hook"},
		{"ipv4-mapped loopback", "http://[::ffff:127.0.0.1]/hook"},
		{"ipv6 zone id", "http://[fe80::1%25eth0]/hook"},
	}

	for _, tc := range blocked {
		t.Run("bloqué_"+tc.name, func(t *testing.T) {
			err := ValidateExternalURL(tc.url)
			if err == nil {
				t.Fatalf("ValidateExternalURL(%q) = nil, attendu erreur SSRF", tc.url)
			}
			if !errors.Is(err, ErrUnsafeURL) {
				t.Fatalf("erreur %v ne wrappe pas ErrUnsafeURL", err)
			}
		})
	}

	allowed := []struct {
		name string
		url  string
	}{
		{"https domaine public", "https://hooks.example.com/webhook"},
		{"http domaine public avec port", "http://example.org:8080/callback?v=1"},
		{"https ip publique v4", "https://1.1.1.1/dns-query"},
		{"https ip publique v6", "https://[2606:4700:4700::1111]/hook"},
	}

	for _, tc := range allowed {
		t.Run("autorisé_"+tc.name, func(t *testing.T) {
			if err := ValidateExternalURL(tc.url); err != nil {
				t.Fatalf("ValidateExternalURL(%q) erreur inattendue: %v", tc.url, err)
			}
		})
	}
}

func TestSafeHTTPClient_BlocksLoopbackDial(t *testing.T) {
	called := false
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	client := SafeHTTPClient(5 * time.Second)
	resp, err := client.Get(srv.URL)
	if err == nil {
		resp.Body.Close()
		t.Fatalf("SafeHTTPClient.Get(%s) aurait dû être bloqué par Dialer.Control", srv.URL)
	}
	if !errors.Is(err, ErrUnsafeURL) {
		t.Fatalf("erreur attendue ErrUnsafeURL, got %v", err)
	}
	if called {
		t.Fatal("le serveur loopback a reçu la requête malgré Dialer.Control")
	}
}

func TestSafeHTTPClient_CheckRedirect(t *testing.T) {
	client := SafeHTTPClient(5 * time.Second)
	originReq := httptest.NewRequest(http.MethodPost, "https://hooks.example.com/start", nil)

	// Redirection vers localhost bloquée.
	toLocalhost := httptest.NewRequest(http.MethodGet, "http://localhost:8080/admin", nil)
	if err := client.CheckRedirect(toLocalhost, []*http.Request{originReq}); !errors.Is(err, ErrUnsafeURL) {
		t.Fatalf("redirection localhost = %v, attendu ErrUnsafeURL", err)
	}

	// Redirection vers IP métadonnées cloud bloquée.
	toMeta := httptest.NewRequest(http.MethodGet, "http://169.254.169.254/latest/meta-data/", nil)
	if err := client.CheckRedirect(toMeta, []*http.Request{originReq}); !errors.Is(err, ErrUnsafeURL) {
		t.Fatalf("redirection 169.254.169.254 = %v, attendu ErrUnsafeURL", err)
	}

	// Jusqu'à 3 redirections publiques autorisées, 4e bloquée.
	toPublic := httptest.NewRequest(http.MethodGet, "https://cdn.example.com/next", nil)
	for hop := 1; hop <= 3; hop++ {
		via := make([]*http.Request, hop)
		for i := range via {
			via[i] = originReq
		}
		if err := client.CheckRedirect(toPublic, via); err != nil {
			t.Fatalf("saut %d autorisé mais erreur: %v", hop, err)
		}
	}

	via4 := []*http.Request{originReq, originReq, originReq, originReq}
	err := client.CheckRedirect(toPublic, via4)
	if !errors.Is(err, ErrUnsafeURL) || !strings.Contains(err.Error(), "redirections") {
		t.Fatalf("4e redirection = %v, attendu blocage max redirections", err)
	}
}
