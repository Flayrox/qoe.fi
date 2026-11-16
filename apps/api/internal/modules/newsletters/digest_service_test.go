package newsletters

// Parcours du digest SANS base : le querier est bouchonné, on n'exerce que la
// logique du module (bornes, sujet, aperçu, HTML, résolution de publication).
// Les requêtes SQL réelles restent couvertes par les tests Testcontainers de la
// CI — ce fichier comble le trou laissé par l'ajout du digest dans le gate de
// couverture.

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
)

// fakeQuerier ne branche que les méthodes des parcours testés ; les autres
// restent portées par l'interface nil (un appel paniquerait, ce qui signale un
// parcours inattendu plutôt que de le faire passer silencieusement).
type fakeQuerier struct {
	newsletterQuerier
	digestRows []db.ListArticlesForDigestRow
	digestArg  db.ListArticlesForDigestParams

	personalPub string
	owns        bool

	created db.CreateNewsletterIssueParams
}

func (f *fakeQuerier) GetUserPublisherID(_ context.Context, _ string) (string, error) {
	return f.personalPub, nil
}

func (f *fakeQuerier) UserOwnsPublisher(_ context.Context, _ db.UserOwnsPublisherParams) (bool, error) {
	return f.owns, nil
}

func (f *fakeQuerier) ListArticlesForDigest(_ context.Context, arg db.ListArticlesForDigestParams) ([]db.ListArticlesForDigestRow, error) {
	f.digestArg = arg
	return f.digestRows, nil
}

func (f *fakeQuerier) CreateNewsletterIssue(_ context.Context, arg db.CreateNewsletterIssueParams) (db.NewsletterIssue, error) {
	f.created = arg
	now := pgtype.Timestamp{Time: time.Now().UTC(), Valid: true}
	return db.NewsletterIssue{
		ID:          "issue_test",
		PublisherId: arg.PublisherId,
		Subject:     arg.Subject,
		PreviewText: arg.PreviewText,
		Html:        arg.Html,
		Status:      "DRAFT",
		CreatedAt:   now,
		UpdatedAt:   now,
	}, nil
}

func TestCreateDigestDraft_GenereBrouillonEditable(t *testing.T) {
	q := &fakeQuerier{
		owns: true,
		digestRows: []db.ListArticlesForDigestRow{
			digestRow("Premier", "<p>corps</p>"),
			digestRow("Deuxième", "<p>corps</p>"),
		},
	}
	svc := NewService(q, nil)

	issue, err := svc.CreateDigestDraft(context.Background(), "user_1", DigestInput{PublisherID: "pub_1"})
	if err != nil {
		t.Fatalf("CreateDigestDraft: %v", err)
	}

	// Bornes par défaut : 7 jours, 5 articles.
	if q.digestArg.Limit != 5 {
		t.Fatalf("limite = %d, attendu 5 (défaut)", q.digestArg.Limit)
	}
	if delta := time.Since(q.digestArg.CreatedAt.Time); delta < 6*24*time.Hour || delta > 8*24*time.Hour {
		t.Fatalf("fenêtre = %v, attendu ~7 jours", delta)
	}

	// Le brouillon est éditable et rattaché à la publication résolue.
	if issue.Status != "DRAFT" {
		t.Fatalf("statut = %q, attendu DRAFT", issue.Status)
	}
	if issue.PublisherID != "pub_1" || q.created.PublisherId != "pub_1" {
		t.Fatalf("publication = %q / %q", issue.PublisherID, q.created.PublisherId)
	}
	if !strings.HasPrefix(issue.Subject, "Digest — La Rédaction — ") {
		t.Fatalf("sujet = %q", issue.Subject)
	}
	if issue.PreviewText == nil || *issue.PreviewText != "2 articles récents de La Rédaction" {
		t.Fatalf("aperçu = %v", issue.PreviewText)
	}
	if !strings.Contains(issue.Html, "https://exemple.fr/tech/mon-article") {
		t.Fatalf("lien canonique absent du corps : %s", issue.Html)
	}
	if !strings.Contains(issue.Html, "Premier") || !strings.Contains(issue.Html, "Deuxième") {
		t.Fatalf("articles absents du corps : %s", issue.Html)
	}
}

func TestCreateDigestDraft_BorneLesParametres(t *testing.T) {
	q := &fakeQuerier{owns: true, digestRows: []db.ListArticlesForDigestRow{digestRow("Unique", "<p>x</p>")}}
	svc := NewService(q, nil)

	// Un article seul ne pluralise pas l'aperçu.
	issue, err := svc.CreateDigestDraft(context.Background(), "user_1", DigestInput{
		PublisherID: "pub_1",
		Days:        365,
		Limit:       999,
	})
	if err != nil {
		t.Fatalf("CreateDigestDraft: %v", err)
	}
	if q.digestArg.Limit != 20 {
		t.Fatalf("limite = %d, attendu 20 (plafond)", q.digestArg.Limit)
	}
	if delta := time.Since(q.digestArg.CreatedAt.Time); delta < 85*24*time.Hour || delta > 95*24*time.Hour {
		t.Fatalf("fenêtre = %v, attendu ~90 jours (plafond)", delta)
	}
	if issue.PreviewText == nil || *issue.PreviewText != "1 article récent de La Rédaction" {
		t.Fatalf("aperçu = %v", issue.PreviewText)
	}
}

func TestCreateDigestDraft_TronqueLeNomDePublication(t *testing.T) {
	long := strings.Repeat("é", 100)
	row := digestRow("Unique", "<p>x</p>")
	row.PublisherName = long
	q := &fakeQuerier{owns: true, digestRows: []db.ListArticlesForDigestRow{row}}
	svc := NewService(q, nil)

	issue, err := svc.CreateDigestDraft(context.Background(), "user_1", DigestInput{PublisherID: "pub_1"})
	if err != nil {
		t.Fatalf("CreateDigestDraft: %v", err)
	}
	// Le sujet est validé à 200 caractères : le nom est borné à 80 runes,
	// jamais coupé au milieu d'un caractère UTF-8.
	if got := strings.Count(issue.Subject, "é"); got != 80 {
		t.Fatalf("nom tronqué à %d runes, attendu 80 (sujet = %q)", got, issue.Subject)
	}
}

func TestCreateDigestDraft_AucunArticle(t *testing.T) {
	q := &fakeQuerier{owns: true}
	svc := NewService(q, nil)

	if _, err := svc.CreateDigestDraft(context.Background(), "user_1", DigestInput{PublisherID: "pub_1"}); err != errDigestEmpty {
		t.Fatalf("err = %v, attendu errDigestEmpty", err)
	}
}

func TestCreateDigestDraft_ResolutionDePublication(t *testing.T) {
	// Sans publisherId : la publication personnelle du créateur est utilisée.
	// `owns` reste vrai : CreateDraft revalide la publication résolue.
	q := &fakeQuerier{personalPub: "pub_perso", owns: true, digestRows: []db.ListArticlesForDigestRow{digestRow("Unique", "<p>x</p>")}}
	svc := NewService(q, nil)
	issue, err := svc.CreateDigestDraft(context.Background(), "user_1", DigestInput{})
	if err != nil {
		t.Fatalf("CreateDigestDraft: %v", err)
	}
	if issue.PublisherID != "pub_perso" {
		t.Fatalf("publication = %q, attendu pub_perso", issue.PublisherID)
	}

	// Publication explicitement demandée mais non gérée : refus.
	q = &fakeQuerier{owns: false}
	svc = NewService(q, nil)
	if _, err := svc.CreateDigestDraft(context.Background(), "user_1", DigestInput{PublisherID: "pub_autre"}); err != errForbidden {
		t.Fatalf("err = %v, attendu errForbidden", err)
	}
}
