package netguard

import (
	"net"
	"testing"
)

// 6to4 (2002::/16) embarque une adresse IPv4 : 2002:7f00:0001:: désigne
// 127.0.0.1 et 2002:a9fe:a9fe:: désigne 169.254.169.254 (métadonnées cloud).
// Sans ce préfixe dans la liste réservée, IsPublicIP les déclare publiques et
// le garde anti-SSRF laisse passer.
func TestIsPublicIP_RefuseSix2Four(t *testing.T) {
	cases := []string{
		"2002:7f00:0001::", // 127.0.0.1
		"2002:a9fe:a9fe::", // 169.254.169.254
		"2002:0a00:0001::", // 10.0.0.1
	}
	for _, raw := range cases {
		if IsPublicIP(net.ParseIP(raw)) {
			t.Errorf("IsPublicIP(%s) = true, attendu false (6to4 vers une adresse interne)", raw)
		}
	}
	if !IsPublicIP(net.ParseIP("2606:4700:4700::1111")) {
		t.Error("adresse IPv6 publique refusée à tort")
	}
}
