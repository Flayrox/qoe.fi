package admin

import (
	"context"

	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
)

// adminQuerier : surface sqlc utilisée par le Service admin (mockable en
// test — *db.Queries l'implémente en prod).
type adminQuerier interface {
	AdminDashboardCounts(ctx context.Context) (db.AdminDashboardCountsRow, error)
	GetAdminUser(ctx context.Context, id string) (db.GetAdminUserRow, error)
	GetAdminUserRevenue(ctx context.Context, userid pgtype.UUID) (int64, error)
	GetAdminUserRole(ctx context.Context, id string) (string, error)
	ListAdminUsers(ctx context.Context) ([]db.ListAdminUsersRow, error)
	UpdateAdminUserModeration(ctx context.Context, arg db.UpdateAdminUserModerationParams) (db.UpdateAdminUserModerationRow, error)
	UpdatePublicationCertified(ctx context.Context, arg db.UpdatePublicationCertifiedParams) (db.UpdatePublicationCertifiedRow, error)
	ClearArticleEditorPicks(ctx context.Context) error
	CountModerationReportsByStatus(ctx context.Context) ([]db.CountModerationReportsByStatusRow, error)
	GetArticleAuthor(ctx context.Context, id string) (string, error)
	GetModerationReport(ctx context.Context, id string) (db.ModerationReport, error)
	GetPostAuthor(ctx context.Context, id string) (string, error)
	HideArticleByModerator(ctx context.Context, id string) error
	HidePostByModerator(ctx context.Context, id string) error
	ListModerationReportsWithCount(ctx context.Context, arg db.ListModerationReportsWithCountParams) ([]db.ListModerationReportsWithCountRow, error)
	UnhideArticleByModerator(ctx context.Context, id string) error
	UnhidePostByModerator(ctx context.Context, id string) error
	UpdateModerationReportResolution(ctx context.Context, arg db.UpdateModerationReportResolutionParams) (db.UpdateModerationReportResolutionRow, error)
	CountAllNotificationDeliveries(ctx context.Context) (int64, error)
	CountNotificationDeliveriesByStatus(ctx context.Context) ([]db.CountNotificationDeliveriesByStatusRow, error)
	DeletePromo(ctx context.Context, id string) error
	DeleteSystemConfig(ctx context.Context, key string) error
	DeleteTrend(ctx context.Context, id string) error
	GetSystemConfigsByKeys(ctx context.Context, dollar_1 []string) ([]db.SystemConfig, error)
	ListAdminApiApplicants(ctx context.Context) ([]db.ListAdminApiApplicantsRow, error)
	ListAdminArticles(ctx context.Context) ([]db.ListAdminArticlesRow, error)
	ListAdminOAuthClients(ctx context.Context) ([]db.ListAdminOAuthClientsRow, error)
	ListAdminPromos(ctx context.Context) ([]db.PartnerPromo, error)
	ListAdminTrends(ctx context.Context) ([]db.Trend, error)
	ListNotificationDeliveries(ctx context.Context) ([]db.ListNotificationDeliveriesRow, error)
	ListSystemConfigs(ctx context.Context) ([]db.SystemConfig, error)
	RetryNotificationDelivery(ctx context.Context, id string) error
	SetArticleEditorPick(ctx context.Context, arg db.SetArticleEditorPickParams) (db.SetArticleEditorPickRow, error)
	UpdateAdminOAuthClientStatus(ctx context.Context, arg db.UpdateAdminOAuthClientStatusParams) (db.UpdateAdminOAuthClientStatusRow, error)
	UpdateAdminUserApiAccess(ctx context.Context, arg db.UpdateAdminUserApiAccessParams) (db.UpdateAdminUserApiAccessRow, error)
	UpdatePromoActive(ctx context.Context, arg db.UpdatePromoActiveParams) (db.UpdatePromoActiveRow, error)
	UpdateTrendCount(ctx context.Context, arg db.UpdateTrendCountParams) (db.UpdateTrendCountRow, error)
	UpsertPromo(ctx context.Context, arg db.UpsertPromoParams) (db.UpsertPromoRow, error)
	UpsertSystemConfig(ctx context.Context, arg db.UpsertSystemConfigParams) (db.SystemConfig, error)
	UpsertTrend(ctx context.Context, arg db.UpsertTrendParams) (db.UpsertTrendRow, error)
}

// compile-time check : *db.Queries satisfait adminQuerier.
var _ adminQuerier = (*db.Queries)(nil)
