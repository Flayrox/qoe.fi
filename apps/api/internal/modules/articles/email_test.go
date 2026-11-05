package articles

import (
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
)

func TestSignAndVerifyUnsubscribe(t *testing.T) {
	pubID := "pub_test_123"
	email := "user@example.com"

	sig := SignUnsubscribe(pubID, email)
	if sig == "" {
		t.Fatal("signature vide")
	}

	if !VerifyUnsubscribe(pubID, email, sig) {
		t.Fatal("la signature valide doit être vérifiée")
	}

	// Insensible à la casse de l'email
	if !VerifyUnsubscribe(pubID, "USER@example.COM", sig) {
		t.Fatal("la vérification d'email doit être insensible à la casse")
	}

	// Falsification rejetée
	if VerifyUnsubscribe(pubID, "hacker@example.com", sig) {
		t.Fatal("la vérification doit échouer sur un autre email")
	}
	if VerifyUnsubscribe("other_pub", email, sig) {
		t.Fatal("la vérification doit échouer sur une autre publication")
	}
}

func TestBuildArticleReleaseEmail_Free(t *testing.T) {
	info := db.GetArticleReleaseInfoRow{
		ID:              "art_free_1",
		Title:           "Mon Super Article",
		Slug:            "mon-super-article",
		IsPremium:       false,
		Content:         "<p>Bonjour tout le monde ! Ceci est un article libre.</p>",
		PublicationId:   "pub_test",
		PublicationName: "Chronique Tech",
		Subdomain:       pgtype.Text{String: "tech", Valid: true},
	}
	link := "https://tech.qoe.fi/mon-super-article"
	recipient := "abonne@example.com"

	res := BuildArticleReleaseEmail(info, link, recipient)

	if res.FromName != "Chronique Tech" {
		t.Fatalf("FromName = %q", res.FromName)
	}
	if res.Subject != "Mon Super Article" {
		t.Fatalf("Subject = %q", res.Subject)
	}
	if !strings.Contains(res.HTML, "Bonjour tout le monde !") {
		t.Fatal("Le contenu de l'article doit figurer dans le mail gratuit")
	}
	if !strings.Contains(res.HTML, "Se désabonner") {
		t.Fatal("Lien de désabonnement absent")
	}
}

func TestBuildArticleReleaseEmail_PremiumZeroLeak(t *testing.T) {
	info := db.GetArticleReleaseInfoRow{
		ID:              "art_prem_1",
		Title:           "Dossier Secret",
		Slug:            "dossier-secret",
		IsPremium:       true,
		Content:         "<p>Teaser public.</p><!--qoe-paywall--><p>SECRET PAYANT CONFIDENTIEL</p>",
		PublicationId:   "pub_test",
		PublicationName: "Chronique Tech",
		Subdomain:       pgtype.Text{String: "tech", Valid: true},
	}
	link := "https://tech.qoe.fi/dossier-secret"
	recipient := "abonne@example.com"

	res := BuildArticleReleaseEmail(info, link, recipient)

	if !strings.Contains(res.HTML, "Teaser public.") {
		t.Fatal("Le teaser public pré-paywall doit figurer")
	}
	if strings.Contains(res.HTML, "SECRET PAYANT CONFIDENTIEL") {
		t.Fatal("Fuite de contenu payant détectée dans le mail !")
	}
	if !strings.Contains(res.HTML, "réservé aux abonnés") {
		t.Fatal("Bannière paywall absente")
	}
	if !strings.Contains(res.HTML, "Lire l'article") {
		t.Fatal("CTA Lire l'article absent")
	}
}
