// Package trust calcule le niveau de confiance (Trust Tier) d'un utilisateur
// à partir de signaux déterministes (vérification téléphone, ancienneté,
// réseau d'abonnés qualifiés, sanctions) et d'indicateurs temps réel en Redis
// (strikes, multi-comptes par sous-réseau, empreinte navigateur, baseline EWMA).
package trust

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/observability"
	"github.com/redis/go-redis/v9"
)

// Tier représente le niveau de confiance attribué à un utilisateur.
type Tier string

const (
	// TierRestricted désigne un compte sanctionné ou fortement suspect.
	TierRestricted Tier = "RESTRICTED"
	// TierLow désigne un compte récent ou non encore vérifié.
	TierLow Tier = "LOW"
	// TierStandard désigne un compte vérifié ayant complété l'accueil.
	TierStandard Tier = "STANDARD"
	// TierTrusted désigne un compte établi, certifié ou membre du staff.
	TierTrusted Tier = "TRUSTED"
)

// Level retourne le rang ordinal du palier (0 = RESTRICTED .. 3 = TRUSTED).
func (t Tier) Level() int {
	switch t {
	case TierRestricted:
		return 0
	case TierLow:
		return 1
	case TierStandard:
		return 2
	case TierTrusted:
		return 3
	default:
		return 0
	}
}

const (
	trustCacheTTL    = 10 * time.Minute
	networkWindowTTL = 1 * time.Hour
	ewmaAlpha        = 0.2
)

// Signals regroupe l'ensemble des signaux bruts utilisés par ComputeScore.
// Cette structure est pure (sans dépendance réseau) afin de faciliter les tests.
type Signals struct {
	UserID                   string
	PhoneVerified            bool
	OnboardingDone           bool
	AccountAge               time.Duration
	ExternalLinkOrColdAction bool
	IsCertifiedOrStaff       bool
	HasPublisher             bool
	QualifiedFollowers       int
	TotalFollowers           int
	SuspiciousFollowerRatio  float64
	SubnetUserCount          int64
	ActiveStrikes            int
	Shadowbanned             bool
	Suspended                bool
	ActiveRiskDecision       string
	EvaluatedAt              time.Time
}

// Profile représente le résultat d'évaluation de confiance d'un utilisateur.
type Profile struct {
	UserID                string        `json:"userId"`
	Score                 int           `json:"score"`
	Tier                  Tier          `json:"tier"`
	FollowRingSuspected   bool          `json:"followRingSuspected"`
	MultiAccountSuspected bool          `json:"multiAccountSuspected"`
	EffectiveFollowers    int           `json:"effectiveFollowers"`
	Strikes               int           `json:"strikes"`
	SubnetUsers           int64         `json:"subnetUsers"`
	AccountAge            time.Duration `json:"accountAge"`
	EvaluatedAt           time.Time     `json:"evaluatedAt"`
}

// TimeToFirstActionPenalty applique une pénalité immédiate de -20 points
// lorsqu'un compte de moins de 5 minutes publie un lien externe ou initie
// une action à froid (cold DM / spam rapide).
func TimeToFirstActionPenalty(age time.Duration, hasExternalOrCold bool) int {
	if hasExternalOrCold && age < 5*time.Minute {
		return -20
	}
	return 0
}

// ComputeScore calcule de façon pure et déterministe le score (0..100) et le
// Tier d'un utilisateur à partir de ses signaux.
func ComputeScore(s Signals) Profile {
	evalAt := s.EvaluatedAt
	if evalAt.IsZero() {
		evalAt = time.Now().UTC()
	}

	rawScore := 0
	if s.PhoneVerified {
		rawScore += 25
	}
	if s.OnboardingDone {
		rawScore += 15
	}
	if s.AccountAge > 30*24*time.Hour {
		rawScore += 25
	} else if s.AccountAge > 7*24*time.Hour {
		rawScore += 15
	}
	if s.HasPublisher {
		rawScore += 10
	}

	followRing := s.TotalFollowers >= 4 && s.SuspiciousFollowerRatio > 0.60
	effectiveFollowers := s.QualifiedFollowers
	if followRing {
		effectiveFollowers = 0
	} else if s.QualifiedFollowers >= 25 {
		rawScore += 25
	} else if s.QualifiedFollowers >= 5 {
		rawScore += 15
	}

	multiAccount := s.SubnetUserCount > 3
	if multiAccount {
		rawScore -= 30
	}
	if s.ActiveStrikes > 0 {
		rawScore -= 15 * s.ActiveStrikes
	}
	rawScore += TimeToFirstActionPenalty(s.AccountAge, s.ExternalLinkOrColdAction)

	score := clampScore(rawScore)
	if s.IsCertifiedOrStaff && score < 75 {
		score = 75
	}

	tier := tierFromScores(rawScore, score, s.IsCertifiedOrStaff)
	tier = applySanctionClamp(tier, s.Shadowbanned, s.Suspended, s.ActiveRiskDecision)

	return Profile{
		UserID:                s.UserID,
		Score:                 score,
		Tier:                  tier,
		FollowRingSuspected:   followRing,
		MultiAccountSuspected: multiAccount,
		EffectiveFollowers:    effectiveFollowers,
		Strikes:               s.ActiveStrikes,
		SubnetUsers:           s.SubnetUserCount,
		AccountAge:            s.AccountAge,
		EvaluatedAt:           evalAt,
	}
}

func clampScore(v int) int {
	if v < 0 {
		return 0
	}
	if v > 100 {
		return 100
	}
	return v
}

func tierFromScores(rawScore, clampedScore int, certifiedOrStaff bool) Tier {
	if certifiedOrStaff && clampedScore >= 75 {
		return TierTrusted
	}
	if rawScore < 0 {
		return TierRestricted
	}
	switch {
	case clampedScore >= 75:
		return TierTrusted
	case clampedScore >= 40:
		return TierStandard
	default:
		return TierLow
	}
}

func applySanctionClamp(current Tier, shadowbanned, suspended bool, decision string) Tier {
	if shadowbanned || suspended {
		return TierRestricted
	}
	switch decision {
	case "suspend", "pause_sending":
		return TierRestricted
	case "limit_distribution", "challenge":
		if current.Level() > TierLow.Level() {
			return TierLow
		}
	}
	return current
}

// Service évalue la confiance utilisateur en combinant cache Redis, compteurs
// réseau temps réel et lecture Postgres sur miss de cache.
type Service struct {
	pool *pgxpool.Pool
	rc   *redis.Client
}

// NewService construit un service d'évaluation de confiance.
// pool ou rc peuvent être nil (dégradation contrôlée sans panique).
func NewService(pool *pgxpool.Pool, rc *redis.Client) *Service {
	return &Service{pool: pool, rc: rc}
}

type cachedTrustSignals struct {
	PhoneVerified           bool      `json:"phoneVerified"`
	OnboardingDone          bool      `json:"onboardingDone"`
	CreatedAt               time.Time `json:"createdAt"`
	IsCertifiedOrStaff      bool      `json:"isCertifiedOrStaff"`
	HasPublisher            bool      `json:"hasPublisher"`
	QualifiedFollowers      int       `json:"qualifiedFollowers"`
	TotalFollowers          int       `json:"totalFollowers"`
	SuspiciousFollowerRatio float64   `json:"suspiciousFollowerRatio"`
	Shadowbanned            bool      `json:"shadowbanned"`
	Suspended               bool      `json:"suspended"`
	ActiveRiskDecision      string    `json:"activeRiskDecision"`
}

func trustCacheKey(userID string) string {
	return "sec:trust:" + userID
}

func strikesKey(userID string) string {
	return "sec:strikes:" + userID
}

func subnetUsersKey(subnet string) string {
	return "sec:net:users:" + subnet
}

func userAgentFingerprintKey(userAgent string) string {
	sum := sha256.Sum256([]byte(userAgent))
	return "sec:net:fp:" + hex.EncodeToString(sum[:8])
}

func baselineKey(metric string) string {
	return "sec:baseline:" + metric
}

// Evaluate retourne le profil de confiance courant de userID.
// Les signaux DB sont mis en cache 10 minutes dans `sec:trust:{userID}` tandis
// que les strikes et compteurs sous-réseau sont lus en direct dans Redis.
func (s *Service) Evaluate(ctx context.Context, userID, subnet, userAgent string) (Profile, error) {
	if userID == "" {
		return Profile{}, errors.New("identifiant utilisateur requis pour l'évaluation de confiance")
	}

	strikes, subnetUsers := s.collectRealtimeSignals(ctx, userID, subnet, userAgent)

	dbSig, err := s.loadUserSignals(ctx, userID)
	if err != nil {
		return Profile{}, err
	}

	var age time.Duration
	if !dbSig.CreatedAt.IsZero() {
		age = time.Since(dbSig.CreatedAt)
		if age < 0 {
			age = 0
		}
	}

	prof := ComputeScore(Signals{
		UserID:                  userID,
		PhoneVerified:           dbSig.PhoneVerified,
		OnboardingDone:          dbSig.OnboardingDone,
		AccountAge:              age,
		IsCertifiedOrStaff:      dbSig.IsCertifiedOrStaff,
		HasPublisher:            dbSig.HasPublisher,
		QualifiedFollowers:      dbSig.QualifiedFollowers,
		TotalFollowers:          dbSig.TotalFollowers,
		SuspiciousFollowerRatio: dbSig.SuspiciousFollowerRatio,
		SubnetUserCount:         subnetUsers,
		ActiveStrikes:           strikes,
		Shadowbanned:            dbSig.Shadowbanned,
		Suspended:               dbSig.Suspended,
		ActiveRiskDecision:      dbSig.ActiveRiskDecision,
	})
	observability.Default().IncTrustTierEvaluation(string(prof.Tier))
	return prof, nil
}

func (s *Service) collectRealtimeSignals(ctx context.Context, userID, subnet, userAgent string) (strikes int, subnetUsers int64) {
	if s == nil || s.rc == nil {
		return 0, 0
	}

	pipe := s.rc.Pipeline()
	strikesCmd := pipe.Get(ctx, strikesKey(userID))

	var subnetCountCmd *redis.IntCmd
	if subnet != "" {
		sk := subnetUsersKey(subnet)
		pipe.SAdd(ctx, sk, userID)
		pipe.Expire(ctx, sk, networkWindowTTL)
		subnetCountCmd = pipe.SCard(ctx, sk)
	}
	if userAgent != "" {
		fpk := userAgentFingerprintKey(userAgent)
		pipe.SAdd(ctx, fpk, userID)
		pipe.Expire(ctx, fpk, networkWindowTTL)
	}

	_, _ = pipe.Exec(ctx)

	if raw, err := strikesCmd.Result(); err == nil {
		if n, convErr := strconv.Atoi(raw); convErr == nil && n > 0 {
			strikes = n
		}
	}
	if subnetCountCmd != nil {
		if n, err := subnetCountCmd.Result(); err == nil {
			subnetUsers = n
		}
	}
	return strikes, subnetUsers
}

func (s *Service) loadUserSignals(ctx context.Context, userID string) (cachedTrustSignals, error) {
	if s != nil && s.rc != nil {
		if raw, err := s.rc.Get(ctx, trustCacheKey(userID)).Bytes(); err == nil {
			var cached cachedTrustSignals
			if jsonErr := json.Unmarshal(raw, &cached); jsonErr == nil {
				return cached, nil
			}
		}
	}

	if s == nil || s.pool == nil {
		// Dégradation sûre si la base Postgres n'est pas initialisée.
		return cachedTrustSignals{}, nil
	}

	sig, err := s.queryUserSignals(ctx, userID)
	if err != nil {
		return cachedTrustSignals{}, err
	}

	if s.rc != nil {
		if payload, marshalErr := json.Marshal(sig); marshalErr == nil {
			_ = s.rc.Set(ctx, trustCacheKey(userID), payload, trustCacheTTL).Err()
		}
	}
	return sig, nil
}

const userTrustQuery = `
SELECT
	u."phoneVerifiedAt" IS NOT NULL,
	u."hasCompletedOnboarding",
	u."createdAt",
	(u."isCertified" OR u."role" IN ('superadmin', 'admin', 'staff', 'moderator')),
	COALESCE(u."publisherId", '') <> '',
	u."isShadowbanned",
	u."isSuspended",
	COALESCE((
		SELECT COUNT(*)
		FROM "Follows" f
		JOIN "User" fuser ON fuser.id = f."readerId"
		WHERE f."publisherId" = u."publisherId"
		  AND u."publisherId" IS NOT NULL
		  AND NOT fuser."isShadowbanned"
		  AND NOT fuser."isSuspended"
		  AND (fuser."phoneVerifiedAt" IS NOT NULL OR fuser."createdAt" < now() - interval '7 days')
	), 0)::int,
	COALESCE((
		SELECT COUNT(*)
		FROM "Follows" f
		WHERE f."publisherId" = u."publisherId"
		  AND u."publisherId" IS NOT NULL
	), 0)::int,
	COALESCE((
		SELECT COUNT(*)
		FROM "Follows" f
		JOIN "User" fuser ON fuser.id = f."readerId"
		WHERE f."publisherId" = u."publisherId"
		  AND u."publisherId" IS NOT NULL
		  AND fuser."createdAt" >= u."createdAt" - interval '7 days'
		  AND fuser."createdAt" <= u."createdAt" + interval '7 days'
	), 0)::int,
	COALESCE((
		SELECT rd."result"
		FROM "RiskDecision" rd
		WHERE rd."subjectType" = 'user'
		  AND rd."subjectId" = u.id::text
		  AND rd."result" IN ('suspend', 'pause_sending', 'limit_distribution', 'challenge')
		  AND (rd."expiresAt" IS NULL OR rd."expiresAt" > now())
		ORDER BY rd."createdAt" DESC
		LIMIT 1
	), '')
FROM "User" u
WHERE u.id = $1::uuid`

func (s *Service) queryUserSignals(ctx context.Context, userID string) (cachedTrustSignals, error) {
	var sig cachedTrustSignals
	var suspiciousFollowers int

	err := s.pool.QueryRow(ctx, userTrustQuery, userID).Scan(
		&sig.PhoneVerified,
		&sig.OnboardingDone,
		&sig.CreatedAt,
		&sig.IsCertifiedOrStaff,
		&sig.HasPublisher,
		&sig.Shadowbanned,
		&sig.Suspended,
		&sig.QualifiedFollowers,
		&sig.TotalFollowers,
		&suspiciousFollowers,
		&sig.ActiveRiskDecision,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return cachedTrustSignals{}, fmt.Errorf("utilisateur %s introuvable: %w", userID, err)
		}
		return cachedTrustSignals{}, fmt.Errorf("lecture des signaux de confiance: %w", err)
	}

	if sig.TotalFollowers > 0 {
		sig.SuspiciousFollowerRatio = float64(suspiciousFollowers) / float64(sig.TotalFollowers)
	}
	return sig, nil
}

// InvalidateUser supprime immédiatement le cache de confiance d'un utilisateur
// afin qu'un changement de rôle, de sanction ou de vérification soit pris en compte sans délai.
func (s *Service) InvalidateUser(ctx context.Context, userID string) {
	if s == nil || s.rc == nil || userID == "" {
		return
	}
	_ = s.rc.Del(ctx, trustCacheKey(userID)).Err()
}

var ewmaUpdateScript = redis.NewScript(`
local key = KEYS[1]
local val = tonumber(ARGV[1])
local alpha = tonumber(ARGV[2])
local cur = redis.call('GET', key)
local nextVal
if not cur then
	nextVal = val
else
	local prev = tonumber(cur) or 0
	nextVal = alpha * val + (1 - alpha) * prev
end
redis.call('SET', key, tostring(nextVal))
return tostring(nextVal)
`)

// RecordPlatformAction met à jour de manière atomique la moyenne mobile
// exponentielle (EWMA) d'une métrique plateforme dans `sec:baseline:{metric}`.
func (s *Service) RecordPlatformAction(ctx context.Context, metric string, count int64) {
	if s == nil || s.rc == nil || metric == "" {
		return
	}
	_ = ewmaUpdateScript.Run(ctx, s.rc, []string{baselineKey(metric)}, count, ewmaAlpha).Err()
}

// GetPlatformEWMA lit la valeur EWMA courante de `sec:baseline:{metric}` (0 si absente).
func (s *Service) GetPlatformEWMA(ctx context.Context, metric string) float64 {
	if s == nil || s.rc == nil || metric == "" {
		return 0
	}
	raw, err := s.rc.Get(ctx, baselineKey(metric)).Result()
	if err != nil {
		return 0
	}
	val, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return 0
	}
	return val
}
