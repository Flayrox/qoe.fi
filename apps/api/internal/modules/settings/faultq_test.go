package settings

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
)

var errBoom = errors.New("fault injecté")

// faultQ est un queryer qui délègue tout à *db.Queries SAUF les méthodes
// listées dans `fail`, pour lesquelles il retourne l'erreur configurée.
type faultQ struct {
	*db.Queries
	fail map[string]error
}

func (f *faultQ) val(name string) (error, bool) {
	e, ok := f.fail[name]
	return e, ok
}

func (f *faultQ) GetUserPersonalPublication(ctx context.Context, id string) (pgtype.Text, error) {
	if e, ok := f.val("GetUserPersonalPublication"); ok {
		return pgtype.Text{}, e
	}
	return f.Queries.GetUserPersonalPublication(ctx, id)
}
func (f *faultQ) GetMediaMemberContext(ctx context.Context, arg db.GetMediaMemberContextParams) (db.GetMediaMemberContextRow, error) {
	if e, ok := f.val("GetMediaMemberContext"); ok {
		return db.GetMediaMemberContextRow{}, e
	}
	return f.Queries.GetMediaMemberContext(ctx, arg)
}
func (f *faultQ) GetPublicationForSettings(ctx context.Context, id string) (db.GetPublicationForSettingsRow, error) {
	if e, ok := f.val("GetPublicationForSettings"); ok {
		return db.GetPublicationForSettingsRow{}, e
	}
	return f.Queries.GetPublicationForSettings(ctx, id)
}
func (f *faultQ) ListNavigationForPublication(ctx context.Context, publicationid string) ([]db.ListNavigationForPublicationRow, error) {
	if e, ok := f.val("ListNavigationForPublication"); ok {
		return nil, e
	}
	return f.Queries.ListNavigationForPublication(ctx, publicationid)
}
func (f *faultQ) ListSocialLinksForPublication(ctx context.Context, publicationid string) ([]db.ListSocialLinksForPublicationRow, error) {
	if e, ok := f.val("ListSocialLinksForPublication"); ok {
		return nil, e
	}
	return f.Queries.ListSocialLinksForPublication(ctx, publicationid)
}
func (f *faultQ) ListArticlesForSettings(ctx context.Context, publicationid string) ([]db.ListArticlesForSettingsRow, error) {
	if e, ok := f.val("ListArticlesForSettings"); ok {
		return nil, e
	}
	return f.Queries.ListArticlesForSettings(ctx, publicationid)
}
func (f *faultQ) ListCategoriesForPublication(ctx context.Context, publicationid string) ([]db.ListCategoriesForPublicationRow, error) {
	if e, ok := f.val("ListCategoriesForPublication"); ok {
		return nil, e
	}
	return f.Queries.ListCategoriesForPublication(ctx, publicationid)
}
func (f *faultQ) GetUserApiAccessStatus(ctx context.Context, id string) (string, error) {
	if e, ok := f.val("GetUserApiAccessStatus"); ok {
		return "", e
	}
	return f.Queries.GetUserApiAccessStatus(ctx, id)
}
func (f *faultQ) CheckSubdomainExists(ctx context.Context, subdomain pgtype.Text) (bool, error) {
	if e, ok := f.val("CheckSubdomainExists"); ok {
		return false, e
	}
	return f.Queries.CheckSubdomainExists(ctx, subdomain)
}
func (f *faultQ) UpdatePublicationSubdomain(ctx context.Context, arg db.UpdatePublicationSubdomainParams) error {
	if e, ok := f.val("UpdatePublicationSubdomain"); ok {
		return e
	}
	return f.Queries.UpdatePublicationSubdomain(ctx, arg)
}
func (f *faultQ) GetUserForSettings(ctx context.Context, id string) (db.GetUserForSettingsRow, error) {
	if e, ok := f.val("GetUserForSettings"); ok {
		return db.GetUserForSettingsRow{}, e
	}
	return f.Queries.GetUserForSettings(ctx, id)
}
func (f *faultQ) UpdateUserOnboardingText(ctx context.Context, arg db.UpdateUserOnboardingTextParams) error {
	if e, ok := f.val("UpdateUserOnboardingText"); ok {
		return e
	}
	return f.Queries.UpdateUserOnboardingText(ctx, arg)
}
func (f *faultQ) CreatePersonalPublication(ctx context.Context, arg db.CreatePersonalPublicationParams) (string, error) {
	if e, ok := f.val("CreatePersonalPublication"); ok {
		return "", e
	}
	return f.Queries.CreatePersonalPublication(ctx, arg)
}
func (f *faultQ) LinkUserPublication(ctx context.Context, arg db.LinkUserPublicationParams) error {
	if e, ok := f.val("LinkUserPublication"); ok {
		return e
	}
	return f.Queries.LinkUserPublication(ctx, arg)
}
func (f *faultQ) CompleteOnboardingUser(ctx context.Context, arg db.CompleteOnboardingUserParams) error {
	if e, ok := f.val("CompleteOnboardingUser"); ok {
		return e
	}
	return f.Queries.CompleteOnboardingUser(ctx, arg)
}
func (f *faultQ) UpdatePersonalPublication(ctx context.Context, arg db.UpdatePersonalPublicationParams) error {
	if e, ok := f.val("UpdatePersonalPublication"); ok {
		return e
	}
	return f.Queries.UpdatePersonalPublication(ctx, arg)
}
func (f *faultQ) InsertNavigationItem(ctx context.Context, arg db.InsertNavigationItemParams) error {
	if e, ok := f.val("InsertNavigationItem"); ok {
		return e
	}
	return f.Queries.InsertNavigationItem(ctx, arg)
}
func (f *faultQ) DeleteNavigationItems(ctx context.Context, publicationid string) error {
	if e, ok := f.val("DeleteNavigationItems"); ok {
		return e
	}
	return f.Queries.DeleteNavigationItems(ctx, publicationid)
}
func (f *faultQ) InsertSocialLink(ctx context.Context, arg db.InsertSocialLinkParams) error {
	if e, ok := f.val("InsertSocialLink"); ok {
		return e
	}
	return f.Queries.InsertSocialLink(ctx, arg)
}
func (f *faultQ) DeleteSocialLinks(ctx context.Context, publicationid string) error {
	if e, ok := f.val("DeleteSocialLinks"); ok {
		return e
	}
	return f.Queries.DeleteSocialLinks(ctx, publicationid)
}
func (f *faultQ) SetApiApplication(ctx context.Context, arg db.SetApiApplicationParams) error {
	if e, ok := f.val("SetApiApplication"); ok {
		return e
	}
	return f.Queries.SetApiApplication(ctx, arg)
}
func (f *faultQ) ListApiKeys(ctx context.Context, userid pgtype.UUID) ([]db.ListApiKeysRow, error) {
	if e, ok := f.val("ListApiKeys"); ok {
		return nil, e
	}
	return f.Queries.ListApiKeys(ctx, userid)
}
func (f *faultQ) DeleteApiKey(ctx context.Context, arg db.DeleteApiKeyParams) error {
	if e, ok := f.val("DeleteApiKey"); ok {
		return e
	}
	return f.Queries.DeleteApiKey(ctx, arg)
}

// faultPool force des erreurs sur Exec/QueryRow (branches « return err » des
// requêtes brutes hors sqlc).
type faultPool struct {
	*pgxpool.Pool
	failExec     bool
	failQueryRow bool
}

func (f *faultPool) Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	if f.failExec {
		return pgconn.CommandTag{}, errBoom
	}
	return f.Pool.Exec(ctx, sql, args...)
}

func (f *faultPool) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	if f.failQueryRow {
		return errorRow{err: errBoom}
	}
	return f.Pool.QueryRow(ctx, sql, args...)
}

type errorRow struct {
	err error
}

func (r errorRow) Scan(dest ...any) error { return r.err }

func newFaultService(qf map[string]error) (*Service, *faultQ, *faultPool) {
	fq := &faultQ{Queries: db.New(poolTest), fail: qf}
	fp := &faultPool{Pool: poolTest}
	return &Service{pool: fp, q: fq}, fq, fp
}

// ── Branches « return err » du service settings ─────────────────────────

func TestFault_GetPublicationSettings_QueryErrors(t *testing.T) {
	ctx := context.Background()
	cases := []string{
		"GetPublicationForSettings",
		"ListNavigationForPublication",
		"ListSocialLinksForPublication",
		"ListArticlesForSettings",
		"ListCategoriesForPublication",
	}
	for _, m := range cases {
		svc, _, _ := newFaultService(map[string]error{m: errBoom})
		if _, err := svc.GetPublicationSettings(ctx, "00000000-0000-0000-0000-000000000002", "pub_any"); err == nil {
			t.Errorf("%s: err = nil, attendu erreur", m)
		}
	}
}

func TestFault_UpdateProfile_Errors(t *testing.T) {
	ctx := context.Background()
	fx := seed(t)

	// authorizeSettings en échec → errForbidden (via GetUserPersonalPublication en erreur).
	svc, _, _ := newFaultService(map[string]error{"GetUserPersonalPublication": errBoom})
	if _, err := svc.UpdateProfile(ctx, fx.OwnerID, fx.PubID, map[string]any{"name": "X"}); !errors.Is(err, errForbidden) {
		t.Errorf("GetUserPersonalPublication: err = %v, attendu errForbidden", err)
	}

	// onboardingText non-string → erreur de validation.
	svc, _, _ = newFaultService(nil)
	if _, err := svc.UpdateProfile(ctx, fx.OwnerID, fx.PubID, map[string]any{"onboardingText": 42}); err == nil {
		t.Error("onboardingText non-string: err = nil")
	}

	// UpdateUserOnboardingText en erreur.
	svc, _, _ = newFaultService(map[string]error{"UpdateUserOnboardingText": errBoom})
	if _, err := svc.UpdateProfile(ctx, fx.OwnerID, fx.PubID, map[string]any{"onboardingText": "ok"}); err == nil {
		t.Error("UpdateUserOnboardingText: err = nil")
	}

	// updatePublication (pool) en erreur → remonté.
	svc, _, fp := newFaultService(nil)
	fp.failExec = true
	if _, err := svc.UpdateProfile(ctx, fx.OwnerID, fx.PubID, map[string]any{"name": "X"}); err == nil {
		t.Error("pool Exec: err = nil")
	}
}

func TestFault_GetUserSettings_PoolError(t *testing.T) {
	ctx := context.Background()
	svc, _, fp := newFaultService(nil)
	fp.failQueryRow = true
	if _, err := svc.GetUserSettings(ctx, "00000000-0000-0000-0000-000000000002"); err == nil {
		t.Error("pool QueryRow: err = nil")
	}
}

func TestFault_UpdateUserSettings_PoolError(t *testing.T) {
	ctx := context.Background()
	svc, _, fp := newFaultService(nil)
	fp.failExec = true
	if _, err := svc.UpdateUserSettings(ctx, "00000000-0000-0000-0000-000000000002",
		map[string]any{"fontScale": 110}); err == nil {
		t.Error("pool Exec: err = nil")
	}
}

func TestFault_CheckSubdomain_QueryError(t *testing.T) {
	ctx := context.Background()
	svc, _, _ := newFaultService(map[string]error{"CheckSubdomainExists": errBoom})
	// Le service renvoie (false, raison) — le check DB en erreur doit être
	// traité comme indisponible (pas de panic, false).
	available, reason := svc.CheckSubdomain(ctx, "test-sub")
	if available {
		t.Error("CheckSubdomain avec erreur DB = available=true")
	}
	if reason == "" {
		t.Error("CheckSubdomain avec erreur DB : raison vide")
	}
}

func TestFault_UpdateSubdomain_QueryError(t *testing.T) {
	ctx := context.Background()
	fx := seed(t)
	svc, _, _ := newFaultService(map[string]error{"UpdatePublicationSubdomain": errBoom})
	if err := svc.UpdateSubdomain(ctx, fx.OwnerID, fx.PubID, "nouveau-sous"); err == nil {
		t.Error("UpdatePublicationSubdomain: err = nil")
	}
}

func TestFault_SaveNavigation_QueryError(t *testing.T) {
	ctx := context.Background()
	fx := seed(t)
	for _, m := range []string{"DeleteNavigationItems", "InsertNavigationItem"} {
		svc, _, _ := newFaultService(map[string]error{m: errBoom})
		if err := svc.SaveNavigation(ctx, fx.OwnerID, fx.PubID, []NavigationLink{{
			Label: "L", URL: "/l",
		}}); err == nil {
			t.Errorf("%s: err = nil", m)
		}
	}
}

func TestFault_SaveSocial_QueryError(t *testing.T) {
	ctx := context.Background()
	fx := seed(t)
	for _, m := range []string{"DeleteSocialLinks", "InsertSocialLink"} {
		svc, _, _ := newFaultService(map[string]error{m: errBoom})
		if err := svc.SaveSocial(ctx, fx.OwnerID, fx.PubID, []SocialLink{{
			Platform: "x", URL: "https://x.com",
		}}); err == nil {
			t.Errorf("%s: err = nil", m)
		}
	}
}

func TestFault_CompleteOnboarding_QueryError(t *testing.T) {
	ctx := context.Background()
	for _, m := range []string{"GetUserApiAccessStatus", "CreatePersonalPublication", "LinkUserPublication", "CompleteOnboardingUser"} {
		svc, _, _ := newFaultService(map[string]error{m: errBoom})
		if err := svc.CompleteOnboarding(ctx, "00000000-0000-0000-0000-000000000002", OnboardingInput{Name: "Nom"}); err == nil {
			t.Errorf("%s: err = nil", m)
		}
	}
}

func TestFault_Deletion_PoolErrors(t *testing.T) {
	ctx := context.Background()
	userID := "00000000-0000-0000-0000-000000000002"

	svc, _, fp := newFaultService(nil)
	fp.failQueryRow = true
	if _, err := svc.GetDeletionRequest(ctx, userID); err == nil {
		t.Error("GetDeletionRequest: err = nil")
	}
	svc, _, fp = newFaultService(nil)
	fp.failQueryRow = true
	if _, err := svc.CreateDeletionRequest(ctx, userID, "raison"); err == nil {
		t.Error("CreateDeletionRequest: err = nil")
	}
	svc, _, fp = newFaultService(nil)
	fp.failExec = true
	if err := svc.CancelDeletionRequest(ctx, userID); err == nil {
		t.Error("CancelDeletionRequest: err = nil")
	}
}
