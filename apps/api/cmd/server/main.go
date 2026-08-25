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
	"github.com/qoefi/api/internal/modules/admin"
	"github.com/qoefi/api/internal/modules/analytics"
	"github.com/qoefi/api/internal/modules/articles"
	"github.com/qoefi/api/internal/modules/billing"
	"github.com/qoefi/api/internal/modules/collaborations"
	"github.com/qoefi/api/internal/modules/creator"
	"github.com/qoefi/api/internal/modules/devtools"
	"github.com/qoefi/api/internal/modules/events"
	"github.com/qoefi/api/internal/modules/feed"
	"github.com/qoefi/api/internal/modules/highlights"
	"github.com/qoefi/api/internal/modules/home"
	"github.com/qoefi/api/internal/modules/imports"
	"github.com/qoefi/api/internal/modules/media"
	"github.com/qoefi/api/internal/modules/mediaassets"
	"github.com/qoefi/api/internal/modules/notifications"
	"github.com/qoefi/api/internal/modules/oauth"
	"github.com/qoefi/api/internal/modules/posts"
	"github.com/qoefi/api/internal/modules/publications"
	"github.com/qoefi/api/internal/modules/search"
	"github.com/qoefi/api/internal/modules/settings"
	"github.com/qoefi/api/internal/modules/starterpacks"
	"github.com/qoefi/api/internal/modules/tracking"
	"github.com/qoefi/api/internal/modules/users"
	"github.com/qoefi/api/internal/modules/webhooks"
	"github.com/qoefi/api/internal/modules/workspaces"
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

	// Fournisseur d'identité OAuth 2.1 / OIDC (qoe.fi) — service partagé entre
	// le routeur et la boucle de purge périodique des artefacts.
	oauthService := oauth.NewService(pool, cfg.OAuthIssuer, cfg.OAuthAuthorizeURL, cfg.OAuthSigningKey)
	go oauth.Cleanup(ctx, oauthService, time.Hour)

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
		OAuth:            oauthService,
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
	// OAuth est le service du fournisseur d'identité OAuth 2.1 / OIDC.
	OAuth *oauth.Service
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
	// Global généreux : le trafic pages (SSR + widgets) compte ici ; les
	// routes sensibles ont leur propre limiteur namespacé en plus.
	r.Use(authmw.RateLimit("global", rc, time.Minute, 600, false))

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

	// Starter packs : lecture publique (auth optionnelle) + création/follow (protégé).
	starterPacksHandler := starterpacks.NewHandler(starterpacks.NewService(pool))
	r.With(auth.OptionalAuth).Group(func(pub chi.Router) {
		starterPacksHandler.RegisterPublic(pub)
	})

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

	// Publications tenant (identité par sous-domaine/domaine) : lecture
	// publique (auth optionnelle pour les entitlements/interactions du lecteur).
	publicationsHandler := publications.NewHandler(publications.NewService(pool))
	r.With(auth.OptionalAuth).Group(func(pub chi.Router) {
		publicationsHandler.RegisterPublic(pub)
	})

	// Home widgets publics (systemConfig, trends, promos, onboarding, créateurs
	// suggérés, trends sémantiques) — Go-only. Auth optionnelle : suggested-creators
	// utilise le userID pour la similarité vectorielle.
	homeHandler := home.NewHandler(home.NewService(pool))
	r.With(auth.OptionalAuth).Group(func(pub chi.Router) {
		homeHandler.RegisterPublic(pub)
	})

	// Settings créateur : sous-domaine (public) + profil/onboarding/clés API (protégé).
	settingsHandler := settings.NewHandler(settings.NewService(pool))
	settingsHandler.RegisterPublic(r)

	// Users : recherche publique (autocomplétion mentions @) + profil lecteur
	// (/v1/me*) protégé. RegisterPublic est monté DIRECTEMENT sur le routeur
	// racine pour battre le wildcard public du module creator
	// (/v1/users/{username}) qui masquerait /v1/users/search sinon.
	usersHandler := users.NewHandler(users.NewService(pool))
	usersHandler.RegisterPublic(r)

	// Profils créateurs / publications publics (/v1/users/{username}, /followers, /following)
	creatorHandler := creator.NewHandler(pool, umami.NewClient(d.UmamiAPIURL, d.UmamiAPIKey, d.UmamiUser, d.UmamiPass), d.DefaultUmamiSite)
	r.With(auth.OptionalAuth).Group(func(pub chi.Router) {
		creatorHandler.RegisterPublic(pub)
	})

	// Fournisseur d'identité OAuth 2.1 / OIDC (qoe.fi) : discovery, JWKS,
	// token, introspection, révocation et userinfo sont publics ; le token
	// endpoint reçoit un rate-limit dédié (anti-brute-force) en plus du global.
	// Fallback de test : si aucun service n'est injecté (ex. smoke test), on
	// monte un service éphémère pour que les routes restent enregistrables.
	oauthService := d.OAuth
	if oauthService == nil {
		oauthService = oauth.NewService(pool, "", "", "")
	}
	oauthHandler := oauth.NewHandler(oauthService)
	oauthHandler.RegisterPublic(r)
	r.With(authmw.RateLimit("oauth-token", rc, time.Minute, 30, false)).Post("/v1/oauth/token", oauthHandler.Token())

	// Tracking de lecture : service partagé entre le groupe anonyme (lectures/
	// impressions captées même sans session) et le groupe protégé (historique).
	trackingHandler := tracking.NewHandler(tracking.NewService(pool))

	// Toute l'API créateur exige un Bearer token valide (JWT OU clé API qoe_live_).
	r.Group(func(protected chi.Router) {
		// 600 req/min par utilisateur (usage créateur légitime, généreux).
		protected.Use(authmw.RateLimit("protected", rc, time.Minute, 600, true))
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

		workspacesHandler := workspaces.NewHandler(workspaces.NewService(pool))
		workspacesHandler.Register(protected)

		mediaHandler := media.NewHandler(media.NewService(pool))
		mediaHandler.Register(protected)

		importsHandler := imports.NewHandler(imports.NewService(pool))
		importsHandler.Register(protected)

		mediaAssetsHandler := mediaassets.NewHandler(mediaassets.NewService(pool))
		mediaAssetsHandler.Register(protected)

		collaborationsHandler := collaborations.NewHandler(collaborations.NewService(pool))
		collaborationsHandler.Register(protected)

		starterPacksHandler.RegisterProtected(protected)

		devtoolsHandler := devtools.NewHandler(devtools.NewService(pool))
		devtoolsHandler.Register(protected)

		adminHandler := admin.NewHandler(admin.NewService(pool))
		adminHandler.Register(protected)

		usersHandler.Register(protected)

		trackingHandler.RegisterReader(protected)

		oauthHandler.RegisterProtected(protected)
	})

	// Tracking de lecture (reading-session, feed-impression, show-less) :
	// AUTH OPTIONNELLE — le service enregistre les lectures/impressions des
	// visiteurs anonymes (userID vide, completionRate quand même mis à jour),
	// comme le faisait l'ancien chemin Prisma. show-less reste refusé si non
	// authentifié (401 côté handler).
	r.With(auth.OptionalAuth).Group(func(pub chi.Router) {
		trackingHandler.RegisterProtected(pub)
	})

	// API créateur par clé API (qoe_live_…) : analytics/stats (proxy Umami)
	// + surlignages publics des articles du créateur.
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
