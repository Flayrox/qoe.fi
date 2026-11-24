package comms

import (
	"context"
	"errors"
	"net/mail"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/observability"
	"github.com/qoefi/api/internal/resilience"
)

// Gateway centralise tout envoi d'e-mail Go derrière :
//   - le contrôle d'opposition ("EmailSuppression", contourné uniquement pour security/always)
//   - un disjoncteur dédié sur les pannes transport transitoires
//   - la détection et mémorisation automatique des bounces SMTP 5xx permanents
//   - l'exposition des métriques Prometheus qoe_email_dispatches_total
type Gateway struct {
	pool        *pgxpool.Pool
	transport   Transport
	defaultFrom string
	cb          *resilience.CircuitBreaker
	metrics     *observability.Registry
	suppressFn  func(ctx context.Context, email, publisherID string) (SuppressionState, error)
	recordBncFn func(ctx context.Context, email, reason, source string) error
}

// NewGateway construit la passerelle autour d'un transport (SMTP/Resend).
// Retourne nil si transport == nil ; pour passer une interface Transport sans
// piège de typed-nil, utiliser WrapTransport.
func NewGateway(pool *pgxpool.Pool, transport Transport, defaultFrom string) *Gateway {
	if transport == nil {
		return nil
	}
	return &Gateway{
		pool:        pool,
		transport:   transport,
		defaultFrom: strings.TrimSpace(defaultFrom),
		cb: resilience.NewCircuitBreaker(resilience.Options{
			Name:             "email-provider",
			FailureThreshold: 5,
			Cooldown:         30 * time.Second,
			CallTimeout:      20 * time.Second,
		}),
		metrics: observability.Default(),
	}
}

// WrapTransport retourne nil (interface non typée) si transport == nil, ou
// une passerelle comms.Gateway configurée autour du transport sinon.
func WrapTransport(pool *pgxpool.Pool, transport Transport, defaultFrom string) Transport {
	if transport == nil {
		return nil
	}
	return NewGateway(pool, transport, defaultFrom)
}

// Name retourne le nom du transport sous-jacent (satisfait comms.Transport).
func (g *Gateway) Name() string {
	if g == nil || g.transport == nil {
		return "disabled"
	}
	return g.transport.Name()
}

// Send satisfait comms.Transport et délègue à Dispatch.
func (g *Gateway) Send(ctx context.Context, msg Message) error {
	return g.Dispatch(ctx, msg)
}

func (g *Gateway) reg() *observability.Registry {
	if g != nil && g.metrics != nil {
		return g.metrics
	}
	return observability.Default()
}

// Dispatch applique suppression -> circuit breaker -> transport -> métriques.
func (g *Gateway) Dispatch(ctx context.Context, msg Message) error {
	if g == nil || g.transport == nil {
		return errors.New("comms: transport email non configuré")
	}

	msgType := strings.TrimSpace(msg.MessageType)
	if msgType == "" {
		msgType = "service.transactional"
	}
	if strings.TrimSpace(msg.From) == "" && g.defaultFrom != "" {
		msg.From = g.defaultFrom
	}

	recipient := normalizeRecipientEmail(msg.To)
	if requiresSuppressionCheck(msgType, msg.IsBulk) && recipient != "" {
		sup, err := g.lookupSuppression(ctx, recipient, msg.PublisherID)
		if err != nil {
			// Best-effort : une erreur ponctuelle de lecture ne bloque pas un OTP/service,
			// mais pour la newsletter l'appelant contrôle déjà Evaluate + LookupSuppression.
			_ = err
		} else if sup.Global || sup.Publisher {
			g.reg().IncEmailDispatch(msgType, g.Name(), "suppressed")
			return nil
		}
	}

	var hardBounceErr error
	execErr := g.cb.Execute(ctx, func(callCtx context.Context) error {
		sendErr := g.transport.Send(callCtx, msg)
		if sendErr == nil {
			return nil
		}
		if isPermanentBounceError(sendErr) {
			// Un bounce 5xx propre à un destinataire ne doit pas ouvrir le circuit pour tous les autres.
			hardBounceErr = sendErr
			return nil
		}
		return sendErr
	})

	if execErr != nil {
		g.reg().IncEmailDispatch(msgType, g.Name(), "failed")
		return execErr
	}
	if hardBounceErr != nil {
		if recipient != "" {
			_ = g.recordBounceSuppression(ctx, recipient, "hard_bounce", "smtp_bounce")
		}
		g.reg().IncEmailDispatch(msgType, g.Name(), "bounced")
		return hardBounceErr
	}

	g.reg().IncEmailDispatch(msgType, g.Name(), "sent")
	return nil
}

func (g *Gateway) lookupSuppression(ctx context.Context, email, publisherID string) (SuppressionState, error) {
	if g.suppressFn != nil {
		return g.suppressFn(ctx, email, publisherID)
	}
	if g.pool == nil {
		return SuppressionState{}, nil
	}
	return LookupSuppression(ctx, g.pool, email, publisherID)
}

func (g *Gateway) recordBounceSuppression(ctx context.Context, email, reason, source string) error {
	if g.recordBncFn != nil {
		return g.recordBncFn(ctx, email, reason, source)
	}
	if g.pool == nil {
		return nil
	}
	return RecordSuppression(ctx, g.pool, email, "global", nil, reason, source)
}

// RecordSuppression insère de manière idempotente une entrée dans "EmailSuppression".
func RecordSuppression(ctx context.Context, pool *pgxpool.Pool, email, scope string, publisherID *string, reason, source string) error {
	if pool == nil {
		return nil
	}
	cleanEmail := normalizeRecipientEmail(email)
	if cleanEmail == "" {
		return nil
	}
	if scope != "publisher" {
		scope = "global"
		publisherID = nil
	} else if publisherID == nil || strings.TrimSpace(*publisherID) == "" {
		return errors.New("comms: publisherId requis pour scope=publisher")
	}

	switch reason {
	case "unsubscribe", "hard_bounce", "complaint", "staff_exclusion", "import_exclusion", "manual":
	default:
		reason = "hard_bounce"
	}
	if strings.TrimSpace(source) == "" {
		source = "system"
	}

	id := "supp_" + strings.ReplaceAll(uuid.New().String(), "-", "")
	if scope == "global" {
		_, err := pool.Exec(ctx, `
			INSERT INTO "EmailSuppression" (id, email, scope, "publisherId", reason, source)
			SELECT $1, $2, 'global', NULL, $3, $4
			WHERE NOT EXISTS (
				SELECT 1 FROM "EmailSuppression"
				WHERE lower(email) = $2 AND scope = 'global' AND reason = $3
			)
		`, id, cleanEmail, reason, source)
		return err
	}

	_, err := pool.Exec(ctx, `
		INSERT INTO "EmailSuppression" (id, email, scope, "publisherId", reason, source)
		SELECT $1, $2, 'publisher', $3, $4, $5
		WHERE NOT EXISTS (
			SELECT 1 FROM "EmailSuppression"
			WHERE lower(email) = $2 AND scope = 'publisher' AND "publisherId" = $3 AND reason = $4
		)
	`, id, cleanEmail, *publisherID, reason, source)
	return err
}

// requiresSuppressionCheck aligne la passerelle sur policy.go : seuls les
// envois de liste (newsletter, produit, invitations, campagnes staff) ou les
// envois bulk sans type explicite consultent EmailSuppression. Les messages
// de sécurité, service lié ou légaux ne sont jamais neutralisés.
func requiresSuppressionCheck(msgType string, isBulk bool) bool {
	switch strings.ToLower(strings.TrimSpace(msgType)) {
	case "creator.newsletter",
		"newsletter.article_published",
		"import.reconfirm",
		"staff.campaign",
		"staff.direct",
		"product.announcement",
		"event.invitation":
		return true
	case "auth.code",
		"auth.recovery",
		"security.alert",
		"webhook.disabled",
		"legal.version_notice",
		"legal.review_reminder",
		"subscriber.confirm",
		"subscriber.welcome",
		"support.reply",
		"event.ticket",
		"service.transactional":
		return false
	default:
		return isBulk
	}
}

func normalizeRecipientEmail(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}
	if parsed, err := mail.ParseAddress(trimmed); err == nil && parsed.Address != "" {
		return strings.ToLower(strings.TrimSpace(parsed.Address))
	}
	if start := strings.LastIndex(trimmed, "<"); start != -1 {
		if end := strings.LastIndex(trimmed, ">"); end > start {
			return strings.ToLower(strings.TrimSpace(trimmed[start+1 : end]))
		}
	}
	return strings.ToLower(trimmed)
}

func isPermanentBounceError(err error) bool {
	if err == nil {
		return false
	}
	s := strings.ToLower(err.Error())
	if strings.Contains(s, "auth") {
		return false
	}
	return strings.Contains(s, "550 ") ||
		strings.Contains(s, "551 ") ||
		strings.Contains(s, "552 ") ||
		strings.Contains(s, "553 ") ||
		strings.Contains(s, "554 ") ||
		strings.Contains(s, "5.1.1") ||
		strings.Contains(s, "user unknown") ||
		strings.Contains(s, "mailbox unavailable") ||
		strings.Contains(s, "recipient address rejected") ||
		strings.Contains(s, "no such user")
}
