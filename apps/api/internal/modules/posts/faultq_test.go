package posts

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"

	db "github.com/qoefi/api/internal/database"
)

var errBoom = errors.New("fault injecté")

// faultQ est un queryer qui délègue tout à *db.Queries SAUF les méthodes
// listées dans `fail`, pour lesquelles il retourne l'erreur configurée. Il
// permet d'atteindre les branches « return err » des services autrement
// inaccessibles (erreurs DB internes).
type faultQ struct {
	*db.Queries
	fail map[string]error
}

func (f *faultQ) val(name string) (error, bool) {
	e, ok := f.fail[name]
	return e, ok
}

// WithTx propage les fautes dans la branche transactionnelle : chaque méthode
// appelée sur le queryer issu de WithTx vérifie aussi la map de fautes.
func (f *faultQ) WithTx(tx pgx.Tx) ServiceQuerier {
	return &faultQ{Queries: db.New(tx), fail: f.fail}
}

func (f *faultQ) GetExistingLike(ctx context.Context, p db.GetExistingLikeParams) (int32, error) {
	if e, ok := f.val("GetExistingLike"); ok {
		return 0, e
	}
	return f.Queries.GetExistingLike(ctx, p)
}
func (f *faultQ) GetExistingBookmark(ctx context.Context, p db.GetExistingBookmarkParams) (int32, error) {
	if e, ok := f.val("GetExistingBookmark"); ok {
		return 0, e
	}
	return f.Queries.GetExistingBookmark(ctx, p)
}
func (f *faultQ) GetExistingBlock(ctx context.Context, p db.GetExistingBlockParams) (int32, error) {
	if e, ok := f.val("GetExistingBlock"); ok {
		return 0, e
	}
	return f.Queries.GetExistingBlock(ctx, p)
}
func (f *faultQ) GetExistingMute(ctx context.Context, p db.GetExistingMuteParams) (int32, error) {
	if e, ok := f.val("GetExistingMute"); ok {
		return 0, e
	}
	return f.Queries.GetExistingMute(ctx, p)
}
func (f *faultQ) GetCanonicalThoughtID(ctx context.Context, id string) (string, error) {
	if e, ok := f.val("GetCanonicalThoughtID"); ok {
		return "", e
	}
	return f.Queries.GetCanonicalThoughtID(ctx, id)
}
func (f *faultQ) CreateThought(ctx context.Context, p db.CreateThoughtParams) (db.CreateThoughtRow, error) {
	if e, ok := f.val("CreateThought"); ok {
		return db.CreateThoughtRow{}, e
	}
	return f.Queries.CreateThought(ctx, p)
}
func (f *faultQ) GetPostsByIDs(ctx context.Context, p db.GetPostsByIDsParams) ([]db.GetPostsByIDsRow, error) {
	if e, ok := f.val("GetPostsByIDs"); ok {
		return nil, e
	}
	return f.Queries.GetPostsByIDs(ctx, p)
}
func (f *faultQ) SoftDeletePost(ctx context.Context, p db.SoftDeletePostParams) (string, error) {
	if e, ok := f.val("SoftDeletePost"); ok {
		return "", e
	}
	return f.Queries.SoftDeletePost(ctx, p)
}
func (f *faultQ) CreateModerationReport(ctx context.Context, p db.CreateModerationReportParams) (string, error) {
	if e, ok := f.val("CreateModerationReport"); ok {
		return "", e
	}
	return f.Queries.CreateModerationReport(ctx, p)
}
func (f *faultQ) GetPollByThoughtID(ctx context.Context, thoughtid string) (db.GetPollByThoughtIDRow, error) {
	if e, ok := f.val("GetPollByThoughtID"); ok {
		return db.GetPollByThoughtIDRow{}, e
	}
	return f.Queries.GetPollByThoughtID(ctx, thoughtid)
}
func (f *faultQ) GetThoughtReplyGate(ctx context.Context, id string) (db.GetThoughtReplyGateRow, error) {
	if e, ok := f.val("GetThoughtReplyGate"); ok {
		return db.GetThoughtReplyGateRow{}, e
	}
	return f.Queries.GetThoughtReplyGate(ctx, id)
}
func (f *faultQ) GetThoughtByID(ctx context.Context, id string) (db.GetThoughtByIDRow, error) {
	if e, ok := f.val("GetThoughtByID"); ok {
		return db.GetThoughtByIDRow{}, e
	}
	return f.Queries.GetThoughtByID(ctx, id)
}

// faultService construit un service dont le queryer injecte `fail`.
func faultService(t *testing.T, fail map[string]error) *Service {
	t.Helper()
	fx := seedPosts(t)
	_ = fx
	return &Service{
		pool: poolTest,
		q:    &faultQ{Queries: db.New(poolTest), fail: fail},
	}
}

func TestFault_ServiceErrorBranches(t *testing.T) {
	ctx := context.Background()
	uid := "00000000-0000-0000-0000-000000000002"
	vid := "00000000-0000-0000-0000-000000000003"
	pid := "post_test_001"

	cases := []struct {
		name string
		svc  *Service
		run  func(*Service) error
	}{
		{"ToggleLike GetExistingLike", faultService(t, map[string]error{"GetExistingLike": errBoom}), func(s *Service) error { _, err := s.ToggleLike(ctx, pid, vid); return err }},
		{"ToggleBookmark GetExistingBookmark", faultService(t, map[string]error{"GetExistingBookmark": errBoom}), func(s *Service) error { _, err := s.ToggleBookmark(ctx, pid, vid); return err }},
		{"ToggleBlock GetExistingBlock", faultService(t, map[string]error{"GetExistingBlock": errBoom}), func(s *Service) error { _, err := s.ToggleBlock(ctx, vid, uid); return err }},
		{"ToggleMute GetExistingMute", faultService(t, map[string]error{"GetExistingMute": errBoom}), func(s *Service) error { _, err := s.ToggleMute(ctx, vid, uid); return err }},
		{"ToggleRepost GetCanonicalThoughtID", faultService(t, map[string]error{"GetCanonicalThoughtID": errBoom}), func(s *Service) error { _, err := s.ToggleRepost(ctx, pid, vid); return err }},
		{"Create CreateThought", faultService(t, map[string]error{"CreateThought": errBoom}), func(s *Service) error { _, err := s.Create(ctx, uid, "x", nil, nil, nil); return err }},
		{"Get GetPostsByIDs", faultService(t, map[string]error{"GetPostsByIDs": errBoom}), func(s *Service) error { _, err := s.Get(ctx, pid, vid); return err }},
		{"Delete SoftDeletePost", faultService(t, map[string]error{"SoftDeletePost": errBoom}), func(s *Service) error { return s.Delete(ctx, pid, uid) }},
		{"Report CreateModerationReport", faultService(t, map[string]error{"CreateModerationReport": errBoom}), func(s *Service) error { return s.Report(ctx, uid, pid, "post", "spam", "") }},
		{"VotePoll GetPollByThoughtID", faultService(t, map[string]error{"GetPollByThoughtID": errBoom}), func(s *Service) error { _, err := s.VotePoll(ctx, pid, "op", vid); return err }},
		{"UnvotePoll GetPollByThoughtID", faultService(t, map[string]error{"GetPollByThoughtID": errBoom}), func(s *Service) error { _, err := s.UnvotePoll(ctx, pid, vid); return err }},
		{"CanReply GetThoughtReplyGate", faultService(t, map[string]error{"GetThoughtReplyGate": errBoom}), func(s *Service) error { _, err := s.CanReply(ctx, pid, vid); return err }},
		{"TogglePin GetThoughtByID", faultService(t, map[string]error{"GetThoughtByID": errBoom}), func(s *Service) error { _, err := s.TogglePin(ctx, pid, uid); return err }},
	}
	for _, c := range cases {
		if err := c.run(c.svc); err == nil {
			t.Errorf("%s : l'erreur injectée doit remonter", c.name)
		}
	}
}