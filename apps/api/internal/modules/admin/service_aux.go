// Service des pages auxiliaires de la console admin : widgets/tendances,
// feature flags & config, OAuth, demandes d'accès API, livraisons de
// notifications, traductions. Toutes les méthodes sont réservées au
// superadmin (garde dans checkSuperadmin).

package admin

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
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
	}
	return nil
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
	ID                  string  `json:"id"`
	Name                *string `json:"name"`
	Email               string  `json:"email"`
	Subdomain           *string `json:"subdomain"`
	ApiAccessStatus     string  `json:"apiAccessStatus"`
	ApiApplicationReason *string `json:"apiApplicationReason"`
	CreatedAt           string  `json:"createdAt"`
	UpdatedAt           string  `json:"updatedAt"`
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
			Subdomain: textPtr(r.PublicationSubdomain),
			ApiAccessStatus: r.ApiAccessStatus,
			ApiApplicationReason: textPtr(r.ApiApplicationReason),
			CreatedAt: r.CreatedAt.Time.Format(time.RFC3339),
			UpdatedAt: r.UpdatedAt.Time.Format(time.RFC3339),
		})
	}
	return out, nil
}

func (s *Service) UpdateApiAccessStatus(ctx context.Context, userID, targetID, status string) error {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return err
	}
	_, err := s.q.UpdateAdminUserApiAccess(ctx, db.UpdateAdminUserApiAccessParams{
		ID: targetID, ApiAccessStatus: status,
	})
	return err
}

// ── Notifications & livraisons ───────────────────────────────────────────────

type AdminDelivery struct {
	ID          string  `json:"id"`
	Recipient   string  `json:"recipient"`
	Status      string  `json:"status"`
	Channel     string  `json:"channel"`
	Attempts    int32   `json:"attempts"`
	Provider    *string `json:"provider"`
	LastError   *string `json:"lastError"`
	CreatedAt   string  `json:"createdAt"`
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
