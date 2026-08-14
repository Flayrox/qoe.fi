// cmd/server — point d'entrée de l'API HTTP Go (qoe.fi).
package main

import (
	"context"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/joho/godotenv"

	"github.com/qoefi/api-go/internal/cache"
	"github.com/qoefi/api-go/internal/config"
	"github.com/qoefi/api-go/internal/dbpool"
	authmw "github.com/qoefi/api-go/internal/middleware"
	"github.com/qoefi/api-go/internal/modules/events"
	"github.com/qoefi/api-go/internal/modules/feed"
	"github.com/qoefi/api-go/internal/modules/posts"
	"github.com/qoefi/api-go/internal/queue"
)

func main() {
	// Charge le .env à la racine du monorepo ou local.
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

	rc := cache.Client(cfg.RedisURL)
	asynqClient := queue.NewClient(cfg.RedisURL)

	r := chi.NewRouter()
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(authmw.Recovery)
	r.Use(authmw.Logger)
	r.Use(authmw.CORS([]string{"http://localhost:3000", "http://localhost:3001", "http://localhost:3002", "http://localhost:3003", "https://qoe.fi", "https://*.qoe.fi"}))

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})

	// Endpoints internes (émission d'événements → asynq), protégés par secret.
	eventsHandler := events.NewHandler(asynqClient, cfg.InternalSecret)
	eventsHandler.Register(r)

	// Auth JWT Supabase pour toute l'API.
	auth := authmw.NewAuth(cfg.JWTSecret, cfg.SupabaseAuthURL)
	r.Group(func(protected chi.Router) {
		protected.Use(auth.Middleware)

		postsHandler := posts.NewHandler(posts.NewService(pool, rc))
		postsHandler.Register(protected)

		feedHandler := feed.NewHandler(feed.NewService(pool, rc))
		feedHandler.Register(protected)
	})

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           r,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Printf("api-go démarré sur :%s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("serveur: %v", err)
		}
	}()

	<-ctx.Done()
	log.Println("arrêt en cours…")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
}
