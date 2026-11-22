package newsletters

// Tests du lot d'audit L29o : chaque cas reproduit un défaut constaté sur le
// code d'avant correction (worktree à HEAD) et doit y échouer.
//
// Les stubs n'embarquent que l'interface `newsletterQuerier` : les méthodes non
// surchargées ne sont jamais appelées, ce qui compile à l'identique sur HEAD et
// sur l'arbre corrigé.

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"testing"

	db "github.com/qoefi/api/internal/database"
)

// auditQuerier surcharge les deux lectures qui décident d'un statut HTTP.
type auditQuerier struct {
	newsletterQuerier
	getPublisherErr error
	getIssueErr     error
}

func (q auditQuerier) GetUserPublisherID(_ context.Context, _ string) (string, error) {
	if q.getPublisherErr != nil {
		return "", q.getPublisherErr
	}
	return "", nil
}

func (q auditQuerier) GetNewsletterIssue(_ context.Context, _ string) (db.NewsletterIssue, error) {
	return db.NewsletterIssue{}, q.getIssueErr
}

// F624 : une panne base sur la résolution de publication était rendue en 403
// (« vous ne gérez pas cette publication ») — le créateur croyait à un refus.
func TestAuditL29O_PublisherLookupErrorIsNotForbidden(t *testing.T) {
	boom := errors.New("base indisponible")
	svc := NewService(auditQuerier{getPublisherErr: boom}, nil)
	_, err := svc.ListIssues(context.Background(), ownerID, "")
	if !errors.Is(err, boom) {
		t.Fatalf("ListIssues sur panne = %v, attendu l'erreur de base (pas errForbidden)", err)
	}
}

// F625 : une panne base sur la lecture d'une issue était rendue en 404
// (« newsletter introuvable »).
func TestAuditL29O_IssueLookupErrorIsNotNotFound(t *testing.T) {
	boom := errors.New("base indisponible")
	svc := NewService(auditQuerier{getIssueErr: boom}, nil)
	err := svc.Send(context.Background(), ownerID, "issue-x")
	if !errors.Is(err, boom) {
		t.Fatalf("Send sur panne = %v, attendu l'erreur de base (pas errNotFound)", err)
	}
}

// F626 : une saisie refusée par l'anti-spam (sujet avec balise script) et un
// contenu vide sortaient en 500 avec « Internal Server Error ».
func TestAuditL29O_ContentRejectionIs400(t *testing.T) {
	ctx := context.Background()
	seedNewsletterEnv(t, ctx)
	r := newHTTPRouter(t, false)

	w := nlReq(r, http.MethodPost, "/v1/newsletters", ownerID,
		`{"publisherId":"`+pubID+`","subject":"<script>alert(1)</script>","html":"<p>x</p>"}`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("sujet XSS = %d (%s), attendu 400", w.Code, w.Body.String())
	}

	w = nlReq(r, http.MethodPost, "/v1/newsletters", ownerID,
		`{"publisherId":"`+pubID+`","subject":"Sujet","html":"   "}`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("contenu vide = %d (%s), attendu 400", w.Code, w.Body.String())
	}
}

// F627 : la liste des newsletters n'était pas bornée (chaque ligne porte le
// HTML complet) : 120 brouillons renvoyaient 120 lignes.
func TestAuditL29O_ListIsBounded(t *testing.T) {
	ctx := context.Background()
	seedNewsletterEnv(t, ctx)
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "NewsletterIssue" (id, "publisherId", subject, html, "updatedAt")
		SELECT 'audit_l29o_' || g, $1, 'Sujet ' || g, '<p>x</p>', now()
		FROM generate_series(1, 120) g`, pubID); err != nil {
		t.Fatalf("seed issues: %v", err)
	}

	items, err := newTestService().ListIssues(ctx, ownerID, pubID)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(items) > 100 {
		t.Fatalf("%d newsletters retournées, borne 100 non appliquée", len(items))
	}
}

// F628 : une adresse démesurée atteignait la base sur le désabonnement public.
func TestAuditL29O_UnsubscribeRejectsOversizedEmail(t *testing.T) {
	ctx := context.Background()
	seedNewsletterEnv(t, ctx)
	huge := strings.Repeat("a", 300) + "@test.dev"
	if err := newTestService().Unsubscribe(ctx, pubID, huge); err == nil {
		t.Fatal("adresse de 308 caractères acceptée")
	}
}
