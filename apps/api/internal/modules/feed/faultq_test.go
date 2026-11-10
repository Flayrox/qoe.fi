package feed

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
)

var errFeedBoom = errors.New("fault injecté feed")

// faultQ délègue à *db.Queries sauf les méthodes listées dans `fail` qui
// retournent l'erreur configurée — pour atteindre les branches « return err ».
type faultQ struct {
	*db.Queries
	fail map[string]error
}

func (f *faultQ) val(name string) (error, bool) {
	e, ok := f.fail[name]
	return e, ok
}

func (f *faultQ) GetFollowedPersonalPublisherOwnerIDs(ctx context.Context, r pgtype.UUID) ([]string, error) {
	if e, ok := f.val("GetFollowedPersonalPublisherOwnerIDs"); ok {
		return nil, e
	}
	return f.Queries.GetFollowedPersonalPublisherOwnerIDs(ctx, r)
}
func (f *faultQ) FindTrending(ctx context.Context, p db.FindTrendingParams) ([]db.FindTrendingRow, error) {
	if e, ok := f.val("FindTrending"); ok {
		return nil, e
	}
	return f.Queries.FindTrending(ctx, p)
}
func (f *faultQ) GetPublisherBySlugOrSubdomain(ctx context.Context, lower string) (db.GetPublisherBySlugOrSubdomainRow, error) {
	if e, ok := f.val("GetPublisherBySlugOrSubdomain"); ok {
		return db.GetPublisherBySlugOrSubdomainRow{}, e
	}
	return f.Queries.GetPublisherBySlugOrSubdomain(ctx, lower)
}
func (f *faultQ) FindPostsByAuthor(ctx context.Context, p db.FindPostsByAuthorParams) ([]db.FindPostsByAuthorRow, error) {
	if e, ok := f.val("FindPostsByAuthor"); ok {
		return nil, e
	}
	return f.Queries.FindPostsByAuthor(ctx, p)
}
func (f *faultQ) GetPublisherOwner(ctx context.Context, id string) (string, error) {
	if e, ok := f.val("GetPublisherOwner"); ok {
		return "", e
	}
	return f.Queries.GetPublisherOwner(ctx, id)
}
func (f *faultQ) GetPostsByIDs(ctx context.Context, p db.GetPostsByIDsParams) ([]db.GetPostsByIDsRow, error) {
	if e, ok := f.val("GetPostsByIDs"); ok {
		return nil, e
	}
	return f.Queries.GetPostsByIDs(ctx, p)
}
func (f *faultQ) ListPublishedArticlesByPublisher(ctx context.Context, p db.ListPublishedArticlesByPublisherParams) ([]db.ListPublishedArticlesByPublisherRow, error) {
	if e, ok := f.val("ListPublishedArticlesByPublisher"); ok {
		return nil, e
	}
	return f.Queries.ListPublishedArticlesByPublisher(ctx, p)
}
func (f *faultQ) ListRecentPublishedArticles(ctx context.Context, p db.ListRecentPublishedArticlesParams) ([]db.ListRecentPublishedArticlesRow, error) {
	if e, ok := f.val("ListRecentPublishedArticles"); ok {
		return nil, e
	}
	return f.Queries.ListRecentPublishedArticles(ctx, p)
}

func faultFeedService(t *testing.T, fail map[string]error) *Service {
	t.Helper()
	return &Service{pool: poolTest, q: &faultQ{Queries: db.New(poolTest), fail: fail}}
}

func TestFault_FeedReturnsErrors(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	uid := "00000000-0000-0000-0000-000000000010"
	alice := "00000000-0000-0000-0000-000000000011"
	// Donne un slug résolvable ('eng-pub' → Alice) pour que UserPosts aille
	// jusqu'à FindPostsByAuthor.
	if _, err := seedEngine(ctx, poolTest); err != nil {
		t.Fatalf("seed engine: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`UPDATE "User" SET "publisherId"='pub_engine' WHERE id=$1::uuid`, alice); err != nil {
		t.Fatalf("link alice: %v", err)
	}

	cases := []struct {
		name string
		svc  *Service
		run  func(*Service) error
	}{
		{"FollowingFeed ownerIDs", faultFeedService(t, map[string]error{"GetFollowedPersonalPublisherOwnerIDs": errFeedBoom}), func(s *Service) error { _, err := s.FollowingFeed(ctx, uid, 10, 0); return err }},
		{"Trending FindTrending", faultFeedService(t, map[string]error{"FindTrending": errFeedBoom}), func(s *Service) error { _, err := s.Trending(ctx, uid, 10, 0); return err }},
		{"UserPosts GetPublisherBySlugOrSubdomain", faultFeedService(t, map[string]error{"GetPublisherBySlugOrSubdomain": errFeedBoom}), func(s *Service) error { _, err := s.UserPosts(ctx, "eng-pub", uid, 10, 0); return err }},
		{"UserPosts FindPostsByAuthor", faultFeedService(t, map[string]error{"FindPostsByAuthor": errFeedBoom}), func(s *Service) error { _, err := s.UserPosts(ctx, "eng-pub", uid, 10, 0); return err }},
		{"Thread GetPostsByIDs", faultFeedService(t, map[string]error{"GetPostsByIDs": errFeedBoom}), func(s *Service) error { _, err := s.Thread(ctx, "post_x", uid); return err }},
		{"Articles ListRecentPublishedArticles", faultFeedService(t, map[string]error{"ListRecentPublishedArticles": errFeedBoom}), func(s *Service) error { _, err := s.RecentArticles(ctx, 10, 0); return err }},
	}
	for _, c := range cases {
		if err := c.run(c.svc); err == nil {
			t.Errorf("%s : l'erreur injectée doit remonter", c.name)
		}
	}
}
