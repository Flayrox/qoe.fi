// cmd/worker — point d'entrée des workers asynq (qoe.fi).
package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/hibiken/asynq"
	"github.com/joho/godotenv"

	"github.com/qoefi/api-go/internal/cache"
	"github.com/qoefi/api-go/internal/config"
	"github.com/qoefi/api-go/internal/dbpool"
	"github.com/qoefi/api-go/internal/queue"
	"github.com/qoefi/api-go/internal/workers"
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

	mux := asynq.NewServeMux()
	mux.HandleFunc(queue.TaskArticlePublished, func(ctx context.Context, t *asynq.Task) error {
		if err := webhookWorker.HandleProcesses(ctx, t, queue.TaskArticlePublished); err != nil {
			return err
		}
		return newsletterWorker.HandleArticlePublished(ctx, t)
	})
	mux.HandleFunc(queue.TaskSubscriberCreated, func(ctx context.Context, t *asynq.Task) error {
		return webhookWorker.HandleProcesses(ctx, t, queue.TaskSubscriberCreated)
	})
	mux.HandleFunc(queue.TaskPostLiked, newsletterWorker.HandlePostLiked)
	mux.HandleFunc(queue.TaskStripeEvent, stripeWorker.HandleStripeEvent)

	srv := queue.NewServer(cfg.RedisURL, 10)
	if srv == nil {
		log.Fatal("URL Redis invalide pour asynq")
	}

	go func() {
		log.Println("worker asynq démarré")
		if err := srv.Run(mux); err != nil {
			log.Fatalf("worker asynq: %v", err)
		}
	}()

	<-ctx.Done()
	log.Println("arrêt des workers…")
	srv.Shutdown()

	_ = os.Getpid
}
