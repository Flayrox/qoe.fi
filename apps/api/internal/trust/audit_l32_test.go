package trust

// Audit L32 — régressions de confiance : une panne Redis ne doit jamais
// produire un profil plus favorable, et une évaluation en échec ne doit
// laisser aucune trace dans les compteurs réseau.

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// Une panne Redis rendait strikes et compteurs sous-réseau silencieusement à
// zéro : le profil calculé était plus permissif que la réalité (un compte à
// cinq strikes repassait au palier supérieur) alors qu'EvaluateRequest
// documente « jamais un défaut permissif sur une erreur ».
func TestAuditL32_RedisOutageIsAnError(t *testing.T) {
	ctx := context.Background()
	s := miniredis.RunT(t)
	rc := redis.NewClient(&redis.Options{Addr: s.Addr()})
	t.Cleanup(func() { _ = rc.Close() })
	s.Close() // Redis injoignable : plus aucune lecture ne peut aboutir.

	svc := NewService(nil, rc)
	if _, err := svc.Evaluate(ctx, "u1", "198.51.100.0/24"); err == nil {
		t.Fatal("panne Redis : profil permissif calculé sans erreur (strikes et sous-réseau perdus)")
	}
}

// L'évaluation inscrivait l'utilisateur au compteur de sous-réseau AVANT la
// lecture des signaux : une évaluation qui échoue ensuite (base injoignable)
// laissait un membre fantôme dans `sec:net:users:<subnet>` pendant 1 h,
// pénalisant -30 tous les comptes réels du même /24.
func TestAuditL32_FailedEvaluationDoesNotPolluteSubnet(t *testing.T) {
	ctx := context.Background()
	s, rc := newTestRedis(t)

	pool, err := pgxpool.New(ctx, "postgres://audit:audit@127.0.0.1:1/audit?sslmode=disable&connect_timeout=1")
	if err != nil {
		t.Fatalf("pool de test : %v", err)
	}
	t.Cleanup(pool.Close)

	svc := NewService(pool, rc)
	if _, err := svc.Evaluate(ctx, "fantome", "203.0.113.0/24"); err == nil {
		t.Fatal("base injoignable : évaluation réussie (attendu une erreur)")
	}
	for _, k := range s.Keys() {
		if strings.HasPrefix(k, "sec:net:users:") {
			t.Fatalf("évaluation en échec : l'utilisateur a quand même été inscrit au compteur %s", k)
		}
	}
}

// L'empreinte navigateur était écrite à chaque évaluation (une clé Redis par
// User-Agent distinct, 1 h de TTL) sans jamais être relue : un client choisit
// son propre User-Agent et faisait donc croître l'espace de clés à volonté.
func TestAuditL32_NoUnreadUserAgentFingerprintKeys(t *testing.T) {
	ctx := context.Background()
	s, rc := newTestRedis(t)
	svc := NewService(nil, rc)

	for _, uid := range []string{"u1", "u2", "u3"} {
		if _, err := svc.Evaluate(ctx, uid, ""); err != nil {
			t.Fatalf("Evaluate(%s): %v", uid, err)
		}
	}
	for _, k := range s.Keys() {
		if strings.HasPrefix(k, "sec:net:fp:") {
			t.Fatalf("empreinte navigateur jamais lue mais écrite : %s", k)
		}
	}
}

// Les strikes restent lus en direct (pas depuis le cache 10 min des signaux).
func TestAuditL32_RealtimeSignalsReadLive(t *testing.T) {
	ctx := context.Background()
	_, rc := newTestRedis(t)
	svc := NewService(nil, rc)
	if err := rc.Set(ctx, strikesKey("u1"), "2", 15*time.Minute).Err(); err != nil {
		t.Fatal(err)
	}
	p, err := svc.Evaluate(ctx, "u1", "")
	if err != nil {
		t.Fatalf("Evaluate: %v", err)
	}
	if p.Strikes != 2 {
		t.Fatalf("Strikes = %d, attendu 2 (lecture live)", p.Strikes)
	}
}
