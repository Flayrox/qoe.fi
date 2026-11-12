package trust

import (
	"context"
	"encoding/json"
	"math"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

func newTestRedis(t *testing.T) (*miniredis.Miniredis, *redis.Client) {
	t.Helper()
	s := miniredis.RunT(t)
	rc := redis.NewClient(&redis.Options{Addr: s.Addr()})
	t.Cleanup(func() { _ = rc.Close() })
	return s, rc
}

func TestTierLevel(t *testing.T) {
	cases := []struct {
		tier Tier
		want int
	}{
		{TierRestricted, 0},
		{TierLow, 1},
		{TierStandard, 2},
		{TierTrusted, 3},
		{Tier("UNKNOWN"), 0},
	}
	for _, tc := range cases {
		if got := tc.tier.Level(); got != tc.want {
			t.Errorf("Tier(%q).Level() = %d, attendu %d", tc.tier, got, tc.want)
		}
	}
}

func TestTimeToFirstActionPenalty(t *testing.T) {
	if got := TimeToFirstActionPenalty(2*time.Minute, true); got != -20 {
		t.Errorf("attendu -20 pour compte < 5m avec lien externe, obtenu %d", got)
	}
	if got := TimeToFirstActionPenalty(2*time.Minute, false); got != 0 {
		t.Errorf("attendu 0 sans lien externe ni action à froid, obtenu %d", got)
	}
	if got := TimeToFirstActionPenalty(6*time.Minute, true); got != 0 {
		t.Errorf("attendu 0 après 5m, obtenu %d", got)
	}
}

func TestComputeScore_AllPositiveRules(t *testing.T) {
	// Nouveau compte nu : score 0 -> LOW.
	p0 := ComputeScore(Signals{UserID: "u0"})
	if p0.Score != 0 || p0.Tier != TierLow {
		t.Fatalf("compte nu: score=%d tier=%s, attendu 0 / LOW", p0.Score, p0.Tier)
	}

	// Téléphone (+25) + onboarding (+15) = 40 -> STANDARD.
	pStd := ComputeScore(Signals{
		UserID:         "u1",
		PhoneVerified:  true,
		OnboardingDone: true,
		AccountAge:     8 * 24 * time.Hour, // +15
		QualifiedFollowers: 5,              // +15
		TotalFollowers:     5,
	})
	if pStd.Score != 70 || pStd.Tier != TierStandard {
		t.Fatalf("attendu 70 / STANDARD, obtenu %d / %s", pStd.Score, pStd.Tier)
	}

	// Maximum naturel : 25 + 15 + 25 (>30j) + 10 (publisher) + 25 (>=25 abonnés) = 100 -> TRUSTED.
	pMax := ComputeScore(Signals{
		UserID:             "u2",
		PhoneVerified:      true,
		OnboardingDone:     true,
		AccountAge:         45 * 24 * time.Hour,
		HasPublisher:       true,
		QualifiedFollowers: 30,
		TotalFollowers:     30,
	})
	if pMax.Score != 100 || pMax.Tier != TierTrusted {
		t.Fatalf("attendu 100 / TRUSTED, obtenu %d / %s", pMax.Score, pMax.Tier)
	}

	// Certifié / staff : plancher immédiat >= 75 / TRUSTED même sans autres signaux.
	pCert := ComputeScore(Signals{
		UserID:             "u3",
		IsCertifiedOrStaff: true,
	})
	if pCert.Score < 75 || pCert.Tier != TierTrusted {
		t.Fatalf("certifié doit avoir score >= 75 et TRUSTED, obtenu %d / %s", pCert.Score, pCert.Tier)
	}
}

func TestComputeScore_FollowRingNeutralization(t *testing.T) {
	// > 60% d'abonnés suspects avec au moins 4 abonnés : bonus réseau forcé à 0.
	pRing := ComputeScore(Signals{
		UserID:                  "u-ring",
		PhoneVerified:           true, // +25
		OnboardingDone:          true, // +15
		QualifiedFollowers:      25,   // normalement +25, annulé ici
		TotalFollowers:          10,
		SuspiciousFollowerRatio: 0.70,
	})
	if !pRing.FollowRingSuspected {
		t.Fatal("FollowRingSuspected doit être true")
	}
	if pRing.EffectiveFollowers != 0 {
		t.Errorf("EffectiveFollowers = %d, attendu 0", pRing.EffectiveFollowers)
	}
	if pRing.Score != 40 {
		t.Errorf("Score = %d, attendu 40 (bonus réseau neutralisé)", pRing.Score)
	}

	// Avec seulement 3 abonnés au total (< 4), la règle de ring ne se déclenche pas.
	pSmall := ComputeScore(Signals{
		UserID:                  "u-small",
		QualifiedFollowers:      3,
		TotalFollowers:          3,
		SuspiciousFollowerRatio: 1.0,
	})
	if pSmall.FollowRingSuspected {
		t.Error("FollowRingSuspected ne doit pas se déclencher pour < 4 abonnés")
	}
}

func TestComputeScore_SubnetMultiAccountAndStrikesAndTimeToFirstSpam(t *testing.T) {
	// > 3 comptes sur même sous-réseau -> -30 + MultiAccountSuspected.
	pSub := ComputeScore(Signals{
		UserID:          "u-sub",
		PhoneVerified:   true, // +25
		OnboardingDone:  true, // +15
		SubnetUserCount: 4,    // -30 => score 10, LOW
	})
	if !pSub.MultiAccountSuspected {
		t.Fatal("MultiAccountSuspected doit être true pour SubnetUserCount > 3")
	}
	if pSub.Score != 10 || pSub.Tier != TierLow {
		t.Errorf("attendu score=10 tier=LOW, obtenu %d / %s", pSub.Score, pSub.Tier)
	}

	// À exactement 3 comptes sur sous-réseau : pas de pénalité.
	pSubOK := ComputeScore(Signals{
		UserID:          "u-sub-ok",
		PhoneVerified:   true,
		OnboardingDone:  true,
		SubnetUserCount: 3,
	})
	if pSubOK.MultiAccountSuspected || pSubOK.Score != 40 {
		t.Errorf("attendu score=40 sans pénalité pour 3 comptes, obtenu %d (multi=%v)", pSubOK.Score, pSubOK.MultiAccountSuspected)
	}

	// Strikes (-15 chacun) + TimeToFirstActionPenalty (-20) => clamp à 0 et RESTRICTED.
	pPen := ComputeScore(Signals{
		UserID:                   "u-pen",
		AccountAge:               1 * time.Minute,
		ExternalLinkOrColdAction: true, // -20
		ActiveStrikes:            2,    // -30
	})
	if pPen.Score != 0 || pPen.Tier != TierRestricted {
		t.Errorf("attendu score=0 (clamp) tier=RESTRICTED, obtenu %d / %s", pPen.Score, pPen.Tier)
	}
}

func TestComputeScore_SanctionOverrides(t *testing.T) {
	cases := []struct {
		name     string
		signals  Signals
		wantTier Tier
	}{
		{
			name:     "shadowbanned écrase certifié",
			signals:  Signals{UserID: "u1", IsCertifiedOrStaff: true, Shadowbanned: true},
			wantTier: TierRestricted,
		},
		{
			name:     "suspended écrase certifié",
			signals:  Signals{UserID: "u2", IsCertifiedOrStaff: true, Suspended: true},
			wantTier: TierRestricted,
		},
		{
			name:     "decision suspend",
			signals:  Signals{UserID: "u3", IsCertifiedOrStaff: true, ActiveRiskDecision: "suspend"},
			wantTier: TierRestricted,
		},
		{
			name:     "decision pause_sending",
			signals:  Signals{UserID: "u4", IsCertifiedOrStaff: true, ActiveRiskDecision: "pause_sending"},
			wantTier: TierRestricted,
		},
		{
			name:     "decision limit_distribution plafonne à LOW",
			signals:  Signals{UserID: "u5", IsCertifiedOrStaff: true, ActiveRiskDecision: "limit_distribution"},
			wantTier: TierLow,
		},
		{
			name:     "decision challenge plafonne à LOW",
			signals:  Signals{UserID: "u6", PhoneVerified: true, OnboardingDone: true, ActiveRiskDecision: "challenge"},
			wantTier: TierLow,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			p := ComputeScore(tc.signals)
			if p.Tier != tc.wantTier {
				t.Errorf("Tier = %s, attendu %s", p.Tier, tc.wantTier)
			}
		})
	}
}

func TestService_CacheInvalidationSubnetAndStrikes(t *testing.T) {
	ctx := context.Background()
	s, rc := newTestRedis(t)
	svc := NewService(nil, rc)

	// Pré-remplit le cache sec:trust:u1 pour tester le chemin rapide sans Postgres.
	cached := cachedTrustSignals{
		PhoneVerified:  true,
		OnboardingDone: true,
		CreatedAt:      time.Now().UTC().Add(-40 * 24 * time.Hour),
		HasPublisher:   true,
	}
	payload, err := json.Marshal(cached)
	if err != nil {
		t.Fatal(err)
	}
	if err := rc.Set(ctx, "sec:trust:u1", payload, 10*time.Minute).Err(); err != nil {
		t.Fatal(err)
	}

	// Ajoute 3 autres utilisateurs sur le même sous-réseau -> u1 devient le 4e (> 3).
	for _, uid := range []string{"u2", "u3", "u4"} {
		if _, err := svc.Evaluate(ctx, uid, "198.51.100.0/24", "Mozilla/5.0"); err != nil {
			t.Fatalf("Evaluate(%s): %v", uid, err)
		}
	}
	if err := rc.Set(ctx, "sec:strikes:u1", "1", 15*time.Minute).Err(); err != nil {
		t.Fatal(err)
	}

	p, err := svc.Evaluate(ctx, "u1", "198.51.100.0/24", "Mozilla/5.0")
	if err != nil {
		t.Fatalf("Evaluate(u1): %v", err)
	}
	if !p.MultiAccountSuspected || p.SubnetUsers != 4 {
		t.Errorf("MultiAccountSuspected=%v SubnetUsers=%d, attendu true / 4", p.MultiAccountSuspected, p.SubnetUsers)
	}
	if p.Strikes != 1 {
		t.Errorf("Strikes = %d, attendu 1", p.Strikes)
	}
	// 25 (tel) + 15 (onb) + 25 (>30j) + 10 (pub) - 30 (subnet) - 15 (1 strike) = 30 -> LOW.
	if p.Score != 30 || p.Tier != TierLow {
		t.Errorf("Score=%d Tier=%s, attendu 30 / LOW", p.Score, p.Tier)
	}

	// Vérifie que l'empreinte UA a bien été enregistrée.
	if !s.Exists(userAgentFingerprintKey("Mozilla/5.0")) {
		t.Error("clé d'empreinte UA absente de Redis")
	}

	// InvalidateUser supprime sec:trust:u1 immédiatement.
	svc.InvalidateUser(ctx, "u1")
	if s.Exists("sec:trust:u1") {
		t.Fatal("sec:trust:u1 doit être supprimée après InvalidateUser")
	}

	// Avec pool == nil et cache vidé, dégradation sûre sans erreur.
	pDeg, err := svc.Evaluate(ctx, "u1", "", "")
	if err != nil {
		t.Fatalf("dégradation attendue sans erreur, obtenu: %v", err)
	}
	if pDeg.UserID != "u1" {
		t.Errorf("UserID = %q, attendu u1", pDeg.UserID)
	}
}

func TestService_PlatformEWMA(t *testing.T) {
	ctx := context.Background()
	_, rc := newTestRedis(t)
	svc := NewService(nil, rc)

	if got := svc.GetPlatformEWMA(ctx, "thoughts_created"); got != 0 {
		t.Fatalf("EWMA initiale attendue à 0, obtenu %v", got)
	}

	svc.RecordPlatformAction(ctx, "thoughts_created", 100)
	if got := svc.GetPlatformEWMA(ctx, "thoughts_created"); got != 100 {
		t.Fatalf("première EWMA attendue à 100, obtenu %v", got)
	}

	// alpha = 0.2 => 0.2*200 + 0.8*100 = 120.
	svc.RecordPlatformAction(ctx, "thoughts_created", 200)
	got := svc.GetPlatformEWMA(ctx, "thoughts_created")
	if math.Abs(got-120.0) > 1e-6 {
		t.Fatalf("EWMA attendue à 120, obtenu %v", got)
	}
}
