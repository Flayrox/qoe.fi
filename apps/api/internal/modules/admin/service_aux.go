// Service des pages auxiliaires de la console admin : widgets/tendances,
// feature flags & config, OAuth, demandes d'accès API, livraisons de
// notifications, traductions. Toutes les méthodes sont réservées au
// superadmin (garde dans checkSuperadmin).

package admin

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/qoefi/api/internal/apiaccess"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/flags"
)

// ── Widgets & Tendances ──────────────────────────────────────────────────────

type AdminArticle struct {
	ID           string  `json:"id"`
	Title        string  `json:"title"`
	Slug         string  `json:"slug"`
	Published    bool    `json:"published"`
	IsEditorPick bool    `json:"isEditorPick"`
	CreatedAt    string  `json:"createdAt"`
	AuthorName   *string `json:"authorName"`
	AuthorEmail  string  `json:"authorEmail"`
}

type AdminTrend struct {
	ID        string `json:"id"`
	Hashtag   string `json:"hashtag"`
	Count     int32  `json:"count"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

type AdminPromo struct {
	ID          string  `json:"id"`
	Title       string  `json:"title"`
	Description string  `json:"description"`
	CtaText     *string `json:"ctaText"`
	CtaUrl      *string `json:"ctaUrl"`
	ImageUrl    *string `json:"imageUrl"`
	IsActive    bool    `json:"isActive"`
	CreatedAt   string  `json:"createdAt"`
	UpdatedAt   string  `json:"updatedAt"`
}

type WidgetsData struct {
	Articles []AdminArticle `json:"articles"`
	Trends   []AdminTrend   `json:"trends"`
	Promos   []AdminPromo   `json:"promos"`
}

func (s *Service) GetWidgets(ctx context.Context, userID string) (*WidgetsData, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return nil, err
	}
	articles, err := s.q.ListAdminArticles(ctx)
	if err != nil {
		return nil, err
	}
	trends, err := s.q.ListAdminTrends(ctx)
	if err != nil {
		return nil, err
	}
	promos, err := s.q.ListAdminPromos(ctx)
	if err != nil {
		return nil, err
	}

	res := &WidgetsData{
		Articles: make([]AdminArticle, 0, len(articles)),
		Trends:   make([]AdminTrend, 0, len(trends)),
		Promos:   make([]AdminPromo, 0, len(promos)),
	}
	for _, a := range articles {
		res.Articles = append(res.Articles, AdminArticle{
			ID: a.ID, Title: a.Title, Slug: a.Slug, Published: a.Published,
			IsEditorPick: a.IsEditorPick, CreatedAt: a.CreatedAt.Time.Format(time.RFC3339),
			AuthorName: textPtr(a.AuthorName), AuthorEmail: a.AuthorEmail,
		})
	}
	for _, t := range trends {
		res.Trends = append(res.Trends, AdminTrend{
			ID: t.ID, Hashtag: t.Hashtag, Count: t.Count,
			CreatedAt: t.CreatedAt.Time.Format(time.RFC3339),
			UpdatedAt: t.UpdatedAt.Time.Format(time.RFC3339),
		})
	}
	for _, p := range promos {
		res.Promos = append(res.Promos, AdminPromo{
			ID: p.ID, Title: p.Title, Description: p.Description,
			CtaText: textPtr(p.CtaText), CtaUrl: textPtr(p.CtaUrl), ImageUrl: textPtr(p.ImageUrl),
			IsActive: p.IsActive, CreatedAt: p.CreatedAt.Time.Format(time.RFC3339),
			UpdatedAt: p.UpdatedAt.Time.Format(time.RFC3339),
		})
	}
	return res, nil
}

// SetArticleFeatured bascule l'article à la une (un seul à la fois, parité
// toggleFeaturedArticle Prisma).
func (s *Service) SetArticleFeatured(ctx context.Context, userID, articleID string, featured bool) error {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return err
	}
	if featured {
		if err := s.q.ClearArticleEditorPicks(ctx); err != nil {
			return err
		}
	}
	_, err := s.q.SetArticleEditorPick(ctx, db.SetArticleEditorPickParams{
		ID: articleID, IsEditorPick: featured,
	})
	return err
}

func (s *Service) UpsertTrend(ctx context.Context, userID, hashtag string, count int32) (*AdminTrend, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return nil, err
	}
	res, err := s.q.UpsertTrend(ctx, db.UpsertTrendParams{Hashtag: hashtag, Count: count})
	if err != nil {
		return nil, err
	}
	return &AdminTrend{ID: res.ID, Hashtag: res.Hashtag, Count: res.Count}, nil
}

func (s *Service) DeleteTrend(ctx context.Context, userID, id string) error {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return err
	}
	return s.q.DeleteTrend(ctx, id)
}

func (s *Service) UpdateTrendCount(ctx context.Context, userID, id string, count int32) error {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return err
	}
	_, err := s.q.UpdateTrendCount(ctx, db.UpdateTrendCountParams{ID: id, Count: count})
	return err
}

type PromoInput struct {
	ID          *string `json:"id"`
	Title       string  `json:"title"`
	Description string  `json:"description"`
	CtaText     *string `json:"ctaText"`
	CtaUrl      *string `json:"ctaUrl"`
	IsActive    *bool   `json:"isActive"`
}

func (s *Service) SavePromo(ctx context.Context, userID string, in PromoInput) (*AdminPromo, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return nil, err
	}
	id := ""
	if in.ID != nil {
		id = *in.ID
	}
	isActive := true
	if in.IsActive != nil {
		isActive = *in.IsActive
	}
	res, err := s.q.UpsertPromo(ctx, db.UpsertPromoParams{
		Column1: id, Title: in.Title, Description: in.Description,
		CtaText: optText(in.CtaText), CtaUrl: optText(in.CtaUrl), IsActive: isActive,
	})
	if err != nil {
		return nil, err
	}
	return &AdminPromo{
		ID: res.ID, Title: res.Title, Description: res.Description,
		CtaText: textPtr(res.CtaText), CtaUrl: textPtr(res.CtaUrl), ImageUrl: textPtr(res.ImageUrl),
		IsActive: res.IsActive,
	}, nil
}

func (s *Service) DeletePromo(ctx context.Context, userID, id string) error {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return err
	}
	return s.q.DeletePromo(ctx, id)
}

func (s *Service) TogglePromoActive(ctx context.Context, userID, id string, isActive bool) error {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return err
	}
	_, err := s.q.UpdatePromoActive(ctx, db.UpdatePromoActiveParams{ID: id, IsActive: isActive})
	return err
}

// ── Feature Flags / Config / Frontend / Translations ─────────────────────────

type SystemConfigItem struct {
	Key         string  `json:"key"`
	Value       string  `json:"value"`
	Description *string `json:"description"`
	UpdatedAt   string  `json:"updatedAt"`
}

func (s *Service) ListSystemConfigs(ctx context.Context, userID string) ([]SystemConfigItem, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return nil, err
	}
	rows, err := s.q.ListSystemConfigs(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]SystemConfigItem, 0, len(rows))
	for _, r := range rows {
		out = append(out, SystemConfigItem{
			Key: r.Key, Value: r.Value, Description: textPtr(r.Description),
			UpdatedAt: r.UpdatedAt.Time.Format(time.RFC3339),
		})
	}
	return out, nil
}

// GetSystemConfigsByKeys renvoie les configs ciblées (page frontend/translations).
func (s *Service) GetSystemConfigsByKeys(ctx context.Context, userID string, keys []string) ([]SystemConfigItem, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return nil, err
	}
	rows, err := s.q.GetSystemConfigsByKeys(ctx, keys)
	if err != nil {
		return nil, err
	}
	out := make([]SystemConfigItem, 0, len(rows))
	for _, r := range rows {
		out = append(out, SystemConfigItem{
			Key: r.Key, Value: r.Value, Description: textPtr(r.Description),
			UpdatedAt: r.UpdatedAt.Time.Format(time.RFC3339),
		})
	}
	return out, nil
}

// UpsertSystemConfigs enregistre une ou plusieurs configs (upsert, description
// conservée si non fournie — parité saveFrontendConfig / setSystemConfigAction).
func (s *Service) UpsertSystemConfigs(ctx context.Context, userID string, items []SystemConfigItem) error {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return err
	}
	for _, item := range items {
		var desc pgtype.Text
		if item.Description != nil {
			desc = pgtype.Text{String: *item.Description, Valid: true}
		}
		if _, err := s.q.UpsertSystemConfig(ctx, db.UpsertSystemConfigParams{
			Key: item.Key, Value: item.Value, Description: desc,
		}); err != nil {
			return err
		}
		// Bascule du contrôle d'accès global (coupure API / endpoints désactivés) :
		// tracée au journal d'audit — qui, quand, quoi.
		switch item.Key {
		case "API_ACCESS_DISABLED", "API_DISABLED_ENDPOINTS":
			s.logAudit(ctx, userID, "access.control.config", "platform", "", map[string]any{
				"key": item.Key, "value": item.Value,
			})
		}
	}
	return nil
}

// UpdateReservedIdentifiers validates and stores the admin-controlled denylist
// for usernames or subdomains. The API still applies hard-coded route guards.
func (s *Service) UpdateReservedIdentifiers(ctx context.Context, userID, kind string, values []string) error {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return err
	}
	key := "RESERVED_" + strings.ToUpper(kind) + "S"
	if kind != "username" && kind != "subdomain" {
		return errors.New("type d'identifiant invalide")
	}
	clean := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.ToLower(strings.TrimSpace(value))
		if value != "" {
			clean = append(clean, value)
		}
	}
	_, err := s.q.UpsertSystemConfig(ctx, db.UpsertSystemConfigParams{
		Key: key, Value: strings.Join(clean, "\\n"),
		Description: pgtype.Text{String: "Noms réservés " + kind, Valid: true},
	})
	return err
}

func (s *Service) DeleteSystemConfig(ctx context.Context, userID, key string) error {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return err
	}
	return s.q.DeleteSystemConfig(ctx, key)
}

// ── OAuth ────────────────────────────────────────────────────────────────────

type AdminOAuthClient struct {
	ID            string   `json:"id"`
	ClientId      string   `json:"clientId"`
	Name          string   `json:"name"`
	Description   *string  `json:"description"`
	LogoUrl       *string  `json:"logoUrl"`
	HomepageUrl   *string  `json:"homepageUrl"`
	RedirectUris  []string `json:"redirectUris"`
	Scopes        []string `json:"scopes"`
	ClientType    string   `json:"clientType"`
	Status        string   `json:"status"`
	CreatedAt     string   `json:"createdAt"`
	OwnerName     *string  `json:"ownerName"`
	OwnerEmail    string   `json:"ownerEmail"`
	OwnerUsername *string  `json:"ownerUsername"`
}

func (s *Service) ListOAuthClients(ctx context.Context, userID string) ([]AdminOAuthClient, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return nil, err
	}
	rows, err := s.q.ListAdminOAuthClients(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]AdminOAuthClient, 0, len(rows))
	for _, r := range rows {
		out = append(out, AdminOAuthClient{
			ID: r.ID, ClientId: r.ClientId, Name: r.Name,
			Description: textPtr(r.Description), LogoUrl: textPtr(r.LogoUrl),
			HomepageUrl: textPtr(r.HomepageUrl), RedirectUris: r.RedirectUris, Scopes: r.Scopes,
			ClientType: string(r.ClientType), Status: string(r.Status),
			CreatedAt: r.CreatedAt.Time.Format(time.RFC3339),
			OwnerName: textPtr(r.OwnerName), OwnerEmail: r.OwnerEmail,
			OwnerUsername: textPtr(r.OwnerUsername),
		})
	}
	return out, nil
}

func (s *Service) UpdateOAuthClientStatus(ctx context.Context, userID, clientID, status string) error {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return err
	}
	_, err := s.q.UpdateAdminOAuthClientStatus(ctx, db.UpdateAdminOAuthClientStatusParams{
		ID: clientID, Status: db.OAuthClientStatus(status),
	})
	return err
}

// ── Demandes d'accès API ─────────────────────────────────────────────────────

type AdminApiApplicant struct {
	ID                   string   `json:"id"`
	Name                 *string  `json:"name"`
	Email                string   `json:"email"`
	Subdomain            *string  `json:"subdomain"`
	ApiAccessStatus      string   `json:"apiAccessStatus"`
	ApiGrants            []string `json:"apiGrants"`
	ApiApplicationReason *string  `json:"apiApplicationReason"`
	CreatedAt            string   `json:"createdAt"`
	UpdatedAt            string   `json:"updatedAt"`
}

func (s *Service) ListApiApplicants(ctx context.Context, userID string) ([]AdminApiApplicant, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return nil, err
	}
	rows, err := s.q.ListAdminApiApplicants(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]AdminApiApplicant, 0, len(rows))
	for _, r := range rows {
		out = append(out, AdminApiApplicant{
			ID: r.ID, Name: textPtr(r.Name), Email: r.Email,
			Subdomain:            textPtr(r.PublicationSubdomain),
			ApiAccessStatus:      r.ApiAccessStatus,
			ApiGrants:            r.ApiGrants,
			ApiApplicationReason: textPtr(r.ApiApplicationReason),
			CreatedAt:            r.CreatedAt.Time.Format(time.RFC3339),
			UpdatedAt:            r.UpdatedAt.Time.Format(time.RFC3339),
		})
	}
	return out, nil
}

// logAudit écrit une entrée du journal d'audit superadmin (best-effort, jamais
// bloquant) quand le flag admin-audit-log est actif. Actions sensibles :
// changements de permissions API, bascules du contrôle d'accès, modération.
func (s *Service) logAudit(ctx context.Context, actorID, action, targetType, targetID string, metadata any) {
	if s.flags == nil || !s.flags.IsOn(ctx, flags.AdminAuditLog) {
		return
	}
	var actorUUID pgtype.UUID
	if err := actorUUID.Scan(actorID); err != nil {
		return
	}
	raw, err := json.Marshal(metadata)
	if err != nil {
		return
	}
	if err := s.q.InsertAdminAuditLog(ctx, db.InsertAdminAuditLogParams{
		ActorId: actorUUID, Action: action, TargetType: targetType,
		TargetId: optText(&targetID), Column5: string(raw),
	}); err != nil {
		log.Printf("[admin-audit] %s: %v", action, err)
	}
}

// ── Journal d'audit superadmin ───────────────────────────────────────────────

type AdminAuditEntry struct {
	ID         string          `json:"id"`
	ActorID    string          `json:"actorId"`
	ActorName  *string         `json:"actorName"`
	ActorEmail string          `json:"actorEmail"`
	Action     string          `json:"action"`
	TargetType string          `json:"targetType"`
	TargetID   *string         `json:"targetId"`
	Metadata   json.RawMessage `json:"metadata"`
	CreatedAt  string          `json:"createdAt"`
}

// ListAuditLogs retourne les N dernières entrées du journal (superadmin).
func (s *Service) ListAuditLogs(ctx context.Context, userID string, limit int32) ([]AdminAuditEntry, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return nil, err
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := s.q.ListAdminAuditLogs(ctx, limit)
	if err != nil {
		return nil, err
	}
	out := make([]AdminAuditEntry, 0, len(rows))
	for _, r := range rows {
		out = append(out, AdminAuditEntry{
			ID:         r.ID,
			ActorID:    r.ActorId.String(),
			ActorName:  textPtr(r.ActorName),
			ActorEmail: r.ActorEmail,
			Action:     r.Action,
			TargetType: r.TargetType,
			TargetID:   textPtr(r.TargetId),
			Metadata:   r.Metadata,
			CreatedAt:  r.CreatedAt.Time.Format(time.RFC3339),
		})
	}
	return out, nil
}

// UpdateApiAccessStatus approuve / rejette / révoque une demande d'accès API.
// L'approbation est modulable : l'admin choisit les permissions accordées
// (grants). Grants vides à l'approbation → tous les modules actifs de la
// plateforme (rétro-compatibilité avec l'approbation « pleins pouvoirs »).
// Tout statut non approuvé révoque l'ensemble des permissions.
func (s *Service) UpdateApiAccessStatus(ctx context.Context, userID, targetID, status string, grants []string) error {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return err
	}
	if status == "approved" {
		if len(grants) == 0 {
			enabled, err := apiaccess.LoadEnabled(ctx, s.pool)
			if err != nil {
				return err
			}
			grants = enabled
		}
		if err := apiaccess.ValidateGrants(grants); err != nil {
			return err
		}
		for _, g := range grants {
			if !apiaccess.IsEnabled(ctx, s.pool, g) {
				return fmt.Errorf("le module %s est désactivé à l'échelle de la plateforme", g)
			}
		}
		grants = apiaccess.NormalizeGrants(grants)
	} else {
		// Rejet / révocation / reset : plus aucune permission (slice vide,
		// jamais NULL — la colonne est NOT NULL DEFAULT '{}').
		grants = []string{}
	}
	if _, err := s.q.UpdateAdminUserApiAccess(ctx, db.UpdateAdminUserApiAccessParams{
		ID: targetID, ApiAccessStatus: status, ApiGrants: grants,
	}); err != nil {
		return err
	}
	s.logAudit(ctx, userID, "api.access.status", "user", targetID, map[string]any{
		"status": status, "grants": grants,
	})
	return nil
}

// UpdateApiGrants ajuste les permissions d'un créateur sans toucher au statut
// global (l'admin se réserve le droit de retirer ou ajouter une capacité à
// tout moment — ex. couper OAuth en gardant l'API REST).
func (s *Service) UpdateApiGrants(ctx context.Context, userID, targetID string, grants []string) error {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return err
	}
	if err := apiaccess.ValidateGrants(grants); err != nil {
		return err
	}
	for _, g := range grants {
		if !apiaccess.IsEnabled(ctx, s.pool, g) {
			return fmt.Errorf("le module %s est désactivé à l'échelle de la plateforme", g)
		}
	}
	grants = apiaccess.NormalizeGrants(grants)
	if err := s.q.SetUserApiGrants(ctx, db.SetUserApiGrantsParams{
		ID: targetID, ApiGrants: grants,
	}); err != nil {
		return err
	}
	s.logAudit(ctx, userID, "api.access.grants", "user", targetID, map[string]any{
		"grants": grants,
	})
	return nil
}

// AdminApiModule est un module du registre avec son état plateforme.
type AdminApiModule struct {
	apiaccess.Module
	Enabled bool `json:"enabled"`
}

// GetApiAccessModules liste le registre des permissions modulables avec leur
// état actif/désactivé à l'échelle de la plateforme.
func (s *Service) GetApiAccessModules(ctx context.Context, userID string) ([]AdminApiModule, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return nil, err
	}
	enabled, err := apiaccess.LoadEnabled(ctx, s.pool)
	if err != nil {
		return nil, err
	}
	out := make([]AdminApiModule, 0, len(apiaccess.Registry))
	for _, m := range apiaccess.Registry {
		out = append(out, AdminApiModule{Module: m, Enabled: apiaccess.HasGrant(enabled, m.Key)})
	}
	return out, nil
}

// UpdateApiAccessModules active/désactive les modules accordables à l'échelle
// de la plateforme (clé SystemConfig API_ACCESS_MODULES).
func (s *Service) UpdateApiAccessModules(ctx context.Context, userID string, enabled []string) error {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return err
	}
	if err := apiaccess.ValidateGrants(enabled); err != nil {
		return err
	}
	enabled = apiaccess.NormalizeGrants(enabled)
	raw, err := json.Marshal(enabled)
	if err != nil {
		return err
	}
	_, err = s.q.UpsertSystemConfig(ctx, db.UpsertSystemConfigParams{
		Key:         apiaccess.ConfigKey,
		Value:       string(raw),
		Description: pgtype.Text{String: "Modules d'accès API accordables par les admins (JSON array).", Valid: true},
	})
	if err != nil {
		return err
	}
	s.logAudit(ctx, userID, "api.access.modules", "platform", "", map[string]any{
		"enabled": enabled,
	})
	return nil
}

// ── Notifications & livraisons ───────────────────────────────────────────────

type AdminDelivery struct {
	ID           string  `json:"id"`
	Recipient    string  `json:"recipient"`
	Status       string  `json:"status"`
	Channel      string  `json:"channel"`
	Attempts     int32   `json:"attempts"`
	Provider     *string `json:"provider"`
	LastError    *string `json:"lastError"`
	CreatedAt    string  `json:"createdAt"`
	Notification struct {
		Type         string  `json:"type"`
		ArticleTitle *string `json:"articleTitle"`
	} `json:"notification"`
}

type DeliveryCounts struct {
	Counts map[string]int64 `json:"counts"`
	Total  int64            `json:"total"`
}

func (s *Service) GetDeliveryCounts(ctx context.Context, userID string) (*DeliveryCounts, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return nil, err
	}
	rows, err := s.q.CountNotificationDeliveriesByStatus(ctx)
	if err != nil {
		return nil, err
	}
	counts := map[string]int64{}
	for _, r := range rows {
		counts[r.Status] = r.Total
	}
	total, err := s.q.CountAllNotificationDeliveries(ctx)
	if err != nil {
		return nil, err
	}
	return &DeliveryCounts{Counts: counts, Total: total}, nil
}

func (s *Service) ListDeliveries(ctx context.Context, userID string) ([]AdminDelivery, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return nil, err
	}
	rows, err := s.q.ListNotificationDeliveries(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]AdminDelivery, 0, len(rows))
	for _, r := range rows {
		d := AdminDelivery{
			ID: r.ID, Recipient: r.Recipient, Status: r.Status, Channel: r.Channel,
			Attempts: r.Attempts, Provider: textPtr(r.Provider), LastError: textPtr(r.LastError),
			CreatedAt: r.CreatedAt.Time.Format(time.RFC3339),
		}
		d.Notification.Type = r.NotificationType
		d.Notification.ArticleTitle = textPtr(r.ArticleTitle)
		out = append(out, d)
	}
	return out, nil
}

func (s *Service) RetryDelivery(ctx context.Context, userID, deliveryID string) error {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return err
	}
	return s.q.RetryNotificationDelivery(ctx, deliveryID)
}

// ── Helpers ──────────────────────────────────────────────────────────────────

func optText(p *string) pgtype.Text {
	if p == nil {
		return pgtype.Text{}
	}
	return pgtype.Text{String: *p, Valid: true}
}
