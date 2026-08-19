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
	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"

	"github.com/qoefi/api/internal/cache"
	"github.com/qoefi/api/internal/config"
	"github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/dbpool"
	authmw "github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/modules/analytics"
	"github.com/qoefi/api/internal/modules/articles"
	"github.com/qoefi/api/internal/modules/billing"
	"github.com/qoefi/api/internal/modules/creator"
	"github.com/qoefi/api/internal/modules/events"
	"github.com/qoefi/api/internal/modules/feed"
	"github.com/qoefi/api/internal/modules/highlights"
	"github.com/qoefi/api/internal/modules/notifications"
	"github.com/qoefi/api/internal/modules/posts"
	"github.com/qoefi/api/internal/modules/search"
	"github.com/qoefi/api/internal/modules/settings"
	"github.com/qoefi/api/internal/modules/webhooks"
	"github.com/qoefi/api/internal/queue"
	"github.com/qoefi/api/internal/umami"
)

func main() {
	// Charge le .env local (apps/api/.env, synchronisé par scripts/copy-env.js)
	// ou celui de la racine du monorepo, selon le CWD de lancement.
	_ = godotenv.Load(".env", "../.env", "../../.env")

	cfg := config.Load()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	pool, err := dbpool.New(ctx, cfg.DatabaseURL, cfg.PoolSize())
	if err != nil {
		log.Fatalf("connexion base de données: %v", err)
	}
	defer pool.Close()

	r := newRouter(RouterDeps{
		Pool:             pool,
		Redis:            cache.Client(cfg.RedisURL),
		Asynq:            queue.NewClient(cfg.RedisURL),
		JWTSecret:        cfg.JWTSecret,
		SupabaseAuthURL:  cfg.SupabaseAuthURL,
		StripeWebhookKey: cfg.StripeWebhookSecret,
		InternalSecret:   cfg.InternalSecret,
		UmamiAPIURL:      cfg.UmamiAPIURL,
		UmamiAPIKey:      cfg.UmamiAPIKey,
		UmamiUser:        cfg.UmamiUser,
		UmamiPass:        cfg.UmamiPass,
		DefaultUmamiSite: cfg.DefaultUmamiWebsiteID,
		UmamiDatabaseURL: cfg.UmamiDatabaseURL,
	})

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           r,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Printf("api démarré sur :%s", cfg.Port)
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

// RouterDeps porte les dépendances partagées par newRouter (injectables en test).
type RouterDeps struct {
	Pool             *pgxpool.Pool
	Redis            *redis.Client
	Asynq            *asynq.Client
	JWTSecret        string
	SupabaseAuthURL  string
	StripeWebhookKey string
	InternalSecret   string
	UmamiAPIURL      string
	UmamiAPIKey      string
	UmamiUser        string
	UmamiPass        string
	DefaultUmamiSite string
	UmamiDatabaseURL string
}

// newRouter assemble l'API complète (routes publiques + créateur + workers
// events). Séparée de main() pour être testable de bout en bout (smoke test).
func newRouter(d RouterDeps) *chi.Mux {
	rc := d.Redis
	asynqClient := d.Asynq
	pool := d.Pool

	r := chi.NewRouter()
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(authmw.Recovery)
	r.Use(authmw.Logger)
	r.Use(authmw.CORS([]string{"http://localhost:3000", "http://localhost:3001", "http://localhost:3002", "http://localhost:3003", "https://qoe.fi", "https://*.qoe.fi"}))
	// Rate-limiting global : 120 req/min par IP (anti-spam public).
	r.Use(authmw.RateLimit(rc, time.Minute, 120, false))

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})
	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})

	// Recherche publique : articles (Meilisearch) + sémantique (pgvector/jina).
	searchHandler := search.NewHandler(search.NewSemanticService(d.Pool))
	searchHandler.RegisterPublic(r)

	// Endpoints internes (émission d'événements → asynq), protégés par secret.
	eventsHandler := events.NewHandler(asynqClient, d.InternalSecret)
	eventsHandler.Register(r)

	// Webhooks Stripe (vérif signature + enqueue asynq).
	billingHandler := billing.NewHandler(asynqClient, d.StripeWebhookKey)
	billingHandler.Register(r)

	// Auth JWT Supabase (instance partagée : Middleware obligatoire + OptionalAuth).
	auth := authmw.NewAuth(d.JWTSecret, d.SupabaseAuthURL)

	// Articles : lecture publique (auth optionnelle, paywall) hors groupe protégé.
	articlesHandler := articles.NewHandler(articles.NewService(pool, rc, asynqClient))
	r.With(auth.OptionalAuth).Group(func(pub chi.Router) {
		articlesHandler.RegisterPublic(pub)
	})

	// Feed & Posts : lecture publique (auth optionnelle : threads, trending, posts, profil, engagement).
	feedHandler := feed.NewHandler(feed.NewService(pool, rc))
	postsHandler := posts.NewHandler(posts.NewService(pool, rc))
	r.With(auth.OptionalAuth).Group(func(pub chi.Router) {
		feedHandler.RegisterPublic(pub)
		postsHandler.RegisterPublic(pub)
	})

	// Highlights : surlignages publics d'un article (auth optionnelle).
	highlightsHandler := highlights.NewHandler(highlights.NewService(pool))
	r.With(auth.OptionalAuth).Group(func(pub chi.Router) {
		highlightsHandler.RegisterPublic(pub)
	})

	// Settings créateur : sous-domaine (public) + profil/onboarding/clés API (protégé).
	settingsHandler := settings.NewHandler(settings.NewService(pool))
	settingsHandler.RegisterPublic(r)

	// Toute l'API créateur exige un Bearer token valide (JWT OU clé API qoe_live_).
	r.Group(func(protected chi.Router) {
		// 600 req/min par utilisateur (usage créateur légitime, généreux).
		protected.Use(authmw.RateLimit(rc, time.Minute, 600, true))
		protected.Use(auth.CombinedAuth(db.New(pool)))

		postsHandler.RegisterProtected(protected)
		feedHandler.RegisterProtected(protected)

		articlesHandler.RegisterProtected(protected, authmw.RequireAPIScope)

		notifHandler := notifications.NewHandler(notifications.NewService(pool))
		notifHandler.Register(protected)

		highlightsHandler.RegisterProtected(protected)

		analyticsHandler := analytics.NewHandler(analytics.NewService(pool, d.UmamiDatabaseURL))
		analyticsHandler.Register(protected)

		creatorHandler := creator.NewHandler(pool, umami.NewClient(d.UmamiAPIURL, d.UmamiAPIKey, d.UmamiUser, d.UmamiPass), d.DefaultUmamiSite)
		creatorHandler.RegisterProtected(protected, authmw.RequireAPIScope)

		settingsHandler.RegisterProtected(protected)

		webhooksHandler := webhooks.NewHandler(webhooks.NewService(pool))
		webhooksHandler.RegisterProtected(protected, authmw.RequireAPIScope)
	})

	// API créateur par clé API (qoe_live_…) : catégories + analytics/stats (proxy Umami).
	r.Group(func(apiKey chi.Router) {
		apiKey.Use(authmw.APIKeyAuth(db.New(pool)))
		creatorHandler := creator.NewHandler(pool, umami.NewClient(d.UmamiAPIURL, d.UmamiAPIKey, d.UmamiUser, d.UmamiPass), d.DefaultUmamiSite)
		creatorHandler.RegisterAPIKey(apiKey)
	})

	// Profils publics (résolution publication par slug/subdomain). Auth
	// optionnelle : si le viewer est connecté, on renseigne `isFollowing`.
	creatorPublic := creator.NewHandler(pool, umami.NewClient(d.UmamiAPIURL, d.UmamiAPIKey, d.UmamiUser, d.UmamiPass), d.DefaultUmamiSite)
	r.With(auth.OptionalAuth).Group(func(pub chi.Router) {
		creatorPublic.RegisterPublic(pub)
	})

	return r
}
