// cmd/worker — point d'entrée des workers asynq (qoe.fi).
package main

import (
	"context"
	"log"
	"os/signal"
	"syscall"
	"time"

	"github.com/hibiken/asynq"
	"github.com/joho/godotenv"

	"github.com/qoefi/api/internal/cache"
	"github.com/qoefi/api/internal/config"
	"github.com/qoefi/api/internal/dbpool"
	"github.com/qoefi/api/internal/queue"
	"github.com/qoefi/api/internal/umami"
	"github.com/qoefi/api/internal/workers"
)

func main() {
	_ = godotenv.Load("../../../.env")
	_ = godotenv.Load()

	cfg := config.Load()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	pool, err := dbpool.New(ctx, cfg.DatabaseURL, cfg.PoolSize())
	if err != nil {
		log.Fatalf("connexion base de données: %v", err)
	}
	defer pool.Close()

	webhookWorker := workers.NewWebhookWorker(pool)
	newsletterWorker := workers.NewNewsletterWorker(pool)
	stripeWorker := workers.NewStripeWorker(pool, cache.Client(cfg.RedisURL))
	searchWorker := workers.NewSearchWorker(pool)
	searchWorker.Setup(ctx)
	embeddingWorker := workers.NewEmbeddingWorker(pool)

	mux := asynq.NewServeMux()
	handlers := buildHandlers(workerDeps{
		webhook:   webhookWorker,
		newsletter: newsletterWorker,
		stripe:    stripeWorker,
		search:    searchWorker,
		embedding: embeddingWorker,
	})
	for taskType, fn := range handlers {
		mux.HandleFunc(taskType, fn)
	}

	srv := queue.NewServer(cfg.RedisURL, 10)
	if srv == nil {
		log.Fatal("URL Redis invalide pour asynq")
	}
	asynqClient := queue.NewClient(cfg.RedisURL)

	go func() {
		log.Println("worker asynq démarré")
		if err := srv.Run(mux); err != nil {
			log.Fatalf("worker asynq: %v", err)
		}
	}()

	// Nettoyage TTL des documents de collaboration (Yjs) : purge des
	// brouillons non touchés depuis 14 jours, toutes les 6 heures.
	go workers.RunCollabCleanup(ctx, pool, 6*time.Hour, 14*24*time.Hour)

	// Publication automatique des articles programmés (SCHEDULED → PUBLISHED) :
	// bascule + fanout asynq (webhooks, newsletter, embedding, search), toutes
	// les minutes (rattrape au démarrage les articles passés pendant une coupure).
	go workers.RunScheduledPublisher(ctx, pool, asynqClient, time.Minute)

	// Provisionnement automatique des websites Umami : chaque publication sans
	// "umamiWebsiteId" reçoit son website (créé via l'API Umami) → le créateur
	// voit ses stats dans le studio sans aucun lien manuel. Toutes les 5 min.
	go workers.RunUmamiProvisioner(ctx, pool, umami.NewClient(cfg.UmamiAPIURL, cfg.UmamiAPIKey, cfg.UmamiUser, cfg.UmamiPass), 5*time.Minute)

	// Fournisseur email partagé (SMTP self-hosté / Resend) : utilisé par le
	// drain NotificationDelivery ET les newsletters créateurs. Inactif si aucun
	// fournisseur n'est configuré (EMAIL_PROVIDER absent).
	emailProvider := workers.NewEmailProvider(workers.EmailProviderConfig{
		Provider: cfg.EmailProvider,
		SMTP: workers.SMTPConfig{
			Host:   cfg.SMTPHost,
			Port:   cfg.SMTPPort,
			User:   cfg.SMTPUser,
			Pass:   cfg.SMTPPass,
			From:   cfg.EmailFrom,
			Secure: cfg.SMTPSecure,
		},
		ResendAPIKey: cfg.ResendAPIKey,
	})
	newsletterWorker.SetEmailProvider(emailProvider, cfg.EmailFrom)
	if emailProvider != nil {
		go workers.RunEmailDeliveryLoop(ctx, pool, emailProvider, cfg.EmailFrom, 30*time.Second, 50)
	} else {
		log.Println("[email-delivery] désactivé (EMAIL_PROVIDER non configuré)")
	}

	<-ctx.Done()
	log.Println("arrêt des workers…")
	srv.Shutdown()
}

// workerDeps porte les workers concrets utilisés par le mux asynq (injectés
// en test pour vérifier le câblage tâche → handler).
type workerDeps struct {
	webhook    *workers.WebhookWorker
	newsletter *workers.NewsletterWorker
	stripe     *workers.StripeWorker
	search     *workers.SearchWorker
	embedding  *workers.EmbeddingWorker
}

// buildHandlers exprime le mapping tâche asynq → handler worker sous forme de
// map (testable sans démarrer de serveur). L'article publié chaîne webhooks
// puis newsletter ; les autres tâches ont un handler unique.
func buildHandlers(d workerDeps) map[string]asynq.HandlerFunc {
	return map[string]asynq.HandlerFunc{
		queue.TaskArticlePublished: func(ctx context.Context, t *asynq.Task) error {
			if err := d.webhook.HandleProcesses(ctx, t, queue.TaskArticlePublished); err != nil {
				return err
			}
			return d.newsletter.HandleArticlePublished(ctx, t)
		},
		queue.TaskArticleUpdated: func(ctx context.Context, t *asynq.Task) error {
			return d.webhook.HandleProcesses(ctx, t, queue.TaskArticleUpdated)
		},
		queue.TaskArticleDeleted: func(ctx context.Context, t *asynq.Task) error {
			return d.webhook.HandleProcesses(ctx, t, queue.TaskArticleDeleted)
		},
		queue.TaskSubscriberCreated: func(ctx context.Context, t *asynq.Task) error {
			return d.webhook.HandleProcesses(ctx, t, queue.TaskSubscriberCreated)
		},
		queue.TaskPostLiked:        d.newsletter.HandlePostLiked,
		queue.TaskNewsletterSend:   d.newsletter.HandleNewsletterSend,
		queue.TaskStripeEvent:      d.stripe.HandleStripeEvent,
		queue.TaskSearchSync:       d.search.HandleSearchSync,
		queue.TaskArticleEmbedding: d.embedding.HandleArticleEmbedding,
		queue.TaskUserEmbedding:    d.embedding.HandleUserEmbedding,
		queue.TaskPostEmbedding:    d.embedding.HandlePostEmbedding,
	}
}
