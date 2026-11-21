package articles

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
)

// Sans NEWSLETTER_UNSUB_SECRET, l'ancien repli signait avec une constante
// publique : n'importe qui pouvait forger un lien de désinscription valide
// pour n'importe quel abonné (et le lien de confirmation d'e-mail, dérivé de
// la même clé). La signature doit être impossible, pas devinable.
func TestVerifyUnsubscribe_SansSecretPasDeForge(t *testing.T) {
	t.Setenv("NEWSLETTER_UNSUB_SECRET", "")
	const ancienRepliPublic = "qoe-unsub-default-secret-min32chars"

	mac := hmac.New(sha256.New, []byte(ancienRepliPublic))
	mac.Write([]byte("pub_victime:victime@example.com"))
	forge := hex.EncodeToString(mac.Sum(nil))

	if VerifyUnsubscribe("pub_victime", "victime@example.com", forge) {
		t.Fatal("signature forgée avec le secret public de repli acceptée")
	}
	if sig := SignUnsubscribe("pub_victime", "victime@example.com"); sig != "" {
		t.Fatalf("signature produite sans secret configuré : %q", sig)
	}
	if u := BuildUnsubURL("pub_victime", "victime@example.com"); strings.Contains(u, "sig=") && !strings.Contains(u, "sig=&") && !strings.HasSuffix(u, "sig=") {
		t.Fatalf("lien de désinscription signé sans secret : %q", u)
	}
}

// Un article verrouillé par sa VISIBILITÉ (pas seulement par isPremium) ne doit
// jamais partir en clair par e-mail : le mail est lu sans entitlement.
func TestBuildArticleReleaseEmail_VisibiliteVerrouilleeZeroLeak(t *testing.T) {
	cas := []struct {
		nom        string
		visibility string
		isPremium  bool
	}{
		{"membres", VisMembersOnly, false},
		{"abonnés payants", VisPaidSubscribers, false},
		{"palier", VisTierSpecific, false},
		{"premium sans visibilité verrouillée", VisPublic, true},
	}
	for _, c := range cas {
		t.Run(c.nom, func(t *testing.T) {
			info := db.GetArticleReleaseInfoRow{
				ID:            "art_gate",
				Title:         "Dossier réservé",
				Slug:          "dossier-reserve",
				Visibility:    db.ContentVisibility(""),
				IsPremium:     c.isPremium,
				Content:       "<p>Teaser public.</p><!--qoe-paywall--><p>SECRET RESERVE</p>",
				PublisherId:   "pub_test",
				PublisherName: "Chronique Tech",
			}
			info.Visibility = db.ContentVisibility(c.visibility)

			res := BuildArticleReleaseEmail(info, "https://tech.qoe.fi/dossier-reserve", "abonne@example.com")
			if strings.Contains(res.HTML, "SECRET RESERVE") {
				t.Fatal("contenu verrouillé servi en clair dans l'e-mail")
			}
			if strings.Contains(res.PreviewText, "SECRET RESERVE") {
				t.Fatal("contenu verrouillé servi en clair dans le preheader")
			}
		})
	}
}

func TestBuildArticleReleaseEmail_PublicResteComplet(t *testing.T) {
	info := db.GetArticleReleaseInfoRow{
		ID:            "art_pub",
		Title:         "Libre",
		Slug:          "libre",
		Visibility:    db.ContentVisibility(VisPublic),
		Content:       "<p>Corps public complet.</p>",
		PublisherId:   "pub_test",
		PublisherName: "Chronique Tech",
	}
	res := BuildArticleReleaseEmail(info, "https://tech.qoe.fi/libre", "abonne@example.com")
	if !strings.Contains(res.HTML, "Corps public complet.") {
		t.Fatal("article public tronqué dans l'e-mail")
	}
	_ = pgtype.Text{}
}
