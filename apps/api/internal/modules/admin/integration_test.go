package admin

// Tests d'intégration de la console admin (GET /v1/admin/dashboard, users,
// users/{id}, PATCH users/{id}) : superadmin → données ; non-superadmin →
// refus ; modération → mise à jour persistée.
// Pages auxiliaires : widgets (articles/tendances/promos), config, OAuth,
// demandes d'accès API, livraisons de notifications.

import (
	"context"
	"log"
	"os"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/testutil"
)

var poolTest *pgxpool.Pool

func TestMain(m *testing.M) {
	p, err := testutil.Pool(context.Background())
	if err != nil {
		log.Fatalf("testcontainers: %v", err)
	}
	poolTest = p
	code := m.Run()
	testutil.Cleanup()
	os.Exit(code)
}

const (
	adminAdminID  = "00000000-0000-0000-0000-0000000000a1"
	adminCreator  = "00000000-0000-0000-0000-0000000000a2"
	adminReaderID = "00000000-0000-0000-0000-0000000000a3"
)

// seedAdmin crée : admin (superadmin), creator (rôle creator) avec
// publication + article + subscriber + wallet transaction, reader (user).
func seedAdmin(t *testing.T, ctx context.Context) {
	t.Helper()
	if _, err := poolTest.Exec(ctx, `TRUNCATE TABLE
		"WalletTransaction", "NotificationDelivery", "Notification", "OAuthClient", "SystemConfig",
		"PartnerPromo", "Trend", "Subscriber", "Like", "Post", "Article", "Category", "Publication", "User"
		CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}

	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Publication" (id, type, name, slug, subdomain, "isCertified", "createdAt", "updatedAt")
		 VALUES ('pub_adm_001', 'PERSONAL', 'Journal Admin', 'journal-admin', 'journal-admin', false, now(), now())`); err != nil {
		t.Fatalf("publication: %v", err)
	}
	users := []struct{ id, email, username, name, role, pubID, createdAt string }{
		{adminAdminID, "admin-adm@test.dev", "adminadm", "Admin", "superadmin", "", "2026-01-01 11:00:00"},
		{adminCreator, "creator-adm@test.dev", "creatoradm", "Creator", "creator", "pub_adm_001", "2026-01-02 11:00:00"},
		{adminReaderID, "reader-adm@test.dev", "readeradm", "Reader", "user", "", "2026-01-03 11:00:00"},
	}
	for _, u := range users {
		if u.pubID == "" {
			if _, err := poolTest.Exec(ctx,
				`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
				 VALUES ($1, $2, $3, $4, $5, $6::timestamp, $6::timestamp)`,
				u.id, u.email, u.username, u.name, u.role, u.createdAt); err != nil {
				t.Fatalf("user %s: %v", u.username, err)
			}
			continue
		}
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "User" (id, email, username, name, role, "publicationId", "apiAccessStatus", "createdAt", "updatedAt")
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamp, $8::timestamp)`,
			u.id, u.email, u.username, u.name, u.role, u.pubID, "pending", u.createdAt); err != nil {
			t.Fatalf("user %s: %v", u.username, err)
		}
	}

	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Article" (id, title, slug, content, published, "isPremium", visibility,
		                        "readingTime", status, "publicationId", "authorId", "createdAt", "updatedAt")
		 VALUES ('art_adm_01', 'Article Admin', 'article-admin', '<p>x</p>', true, true, 'PUBLIC', 4, 'PUBLISHED',
		         'pub_adm_001', $1, now(), now())`, adminCreator); err != nil {
		t.Fatalf("article: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Subscriber" (id, email, "publicationId", "isActive", "isPremium", "receiveArticles", "createdAt", "updatedAt")
		 VALUES (gen_random_uuid()::text, 'sub-adm@test.dev', 'pub_adm_001', true, true, true, now(), now())`); err != nil {
		t.Fatalf("subscriber: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "WalletTransaction" (id, "userId", "amountCents", type, "createdAt")
		 VALUES ('wt_adm_01', $1, 200, 'SUBSCRIPTION_PAYMENT', now())`, adminCreator); err != nil {
		t.Fatalf("wallet transaction: %v", err)
	}
}

func newTestService() *Service {
	return NewService(poolTest)
}

func TestDashboard_Superadmin(t *testing.T) {
	ctx := context.Background()
	seedAdmin(t, ctx)
	svc := newTestService()

	data, err := svc.GetDashboard(ctx, adminAdminID)
	if err != nil {
		t.Fatalf("GetDashboard: %v", err)
	}
	if data.Users != 3 || data.Creators != 1 || data.Articles != 1 || data.PremiumSubscribers != 1 {
		t.Fatalf("counts = %+v, attendu users 3 / creators 1 / articles 1 / premium 1", data)
	}
}

func TestListUsers_Superadmin(t *testing.T) {
	ctx := context.Background()
	seedAdmin(t, ctx)
	svc := newTestService()

	users, err := svc.ListUsers(ctx, adminAdminID)
	if err != nil {
		t.Fatalf("ListUsers: %v", err)
	}
	if len(users) != 3 {
		t.Fatalf("users = %d, attendu 3", len(users))
	}
	creator := users[1]
	if creator.Email != "creator-adm@test.dev" || creator.Role != "creator" ||
		creator.Subdomain == nil || *creator.Subdomain != "journal-admin" {
		t.Fatalf("creator = %+v", creator)
	}
	if users[0].IsCertified || users[0].IsShadowbanned || users[0].IsSuspended {
		t.Fatalf("flags par défaut modifiées: %+v", users[0])
	}
	if users[0].CreatedAt == "" {
		t.Fatalf("createdAt vide")
	}
}

func TestGetUser_Superadmin(t *testing.T) {
	ctx := context.Background()
	seedAdmin(t, ctx)
	svc := newTestService()

	detail, err := svc.GetUser(ctx, adminAdminID, adminCreator)
	if err != nil {
		t.Fatalf("GetUser: %v", err)
	}
	if detail.Email != "creator-adm@test.dev" || detail.Subdomain == nil || *detail.Subdomain != "journal-admin" {
		t.Fatalf("detail = %+v", detail)
	}
	if detail.ArticlesCount != 1 || detail.SubscribersCount != 1 || detail.WalletTransactions != 1 {
		t.Fatalf("counts = %+v", detail)
	}
	if detail.RevenueCents != 200 {
		t.Fatalf("revenue = %d, attendu 200", detail.RevenueCents)
	}
}

func TestUpdateModeration(t *testing.T) {
	ctx := context.Background()
	seedAdmin(t, ctx)
	svc := newTestService()

	// Certification + publication associée.
	_, err := svc.UpdateModeration(ctx, adminAdminID, adminCreator, ModerationInput{
		IsCertified:          boolPtr(true),
		PublicationCertified: boolPtr(true),
	})
	if err != nil {
		t.Fatalf("UpdateModeration certify: %v", err)
	}

	var pubCert bool
	if err := poolTest.QueryRow(ctx, `SELECT "isCertified" FROM "Publication" WHERE id = 'pub_adm_001'`).Scan(&pubCert); err != nil {
		t.Fatalf("publication: %v", err)
	}
	if !pubCert {
		t.Fatalf("publication non certifiée")
	}

	// Suspension avec raison.
	reason := "spam"
	_, err = svc.UpdateModeration(ctx, adminAdminID, adminCreator, ModerationInput{
		IsSuspended:   boolPtr(true),
		SuspendReason: &reason,
	})
	if err != nil {
		t.Fatalf("UpdateModeration suspend: %v", err)
	}

	var isSuspended bool
	var suspendReason pgtype.Text
	if err := poolTest.QueryRow(ctx, `SELECT "isSuspended", "suspendReason" FROM "User" WHERE id = $1`, adminCreator).
		Scan(&isSuspended, &suspendReason); err != nil {
		t.Fatalf("read user: %v", err)
	}
	if !isSuspended || !suspendReason.Valid || suspendReason.String != "spam" {
		t.Fatalf("user = suspended %v reason %v", isSuspended, suspendReason)
	}

	// Réactivation (suspendReason effacé).
	_, err = svc.UpdateModeration(ctx, adminAdminID, adminCreator, ModerationInput{IsSuspended: boolPtr(false)})
	if err != nil {
		t.Fatalf("UpdateModeration unsuspend: %v", err)
	}
	var cleared pgtype.Text
	if err := poolTest.QueryRow(ctx, `SELECT "isSuspended", "suspendReason" FROM "User" WHERE id = $1`, adminCreator).
		Scan(&isSuspended, &cleared); err != nil {
		t.Fatalf("read user: %v", err)
	}
	if isSuspended || cleared.Valid {
		t.Fatalf("user après réactivation = suspended %v reason %v", isSuspended, cleared)
	}
}

func TestAdmin_Forbidden(t *testing.T) {
	ctx := context.Background()
	seedAdmin(t, ctx)
	svc := newTestService()

	// Creator → refus sur toutes les opérations.
	if _, err := svc.GetDashboard(ctx, adminCreator); err != errForbidden {
		t.Fatalf("GetDashboard(creator) = %v, attendu errForbidden", err)
	}
	if _, err := svc.ListUsers(ctx, adminCreator); err != errForbidden {
		t.Fatalf("ListUsers(creator) = %v, attendu errForbidden", err)
	}
	if _, err := svc.GetUser(ctx, adminCreator, adminReaderID); err != errForbidden {
		t.Fatalf("GetUser(creator) = %v, attendu errForbidden", err)
	}
	if _, err := svc.UpdateModeration(ctx, adminCreator, adminReaderID, ModerationInput{}); err != errForbidden {
		t.Fatalf("UpdateModeration(creator) = %v, attendu errForbidden", err)
	}
	// Pages auxiliaires → refus aussi.
	if _, err := svc.GetWidgets(ctx, adminCreator); err != errForbidden {
		t.Fatalf("GetWidgets(creator) = %v, attendu errForbidden", err)
	}
	if _, err := svc.ListSystemConfigs(ctx, adminCreator); err != errForbidden {
		t.Fatalf("ListSystemConfigs(creator) = %v, attendu errForbidden", err)
	}
	if _, err := svc.ListOAuthClients(ctx, adminCreator); err != errForbidden {
		t.Fatalf("ListOAuthClients(creator) = %v, attendu errForbidden", err)
	}
	if _, err := svc.ListApiApplicants(ctx, adminCreator); err != errForbidden {
		t.Fatalf("ListApiApplicants(creator) = %v, attendu errForbidden", err)
	}
	if _, err := svc.GetDeliveryCounts(ctx, adminCreator); err != errForbidden {
		t.Fatalf("GetDeliveryCounts(creator) = %v, attendu errForbidden", err)
	}
	// User inexistant → refus (pas de fuite d'existence).
	if _, err := svc.GetDashboard(ctx, "00000000-0000-0000-0000-0000000000ff"); err != errForbidden {
		t.Fatalf("GetDashboard(inconnu) = %v, attendu errForbidden", err)
	}
	// Cible inexistante → pgx.ErrNoRows.
	if _, err := svc.GetUser(ctx, adminAdminID, "00000000-0000-0000-0000-0000000000ff"); err != pgx.ErrNoRows {
		t.Fatalf("GetUser(inconnu) = %v, attendu pgx.ErrNoRows", err)
	}
}

// ── Pages auxiliaires ────────────────────────────────────────────────────────

func TestWidgets(t *testing.T) {
	ctx := context.Background()
	seedAdmin(t, ctx)
	svc := newTestService()

	// Article à la une (le seul) → isEditorPick.
	if err := svc.SetArticleFeatured(ctx, adminAdminID, "art_adm_01", true); err != nil {
		t.Fatalf("SetArticleFeatured: %v", err)
	}

	// Tendance upsert (2x → pas de doublon grâce à la contrainte hashtag).
	trend, err := svc.UpsertTrend(ctx, adminAdminID, "#test", 100)
	if err != nil {
		t.Fatalf("UpsertTrend: %v", err)
	}
	if trend.Hashtag != "#test" || trend.Count != 100 {
		t.Fatalf("trend = %+v", trend)
	}
	trend, err = svc.UpsertTrend(ctx, adminAdminID, "#test", 200)
	if err != nil {
		t.Fatalf("UpsertTrend 2: %v", err)
	}
	if trend.Count != 200 {
		t.Fatalf("trend après upsert = %+v", trend)
	}

	// Promo create + toggle + read.
	promo, err := svc.SavePromo(ctx, adminAdminID, PromoInput{
		Title: "qoe.premium", Description: "Soutenez", CtaText: stringPtr("Découvrir"), IsActive: boolPtr(true),
	})
	if err != nil {
		t.Fatalf("SavePromo: %v", err)
	}
	if promo.ID == "" || promo.Title != "qoe.premium" {
		t.Fatalf("promo = %+v", promo)
	}
	if err := svc.TogglePromoActive(ctx, adminAdminID, promo.ID, false); err != nil {
		t.Fatalf("TogglePromoActive: %v", err)
	}

	data, err := svc.GetWidgets(ctx, adminAdminID)
	if err != nil {
		t.Fatalf("GetWidgets: %v", err)
	}
	if len(data.Articles) != 1 || !data.Articles[0].IsEditorPick {
		t.Fatalf("articles = %+v", data.Articles)
	}
	if len(data.Trends) != 1 || data.Trends[0].Count != 200 {
		t.Fatalf("trends = %+v", data.Trends)
	}
	if len(data.Promos) != 1 || data.Promos[0].IsActive {
		t.Fatalf("promos = %+v", data.Promos)
	}

	// Delete trend + promo.
	if err := svc.DeleteTrend(ctx, adminAdminID, trend.ID); err != nil {
		t.Fatalf("DeleteTrend: %v", err)
	}
	if err := svc.DeletePromo(ctx, adminAdminID, promo.ID); err != nil {
		t.Fatalf("DeletePromo: %v", err)
	}
	data, err = svc.GetWidgets(ctx, adminAdminID)
	if err != nil {
		t.Fatalf("GetWidgets 2: %v", err)
	}
	if len(data.Trends) != 0 || len(data.Promos) != 0 {
		t.Fatalf("après suppression: trends %d promos %d", len(data.Trends), len(data.Promos))
	}
}

func TestSystemConfig(t *testing.T) {
	ctx := context.Background()
	seedAdmin(t, ctx)
	svc := newTestService()

	err := svc.UpsertSystemConfigs(ctx, adminAdminID, []SystemConfigItem{
		{Key: "ALLOW_NEW_REGISTRATIONS", Value: "true", Description: stringPtr("Flag")},
		{Key: "hero_title_fr", Value: "Bonjour"},
	})
	if err != nil {
		t.Fatalf("UpsertSystemConfigs: %v", err)
	}

	// Upsert conserve la description existante si non fournie (parité frontend).
	err = svc.UpsertSystemConfigs(ctx, adminAdminID, []SystemConfigItem{
		{Key: "ALLOW_NEW_REGISTRATIONS", Value: "false"},
	})
	if err != nil {
		t.Fatalf("Upsert 2: %v", err)
	}

	configs, err := svc.ListSystemConfigs(ctx, adminAdminID)
	if err != nil {
		t.Fatalf("ListSystemConfigs: %v", err)
	}
	if len(configs) != 2 {
		t.Fatalf("configs = %d, attendu 2", len(configs))
	}
	for _, c := range configs {
		if c.Key == "ALLOW_NEW_REGISTRATIONS" {
			if c.Value != "false" {
				t.Fatalf("value = %s, attendu false", c.Value)
			}
			if c.Description == nil || *c.Description != "Flag" {
				t.Fatalf("description perdue: %+v", c.Description)
			}
		}
	}

	// GetSystemConfigsByKeys (page frontend).
	byKeys, err := svc.GetSystemConfigsByKeys(ctx, adminAdminID, []string{"hero_title_fr", "INEXISTANT"})
	if err != nil {
		t.Fatalf("GetSystemConfigsByKeys: %v", err)
	}
	if len(byKeys) != 1 || byKeys[0].Key != "hero_title_fr" {
		t.Fatalf("byKeys = %+v", byKeys)
	}

	// Delete.
	if err := svc.DeleteSystemConfig(ctx, adminAdminID, "hero_title_fr"); err != nil {
		t.Fatalf("DeleteSystemConfig: %v", err)
	}
	configs, _ = svc.ListSystemConfigs(ctx, adminAdminID)
	if len(configs) != 1 {
		t.Fatalf("configs après delete = %d, attendu 1", len(configs))
	}
}

func TestOAuthClients(t *testing.T) {
	ctx := context.Background()
	seedAdmin(t, ctx)
	svc := newTestService()

	// Client OAuth PENDING appartenant au creator.
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "OAuthClient" (id, "clientId", name, description, "redirectUris", scopes, "clientType", status, "ownerUserId", "createdAt", "updatedAt")
		 VALUES ('oauth_adm_01', 'client_test', 'Test App', 'desc', ARRAY['https://app.test/cb'], ARRAY['openid','profile'], 'CONFIDENTIAL', 'PENDING', $1, now(), now())`,
		adminCreator); err != nil {
		t.Fatalf("oauth client: %v", err)
	}

	clients, err := svc.ListOAuthClients(ctx, adminAdminID)
	if err != nil {
		t.Fatalf("ListOAuthClients: %v", err)
	}
	if len(clients) != 1 || clients[0].Name != "Test App" || clients[0].Status != "PENDING" {
		t.Fatalf("clients = %+v", clients)
	}
	if clients[0].OwnerEmail != "creator-adm@test.dev" || len(clients[0].RedirectUris) != 1 || len(clients[0].Scopes) != 2 {
		t.Fatalf("client détail = %+v", clients[0])
	}

	if err := svc.UpdateOAuthClientStatus(ctx, adminAdminID, "oauth_adm_01", "APPROVED"); err != nil {
		t.Fatalf("UpdateOAuthClientStatus: %v", err)
	}
	var status string
	if err := poolTest.QueryRow(ctx, `SELECT status FROM "OAuthClient" WHERE id = 'oauth_adm_01'`).Scan(&status); err != nil {
		t.Fatalf("read status: %v", err)
	}
	if status != "APPROVED" {
		t.Fatalf("status = %s, attendu APPROVED", status)
	}
}

func TestApiApplicants(t *testing.T) {
	ctx := context.Background()
	seedAdmin(t, ctx)
	svc := newTestService()

	applicants, err := svc.ListApiApplicants(ctx, adminAdminID)
	if err != nil {
		t.Fatalf("ListApiApplicants: %v", err)
	}
	// seedAdmin met le creator en "pending" ; admin (superadmin) est aussi
	// éligible mais reste "none" par défaut → 1 candidat.
	if len(applicants) != 1 || applicants[0].Email != "creator-adm@test.dev" ||
		applicants[0].ApiAccessStatus != "pending" {
		t.Fatalf("applicants = %+v", applicants)
	}

	if err := svc.UpdateApiAccessStatus(ctx, adminAdminID, adminCreator, "approved"); err != nil {
		t.Fatalf("UpdateApiAccessStatus: %v", err)
	}
	var status string
	if err := poolTest.QueryRow(ctx, `SELECT "apiAccessStatus" FROM "User" WHERE id = $1`, adminCreator).Scan(&status); err != nil {
		t.Fatalf("read status: %v", err)
	}
	if status != "approved" {
		t.Fatalf("status = %s, attendu approved", status)
	}
}

func TestDeliveries(t *testing.T) {
	ctx := context.Background()
	seedAdmin(t, ctx)
	svc := newTestService()

	// Notification + livraison FAILED.
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Notification" (id, "recipientId", "senderId", type, "articleId", "createdAt")
		 VALUES ('notif_adm_01', $1, $2, 'ARTICLE_CONTRIBUTOR_INVITED', 'art_adm_01', now())`,
		adminReaderID, adminCreator); err != nil {
		t.Fatalf("notification: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "NotificationDelivery" (id, "notificationId", channel, status, recipient, provider, attempts, "lastError", "createdAt", "updatedAt", "dedupeKey")
		 VALUES ('del_adm_01', 'notif_adm_01', 'EMAIL', 'FAILED', 'reader@test.dev', 'resend', 3, 'smtp 550', now(), now(), 'dedupe-1')`); err != nil {
		t.Fatalf("delivery: %v", err)
	}

	counts, err := svc.GetDeliveryCounts(ctx, adminAdminID)
	if err != nil {
		t.Fatalf("GetDeliveryCounts: %v", err)
	}
	if counts.Counts["FAILED"] != 1 || counts.Total != 1 {
		t.Fatalf("counts = %+v", counts)
	}

	rows, err := svc.ListDeliveries(ctx, adminAdminID)
	if err != nil {
		t.Fatalf("ListDeliveries: %v", err)
	}
	if len(rows) != 1 || rows[0].Recipient != "reader@test.dev" || rows[0].Status != "FAILED" ||
		rows[0].Notification.Type != "ARTICLE_CONTRIBUTOR_INVITED" ||
		rows[0].Notification.ArticleTitle == nil || *rows[0].Notification.ArticleTitle != "Article Admin" {
		t.Fatalf("rows = %+v", rows)
	}

	if err := svc.RetryDelivery(ctx, adminAdminID, "del_adm_01"); err != nil {
		t.Fatalf("RetryDelivery: %v", err)
	}
	var status, lastError *string
	if err := poolTest.QueryRow(ctx, `SELECT status, "lastError" FROM "NotificationDelivery" WHERE id = 'del_adm_01'`).
		Scan(&status, &lastError); err != nil {
		t.Fatalf("read delivery: %v", err)
	}
	if status == nil || *status != "QUEUED" || lastError != nil {
		t.Fatalf("delivery après retry = status %v error %v", status, lastError)
	}
}

func boolPtr(b bool) *bool {
	return &b
}

func stringPtr(s string) *string {
	return &s
}
