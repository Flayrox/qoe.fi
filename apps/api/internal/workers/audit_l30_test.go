package workers

// =====================================================================
// 🔎 Audit L30 — rouges reproductibles des workers asynchrones
// =====================================================================
// Chaque test décrit un défaut OBSERVABLE à HEAD : une panne de base lue
// comme « rien à faire », un événement Stripe perdu après un échec, un
// crédit de wallet perdu sans signal, une action inconnue qui SUPPRIME un
// document de l'index, un intervalle nul qui panique au démarrage.
// =====================================================================

import (
	"context"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/qoefi/api/internal/modules/mediaassets"
	"github.com/qoefi/api/internal/queue"
)

// auditTask sérialise un payload comme le ferait asynq à l'enqueue.
func auditTask(t *testing.T, name string, payload any) *asynq.Task {
	t.Helper()
	return asynq.NewTask(name, mustJSON(payload))
}

// auditBrokenPool rend un pool qui ne peut pas se connecter : toute requête
// échoue avec une erreur réseau (jamais ErrNoRows). C'est la panne de base
// que ces tests distinguent de « rien à faire ».
func auditBrokenPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	p, err := pgxpool.New(context.Background(),
		"postgres://audit:audit@127.0.0.1:1/audit?sslmode=disable&connect_timeout=1")
	if err != nil {
		t.Fatalf("pool de test: %v", err)
	}
	t.Cleanup(p.Close)
	return p
}

// ─── Stripe ──────────────────────────────────────────────────────────

// TestAuditL30_StripeResolutionPanne : une erreur de résolution de la
// publication (identifiant illisible, base indisponible) est rendue en
// SUCCÈS. L'événement de paiement est alors perdu : ni abonné crédité, ni
// wallet, ni reprise asynq.
func TestAuditL30_StripeResolutionPanne(t *testing.T) {
	requirePool(t)
	w := NewStripeWorker(poolTest, nil)
	p := queue.StripeEventPayload{
		EventID:   "evt_l30_resolution",
		EventType: "invoice.payment_succeeded",
		Data: map[string]any{"object": map[string]any{
			"amount_paid":        1000,
			"customer_email":     "lecteur@test.dev",
			"metadata":           map[string]any{"creatorId": "pas-un-uuid"},
			"customer":           "cus_l30",
			"subscription":       "sub_l30",
			"current_period_end": 4102444800,
		}},
	}
	if err := w.HandleStripeEvent(context.Background(), auditTask(t, "stripe.event", p)); err == nil {
		t.Fatal("panne de résolution rendue en succès : l'événement de paiement est perdu sans reprise")
	}
}

// TestAuditL30_StripeCreditPerdu : quand le propriétaire du média ne peut pas
// être résolu (erreur de base, pas « aucun propriétaire »), creditOwner rend
// un succès. Le paiement est encaissé, le créateur n'est jamais crédité, et
// aucun signal ne permet de rattraper.
func TestAuditL30_StripeCreditPerdu(t *testing.T) {
	w := NewStripeWorker(auditBrokenPool(t), nil)
	if err := w.creditOwner(context.Background(), "00000000-0000-0000-0000-00000000c0de", 1000); err == nil {
		t.Fatal("propriétaire non résolu rendu en succès : crédit du créateur perdu sans trace")
	}
}

// TestAuditL30_StripeIdempotenceEmpoisonnee : la clé d'idempotence Redis est
// posée AVANT le traitement. Un premier passage en échec est donc marqué
// « traité » : le rejeu asynq est avalé et l'événement n'est jamais rejoué.
func TestAuditL30_StripeIdempotenceEmpoisonnee(t *testing.T) {
	mr := miniredis.RunT(t)
	rc := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rc.Close() })

	w := NewStripeWorker(auditBrokenPool(t), rc)
	p := queue.StripeEventPayload{
		EventID:   "evt_l30_idempotence",
		EventType: "invoice.payment_succeeded",
		Data: map[string]any{"object": map[string]any{
			"amount_paid":    1000,
			"customer_email": "lecteur@test.dev",
			"metadata":       map[string]any{"creatorId": "pas-un-uuid"},
		}},
	}
	ctx := context.Background()
	if err := w.HandleStripeEvent(ctx, auditTask(t, "stripe.event", p)); err == nil {
		t.Fatal("premier passage en échec rendu en succès")
	}
	if err := w.HandleStripeEvent(ctx, auditTask(t, "stripe.event", p)); err == nil {
		t.Fatal("rejeu avalé comme « déjà traité » alors que le premier passage a échoué")
	}
}

// ─── Newsletter ──────────────────────────────────────────────────────

// TestAuditL30_ReleasePanneDB : toute erreur de GetArticleReleaseInfo est lue
// comme « article non publié, skip ». Une panne de base enterre donc l'envoi
// de la release sans reprise asynq.
func TestAuditL30_ReleasePanneDB(t *testing.T) {
	w := NewNewsletterWorker(auditBrokenPool(t))
	w.SetEmailProvider(&fakeProvider{}, "noreply@qoe.fi")
	tk := auditTask(t, "newsletter.article_release", queue.ArticleReleasePayload{ArticleID: "pas-un-uuid"})
	if err := w.HandleArticleRelease(context.Background(), tk); err == nil {
		t.Fatal("panne DB rendue en « article non publié » : la release est perdue sans reprise")
	}
}

// TestAuditL30_PublishedLockPanne : toute erreur du verrou d'envoi (y compris
// une panne de base) est lue comme « déjà envoyé ». L'article publié n'est
// jamais annoncé par email et rien ne sera rejoué.
func TestAuditL30_PublishedLockPanne(t *testing.T) {
	w := NewNewsletterWorker(auditBrokenPool(t))
	tk := auditTask(t, "article.published", queue.ArticlePublishedPayload{
		ArticleID:   "pas-un-uuid",
		PublisherID: "pas-un-uuid",
		AuthorID:    "pas-un-uuid",
		Title:       "Article d'audit",
		Slug:        "article-audit",
		Visibility:  "PUBLIC",
		SendEmail:   true,
	})
	if err := w.HandleArticlePublished(context.Background(), tk); err == nil {
		t.Fatal("panne du verrou d'envoi rendue en « déjà envoyé » : fanout email perdu")
	}
}

// TestAuditL30_WelcomePanneDB : toute erreur de GetSubscriberEmailContext est
// journalisée « abonné absent » et la tâche réussit. Une panne de base perd
// l'email de bienvenue définitivement.
func TestAuditL30_WelcomePanneDB(t *testing.T) {
	w := NewWelcomeEmailWorker(auditBrokenPool(t))
	w.SetEmailProvider(&fakeProvider{}, "noreply@qoe.fi")
	tk := auditTask(t, "subscriber.welcome", queue.SubscriberWelcomePayload{
		Email:       "lecteur@test.dev",
		PublisherID: "pas-un-uuid",
	})
	if err := w.HandleSubscriberWelcome(context.Background(), tk); err == nil {
		t.Fatal("panne DB rendue en « abonné absent » : email de bienvenue perdu sans reprise")
	}
}

// ─── Recherche ───────────────────────────────────────────────────────

// TestAuditL30_SearchActionInconnue : une action non reconnue (faute de
// frappe dans le producteur, évolution de contrat) est traitée comme un
// « delete » : le document disparaît de l'index et la tâche réussit.
func TestAuditL30_SearchActionInconnue(t *testing.T) {
	mock := &mockSyncer{}
	w := newTestSearchWorker(t, mock)
	err := w.HandleSearchSync(context.Background(), searchTask(t, "upsert ", "art_l30"))
	if err == nil {
		t.Fatal("action inconnue acceptée en succès")
	}
	if len(mock.deleted) != 0 {
		t.Fatalf("action inconnue → document supprimé de l'index : %v", mock.deleted)
	}
}

// ─── Boucles cadencées ───────────────────────────────────────────────

// TestAuditL30_IntervalleNulNePaniquePas : deux boucles créent leur ticker
// sans garde. Un intervalle nul (variable d'environnement absente ou à 0)
// fait paniquer le worker au démarrage, en boucle de redémarrage.
func TestAuditL30_IntervalleNulNePaniquePas(t *testing.T) {
	requirePool(t)
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // premier passage seulement, puis sortie immédiate

	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("intervalle nul → panic au démarrage : %v", r)
		}
	}()
	RunMediaLifecycle(ctx, poolTest, mediaassets.NewService(poolTest), &fakeMediaDeleter{}, 0, 7*24*time.Hour)
	RunScheduledPublisher(ctx, poolTest, nil, 0)
}
