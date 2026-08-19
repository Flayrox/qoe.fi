// cmd/worker — point d'entrée des workers asynq (qoe.fi).
package main

import (
	"context"
	"log"
	"os"
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
	mux.HandleFunc(queue.TaskArticlePublished, func(ctx context.Context, t *asynq.Task) error {
		if err := webhookWorker.HandleProcesses(ctx, t, queue.TaskArticlePublished); err != nil {
			return err
		}
		return newsletterWorker.HandleArticlePublished(ctx, t)
	})
	mux.HandleFunc(queue.TaskArticleUpdated, func(ctx context.Context, t *asynq.Task) error {
		return webhookWorker.HandleProcesses(ctx, t, queue.TaskArticleUpdated)
	})
	mux.HandleFunc(queue.TaskArticleDeleted, func(ctx context.Context, t *asynq.Task) error {
		return webhookWorker.HandleProcesses(ctx, t, queue.TaskArticleDeleted)
	})
	mux.HandleFunc(queue.TaskSubscriberCreated, func(ctx context.Context, t *asynq.Task) error {
		return webhookWorker.HandleProcesses(ctx, t, queue.TaskSubscriberCreated)
	})
	mux.HandleFunc(queue.TaskPostLiked, newsletterWorker.HandlePostLiked)
	mux.HandleFunc(queue.TaskStripeEvent, stripeWorker.HandleStripeEvent)
	mux.HandleFunc(queue.TaskSearchSync, searchWorker.HandleSearchSync)
	mux.HandleFunc(queue.TaskArticleEmbedding, embeddingWorker.HandleArticleEmbedding)

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

	<-ctx.Done()
	log.Println("arrêt des workers…")
	srv.Shutdown()

	_ = os.Getpid
}
