package users

import (
	"context"
	"encoding/json"
	"net"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/queue"
)

// SecurityEventDTO représente un événement de sécurité affiché dans les paramètres.
type SecurityEventDTO struct {
	ID        string         `json:"id"`
	EventType string         `json:"eventType"`
	IPSubnet  string         `json:"ipSubnet,omitempty"`
	UserAgent string         `json:"userAgent,omitempty"`
	Metadata  map[string]any `json:"metadata,omitempty"`
	CreatedAt string         `json:"createdAt"`
}

// RecordSecurityEvent enregistre un événement dans SecurityEvent et enfile
// optionnellement une alerte email via Asynq.
func (s *Service) RecordSecurityEvent(ctx context.Context, userID, emailOverride, eventType, ipSubnet, ua string, meta map[string]any, sendEmail bool) {
	if s.pool == nil || userID == "" {
		return
	}
	var metaBytes []byte
	if len(meta) > 0 {
		metaBytes, _ = json.Marshal(meta)
	}
	_, _ = db.New(s.pool).InsertSecurityEvent(ctx, db.InsertSecurityEventParams{
		UserId:    toUUID(userID),
		EventType: eventType,
		IpSubnet:  pgtype.Text{String: ipSubnet, Valid: ipSubnet != ""},
		UserAgent: pgtype.Text{String: ua, Valid: ua != ""},
		Metadata:  metaBytes,
	})

	if !sendEmail {
		return
	}
	to := strings.TrimSpace(emailOverride)
	if to == "" {
		_ = s.pool.QueryRow(ctx, `SELECT COALESCE(email, '') FROM "User" WHERE id = $1`, toUUID(userID)).Scan(&to)
	}
	if to == "" {
		return
	}
	_ = queue.PublishSecurityAlertEmail(s.asynq, queue.SecurityAlertEmailPayload{
		UserID:    userID,
		Email:     to,
		EventType: eventType,
		IPSubnet:  ipSubnet,
		UserAgent: ua,
		Occurred:  time.Now().UTC().Format(time.RFC3339),
	})
}

// ListSecurityEvents retourne les 50 derniers événements de sécurité de l'utilisateur.
func (s *Service) ListSecurityEvents(ctx context.Context, userID string) ([]SecurityEventDTO, error) {
	if s.pool == nil {
		return []SecurityEventDTO{}, nil
	}
	rows, err := db.New(s.pool).ListUserSecurityEvents(ctx, toUUID(userID))
	if err != nil {
		return nil, err
	}
	out := make([]SecurityEventDTO, 0, len(rows))
	for _, r := range rows {
		var meta map[string]any
		if len(r.Metadata) > 0 {
			_ = json.Unmarshal(r.Metadata, &meta)
		}
		createdAt := ""
		if r.CreatedAt.Valid {
			createdAt = r.CreatedAt.Time.UTC().Format(time.RFC3339)
		}
		out = append(out, SecurityEventDTO{
			ID:        r.ID,
			EventType: r.EventType,
			IPSubnet:  r.IpSubnet.String,
			UserAgent: r.UserAgent.String,
			Metadata:  meta,
			CreatedAt: createdAt,
		})
	}
	return out, nil
}

// CheckLoginEnvironment vérifie si le couple (sous-réseau IP, User-Agent) a déjà
// été observé pour ce compte sur les 30 derniers jours. Si non, enregistre un
// événement `login_new_device` et envoie une alerte email si le compte avait déjà
// un historique de connexion.
func (s *Service) CheckLoginEnvironment(ctx context.Context, userID, rawIP, userAgent string) (bool, error) {
	if s.pool == nil || userID == "" {
		return false, nil
	}
	subnet := maskIPSubnet(rawIP)
	ua := strings.TrimSpace(userAgent)
	if len(ua) > 220 {
		ua = ua[:220]
	}

	queries := db.New(s.pool)
	known, err := queries.HasRecentUserLoginEnv(ctx, db.HasRecentUserLoginEnvParams{
		UserId:    toUUID(userID),
		IpSubnet:  pgtype.Text{String: subnet, Valid: subnet != ""},
		UserAgent: pgtype.Text{String: ua, Valid: ua != ""},
	})
	if err != nil {
		return false, err
	}
	if known {
		return false, nil
	}

	var hadPriorLogin bool
	_ = s.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM "SecurityEvent"
			WHERE "userId" = $1 AND "eventType" = 'login_new_device'
		)
	`, toUUID(userID)).Scan(&hadPriorLogin)

	s.RecordSecurityEvent(ctx, userID, "", "login_new_device", subnet, ua, nil, hadPriorLogin)
	return true, nil
}

// maskIPSubnet réduit une adresse IP au /24 (IPv4) ou /48 (IPv6) pour éviter
// de stocker l'IP brute tout en détectant les changements d'environnement.
func maskIPSubnet(raw string) string {
	host := strings.TrimSpace(raw)
	if strings.Contains(host, ",") {
		host = strings.TrimSpace(strings.Split(host, ",")[0])
	}
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	ip := net.ParseIP(host)
	if ip == nil {
		return ""
	}
	if v4 := ip.To4(); v4 != nil {
		masked := v4.Mask(net.CIDRMask(24, 32))
		return masked.String() + "/24"
	}
	masked := ip.Mask(net.CIDRMask(48, 128))
	return masked.String() + "/48"
}
