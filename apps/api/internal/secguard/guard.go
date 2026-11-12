// Package secguard orchestre la protection temps réel des écritures HTTP :
// évaluation du Trust Tier, rate-limiting GCRA dynamique multi-fenêtres
// (User + Subnet), validation anti-spam/SimHash, strikes progressifs et
// remontée des signaux coordonnés vers internal/abuse (PolicyV3).
package secguard

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/abuse"
	"github.com/qoefi/api/internal/antispam"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/observability"
	"github.com/qoefi/api/internal/response"
	"github.com/qoefi/api/internal/trust"
	"github.com/redis/go-redis/v9"
)

// QuotaWindow définit les plafonds par minute, par heure et par jour pour un palier.
type QuotaWindow struct {
	PerMin  int
	PerHour int
	PerDay  int
}

// TierQuotas associe à chaque palier de confiance ses fenêtres de débit.
type TierQuotas struct {
	Restricted QuotaWindow
	Low        QuotaWindow
	Standard   QuotaWindow
	Trusted    QuotaWindow
	UseSubnet  bool
}

func (q TierQuotas) forTier(tier trust.Tier) QuotaWindow {
	switch tier {
	case trust.TierTrusted:
		return q.Trusted
	case trust.TierStandard:
		return q.Standard
	case trust.TierLow:
		return q.Low
	default:
		if q.Restricted != (QuotaWindow{}) {
			return q.Restricted
		}
		return q.Low
	}
}

// Tables de quotas alignées sur la politique anti-flood multi-couches.
var (
	QuotasThoughts = TierQuotas{
		Low:       QuotaWindow{PerHour: 5},
		Standard:  QuotaWindow{PerMin: 10, PerHour: 60},
		Trusted:   QuotaWindow{PerMin: 20, PerHour: 150},
		UseSubnet: true,
	}
	QuotasArticlesCreate = TierQuotas{
		Low:       QuotaWindow{PerDay: 2},
		Standard:  QuotaWindow{PerMin: 5, PerHour: 30},
		Trusted:   QuotaWindow{PerMin: 10, PerHour: 60},
		UseSubnet: true,
	}
	QuotasArticlesEdit = TierQuotas{
		Low:      QuotaWindow{PerMin: 15},
		Standard: QuotaWindow{PerMin: 30},
		Trusted:  QuotaWindow{PerMin: 60},
	}
	QuotasComments = TierQuotas{
		Low:       QuotaWindow{PerHour: 10},
		Standard:  QuotaWindow{PerMin: 20, PerHour: 120},
		Trusted:   QuotaWindow{PerMin: 30, PerHour: 250},
		UseSubnet: true,
	}
	QuotasDMs = TierQuotas{
		Low:       QuotaWindow{PerMin: 10, PerHour: 60},
		Standard:  QuotaWindow{PerMin: 20, PerHour: 200},
		Trusted:   QuotaWindow{PerMin: 30, PerHour: 400},
		UseSubnet: true,
	}
	QuotasFollow = TierQuotas{
		Low:       QuotaWindow{PerHour: 10},
		Standard:  QuotaWindow{PerMin: 30, PerHour: 150},
		Trusted:   QuotaWindow{PerMin: 60, PerHour: 300},
		UseSubnet: true,
	}
	QuotasEngagement = TierQuotas{
		Low:      QuotaWindow{PerMin: 30},
		Standard: QuotaWindow{PerMin: 60},
		Trusted:  QuotaWindow{PerMin: 120},
	}
	QuotasReports = TierQuotas{
		Low:      QuotaWindow{PerHour: 3},
		Standard: QuotaWindow{PerHour: 10},
		Trusted:  QuotaWindow{PerHour: 15},
	}
)

// Guard centralise l'orchestration Trust + GCRA + AntiSpam + Abuse.
// Toutes ses méthodes sont nil-safe pour ne jamais gêner les tests isolés.
type Guard struct {
	pool  *pgxpool.Pool
	rc    *redis.Client
	trust *trust.Service
	spam  *antispam.Guard
}

// New construit le garde de sécurité partagé pour les modules d'écriture.
func New(pool *pgxpool.Pool, rc *redis.Client) *Guard {
	return &Guard{
		pool:  pool,
		rc:    rc,
		trust: trust.NewService(pool, rc),
		spam:  antispam.NewGuard(rc),
	}
}

// EvaluateRequest calcule le profil de confiance temps réel de userID et
// émet un signal subnet.multi_account si un même /24 ou /64 pilote trop de comptes.
func (g *Guard) EvaluateRequest(ctx context.Context, r *http.Request, userID string) trust.Profile {
	if g == nil || g.trust == nil || userID == "" {
		return trust.Profile{UserID: userID, Tier: trust.TierStandard}
	}
	subnet := middleware.ClientSubnet(r)
	ua := ""
	if r != nil {
		ua = r.UserAgent()
	}
	prof, err := g.trust.Evaluate(ctx, userID, subnet, ua)
	if err != nil {
		return trust.Profile{UserID: userID, Tier: trust.TierStandard}
	}
	if prof.MultiAccountSuspected && subnet != "" && g.pool != nil {
		go func(sub string) {
			obsCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			_ = abuse.Observe(obsCtx, g.pool, time.Now(), abuse.Signal{
				Type:        abuse.SignalSubnetMultiAccount,
				SubjectType: abuse.SubjectSubnet,
				SubjectID:   sub,
				Source:      abuse.SourceTrustNetwork,
				Confidence:  abuse.ConfidenceObserved,
				Retention:   abuse.CoordinatedSignalRetention,
			})
		}(subnet)
	}
	return prof
}

// EnforceRateLimit vérifie les fenêtres GCRA User (et Subnet si activé) selon le Tier.
// Répond 429 avec Retry-After et retourne false en cas de dépassement.
func (g *Guard) EnforceRateLimit(ctx context.Context, w http.ResponseWriter, r *http.Request, scope, userID string, tier trust.Tier, quotas TierQuotas) bool {
	if g == nil || g.rc == nil || userID == "" {
		return true
	}
	if frozen, retryAfter := g.spam.IsWriteFrozen(ctx, userID); frozen {
		response.TooManyRequests(w, retryAfter, antispam.CodeWriteCooldown, "Votre compte est temporairement en pause suite à des actions répétées. Réessayez plus tard.")
		return false
	}

	q := quotas.forTier(tier)
	subnet := ""
	if quotas.UseSubnet && r != nil {
		subnet = middleware.ClientSubnet(r)
	}

	checks := []struct {
		suffix string
		win    time.Duration
		limit  int
	}{
		{"m", time.Minute, q.PerMin},
		{"h", time.Hour, q.PerHour},
		{"d", 24 * time.Hour, q.PerDay},
	}

	for _, c := range checks {
		if c.limit <= 0 {
			continue
		}
		if ok, retry := g.checkBucket(ctx, fmt.Sprintf("rl:%s:u:%s:%s", scope, userID, c.suffix), c.win, c.limit); !ok {
			_, cooldown, _ := g.spam.ApplyStrike(ctx, userID)
			if cooldown > retry {
				retry = cooldown
			}
			response.TooManyRequests(w, retry, antispam.CodeWriteCooldown, "Trop d'actions en peu de temps. Patientez avant de réessayer.")
			return false
		}
		// Le seau sous-réseau est volontairement 3× plus large que le seau individuel
		// pour ne pas pénaliser une université ou un réseau mobile derrière NAT.
		if subnet != "" {
			subLimit := c.limit * 3
			if subLimit < 5 {
				subLimit = 5
			}
			if ok, retry := g.checkBucket(ctx, fmt.Sprintf("rl:%s:net:%s:%s", scope, subnet, c.suffix), c.win, subLimit); !ok {
				response.TooManyRequests(w, retry, antispam.CodeWriteCooldown, "Trafic inhabituel détecté depuis votre réseau. Réessayez dans un instant.")
				return false
			}
		}
	}
	return true
}

func (g *Guard) checkBucket(ctx context.Context, key string, win time.Duration, limit int) (bool, int) {
	allowed, retryAfter, err := middleware.CheckGCRA(ctx, g.rc, key, win, limit)
	if err != nil {
		// Fail-open documenté si Redis est indisponible.
		return true, 0
	}
	return allowed, retryAfter
}

// EnforceContentWrite applique le gel éventuel, la pénalité time-to-first-spam (<5m + lien),
// la validation syntaxique/tier/XSS et la déduplication SHA-256 + SimHash LSH.
func (g *Guard) EnforceContentWrite(ctx context.Context, w http.ResponseWriter, userID, scope, text string, prof trust.Profile, validate func(trust.Tier) error) bool {
	if g == nil {
		return validate(trust.TierStandard) == nil
	}
	if g.spam != nil {
		if frozen, retryAfter := g.spam.IsWriteFrozen(ctx, userID); frozen {
			response.TooManyRequests(w, retryAfter, antispam.CodeWriteCooldown, "Écriture temporairement suspendue suite à des contenus rejetés.")
			return false
		}
	}

	effectiveTier := prof.Tier
	if effectiveTier == "" {
		effectiveTier = trust.TierStandard
	}
	if prof.AccountAge > 0 && prof.AccountAge < 5*time.Minute {
		if links, _ := antispam.CountLinksAndMentions(text); links > 0 {
			effectiveTier = trust.TierLow
		}
	}

	if validate != nil {
		if err := validate(effectiveTier); err != nil {
			g.handleAntispamRejection(ctx, w, userID, err)
			return false
		}
	}

	if g.spam != nil && text != "" {
		coordinated, err := g.spam.CheckAndRecordFingerprint(ctx, userID, scope, text)
		if err != nil {
			if coordinated && g.pool != nil {
				go func(uid string) {
					obsCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
					defer cancel()
					_ = abuse.Observe(obsCtx, g.pool, time.Now(), abuse.Signal{
						Type:        abuse.SignalCoordinatedSpam,
						SubjectType: abuse.SubjectUser,
						SubjectID:   uid,
						Source:      sourceForScope(scope),
						Confidence:  abuse.ConfidenceObserved,
						Retention:   abuse.CoordinatedSignalRetention,
					})
				}(userID)
			}
			g.handleAntispamRejection(ctx, w, userID, err)
			return false
		}
	}

	g.RecordAction(ctx, scope)
	return true
}

func sourceForScope(scope string) string {
	switch scope {
	case "comments":
		return abuse.SourceCommentsWrite
	case "dm":
		return abuse.SourceConversationsDM
	default:
		return abuse.SourcePostsWrite
	}
}

func (g *Guard) handleAntispamRejection(ctx context.Context, w http.ResponseWriter, userID string, err error) {
	var rej *antispam.RejectionError
	if errors.As(err, &rej) {
		if g.spam != nil && userID != "" && shouldStrikeCode(rej.Code) {
			_, cooldown, _ := g.spam.ApplyStrike(ctx, userID)
			if cooldown > rej.RetryAfterSec {
				rej.RetryAfterSec = cooldown
			}
		}
		if rej.HTTPStatus == http.StatusTooManyRequests {
			response.TooManyRequests(w, rej.RetryAfterSec, rej.Code, rej.Message)
			return
		}
		response.ErrorCode(w, rej.HTTPStatus, rej.Code, rej.Message)
		return
	}
	response.BadRequest(w, err.Error())
}

func shouldStrikeCode(code string) bool {
	switch code {
	case antispam.CodeSpamUnicode, antispam.CodeSpamLinkLimit, antispam.CodeSpamMentionLimit,
		antispam.CodeSpamDuplicate, antispam.CodeSpamCoordinated, antispam.CodeUnsafeHTML:
		return true
	default:
		return false
	}
}

// CheckColdDM délègue au Guard la limite quotidienne de nouveaux destinataires non-abonnés
// et émet un signal abuse.SignalDMColdBurst en cas de démarchage massif.
func (g *Guard) CheckColdDM(ctx context.Context, userID, recipientID string, isFollower bool, prof trust.Profile) error {
	if g == nil || g.spam == nil {
		return nil
	}
	effectiveTier := prof.Tier
	if prof.AccountAge > 0 && prof.AccountAge < 5*time.Minute && !isFollower {
		effectiveTier = trust.TierLow
	}
	err := g.spam.CheckColdDM(ctx, userID, recipientID, isFollower, effectiveTier)
	if err != nil && g.pool != nil {
		go func(uid string) {
			obsCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			_ = abuse.Observe(obsCtx, g.pool, time.Now(), abuse.Signal{
				Type:        abuse.SignalDMColdBurst,
				SubjectType: abuse.SubjectUser,
				SubjectID:   uid,
				Source:      abuse.SourceConversationsDM,
				Confidence:  abuse.ConfidenceObserved,
				Retention:   abuse.CoordinatedSignalRetention,
			})
		}(userID)
	}
	return err
}

// TrackFollowAction enregistre le churn follow/unfollow et émet un signal abuse
// si un même acteur accumule un va-et-vient suspect sur 24h.
func (g *Guard) TrackFollowAction(ctx context.Context, userID, targetID string) {
	if g == nil || g.spam == nil {
		return
	}
	userChurn, _, err := g.spam.TrackFollowChurn(ctx, userID, targetID)
	if err == nil && userChurn >= 20 && g.pool != nil {
		go func(uid string) {
			obsCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			_ = abuse.Observe(obsCtx, g.pool, time.Now(), abuse.Signal{
				Type:        abuse.SignalFollowChurn,
				SubjectType: abuse.SubjectUser,
				SubjectID:   uid,
				Source:      abuse.SourceCreatorFollow,
				Confidence:  abuse.ConfidenceObserved,
				Retention:   abuse.CoordinatedSignalRetention,
			})
		}(userID)
	}
}

// ObserveCommentTarget enregistre une création de commentaire vers PolicyV3 (comment-swarm).
func (g *Guard) ObserveCommentTarget(ctx context.Context, articleID string) {
	if g == nil || g.pool == nil || articleID == "" {
		return
	}
	go func(aid string) {
		obsCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		_ = abuse.Observe(obsCtx, g.pool, time.Now(), abuse.Signal{
			Type:        abuse.SignalCommentSwarm,
			SubjectType: abuse.SubjectArticle,
			SubjectID:   aid,
			Source:      abuse.SourceCommentsWrite,
			Confidence:  abuse.ConfidenceObserved,
			Retention:   abuse.LikeSignalRetention,
		})
	}(articleID)
}

// InvalidateTrust invalide immédiatement le cache Trust Redis d'un utilisateur.
func (g *Guard) InvalidateTrust(ctx context.Context, userID string) {
	if g == nil || g.trust == nil || userID == "" {
		return
	}
	g.trust.InvalidateUser(ctx, userID)
}

// RecordAction met à jour la baseline temps réel EWMA de la plateforme.
func (g *Guard) RecordAction(ctx context.Context, metric string) {
	if g == nil || g.trust == nil || metric == "" {
		return
	}
	g.trust.RecordPlatformAction(ctx, metric, 1)
}

// WriteRejection écrit une réponse HTTP 400/429 si err est une RejectionError.
func WriteRejection(w http.ResponseWriter, err error) bool {
	var rej *antispam.RejectionError
	if !errors.As(err, &rej) {
		return false
	}
	observability.Default().IncSecGuardRejection("write", rej.Code)
	if rej.HTTPStatus == http.StatusTooManyRequests {
		response.TooManyRequests(w, rej.RetryAfterSec, rej.Code, rej.Message)
		return true
	}
	response.ErrorCode(w, rej.HTTPStatus, rej.Code, rej.Message)
	return true
}
