// Package devtools — panneau de dev local (remplacement de packages/db/src/devtools.ts).
//
// Toutes les opérations sont réservées au superadmin (même garde que le module
// admin). Les endpoints servent le DevtoolsPanel des apps hi/admin/tenants en
// mode développement : compteurs, création de créateurs, seed, simulateurs.
package devtools

import (
	"context"
	"errors"
	"fmt"
	"log"
	"math/rand"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/qoefi/api/internal/queue"
	"github.com/qoefi/api/internal/seed"
	"github.com/qoefi/api/internal/workers"
)

var errForbidden = errors.New("réservé au superadmin")

// Options configure le service devtools (mode dev uniquement).
type Options struct {
	// DevOnly active le bypass par secret partagé du panneau de dev : les
	// requêtes authentifiées par x-qoe-internal-secret sont traitées comme
	// superadmin sans lookup DB ni session utilisateur. Doit rester false en
	// production (QOE_DEVTOOLS_DEV_ONLY absent).
	DevOnly bool
}

// Service porte les opérations du panneau devtools.
type Service struct {
	pool    *pgxpool.Pool
	devOnly bool
}

func NewService(pool *pgxpool.Pool, opts ...Options) *Service {
	s := &Service{pool: pool}
	if len(opts) > 0 {
		s.devOnly = opts[0].DevOnly
	}
	return s
}

// checkSuperadmin vérifie que l'utilisateur est superadmin (via la table User).
// En mode dev, le sentinel DevSecretUserID (requête authentifiée par le secret
// partagé) est accepté directement, sans dépendre d'une ligne superadmin en base.
func (s *Service) checkSuperadmin(ctx context.Context, userID string) error {
	if s.devOnly && userID == DevSecretUserID {
		return nil
	}
	var role string
	err := s.pool.QueryRow(ctx,
		`SELECT role FROM "User" WHERE id = $1`, userID).Scan(&role)
	if err != nil {
		return errForbidden
	}
	if role != "superadmin" {
		return errForbidden
	}
	return nil
}

// ---------------------------------------------------------------------------
// 📊 Données du panneau (compteurs + utilisateurs)
// ---------------------------------------------------------------------------

// Stats sont les compteurs de la base (parité DevtoolsStats TS).
type Stats struct {
	Users       int64 `json:"users"`
	Articles    int64 `json:"articles"`
	Posts       int64 `json:"posts"`
	Likes       int64 `json:"likes"`
	Subscribers int64 `json:"subscribers"`
}

// DevtoolsUser est un utilisateur listé dans le panneau (parité DevtoolsUser TS).
type DevtoolsUser struct {
	ID           string  `json:"id"`
	Name         *string `json:"name"`
	Email        string  `json:"email"`
	Username     *string `json:"username"`
	Role         string  `json:"role"`
	Subdomain    *string `json:"subdomain"`
	CustomDomain *string `json:"customDomain"`
	AccentColor  *string `json:"accentColor"`
	LayoutStyle  *string `json:"layoutStyle"`
	CreatedAt    string  `json:"createdAt"`
}

// Data retourne les compteurs + la liste des utilisateurs (tri createdAt DESC).
func (s *Service) Data(ctx context.Context, userID string) (*struct {
	Stats Stats          `json:"stats"`
	Users []DevtoolsUser `json:"users"`
}, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return nil, err
	}

	var st Stats
	if err := s.pool.QueryRow(ctx, `
		SELECT
		  (SELECT COUNT(*) FROM "User"),
		  (SELECT COUNT(*) FROM "Article"),
		  (SELECT COUNT(*) FROM "Post"),
		  (SELECT COUNT(*) FROM "Like"),
		  (SELECT COUNT(*) FROM "Subscriber")`).Scan(
		&st.Users, &st.Articles, &st.Posts, &st.Likes, &st.Subscribers); err != nil {
		return nil, fmt.Errorf("stats: %w", err)
	}

	rows, err := s.pool.Query(ctx, `
		SELECT u.id, u.name, u.email, u.username, u.role,
		       p.subdomain, p."customDomain", p."accentColor", p."layoutStyle",
		       u."createdAt"
		FROM "User" u
		LEFT JOIN "Publication" p ON p.id = u."publicationId"
		ORDER BY u."createdAt" DESC`)
	if err != nil {
		return nil, fmt.Errorf("users: %w", err)
	}
	defer rows.Close()

	users := []DevtoolsUser{}
	for rows.Next() {
		var u DevtoolsUser
		var createdAt time.Time
		if err := rows.Scan(&u.ID, &u.Name, &u.Email, &u.Username, &u.Role,
			&u.Subdomain, &u.CustomDomain, &u.AccentColor, &u.LayoutStyle, &createdAt); err != nil {
			return nil, err
		}
		u.CreatedAt = createdAt.Format(time.RFC3339)
		users = append(users, u)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return &struct {
		Stats Stats          `json:"stats"`
		Users []DevtoolsUser `json:"users"`
	}{Stats: st, Users: users}, nil
}

// ---------------------------------------------------------------------------
// 👤 Création d'un créateur (parité createMockUserAction — partie DB)
// ---------------------------------------------------------------------------

// CreateUserParams sont les champs du formulaire « Nouveau Créateur ».
type CreateUserParams struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Email       string `json:"email"`
	Username    string `json:"username"`
	Role        string `json:"role"`
	Subdomain   string `json:"subdomain"`
	LayoutStyle string `json:"layoutStyle"`
	AccentColor string `json:"accentColor"`
}

// CreateUser crée/met à jour un utilisateur + sa publication personnelle, puis
// seeder un pack de départ (navigation, réseaux sociaux, catégories, articles)
// si le rôle est "creator".
func (s *Service) CreateUser(ctx context.Context, userID string, p CreateUserParams) error {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return err
	}
	if p.ID == "" || p.Email == "" {
		return errors.New("id et email requis")
	}

	role := p.Role
	if role == "" {
		role = "user"
	}
	layout := p.LayoutStyle
	if layout == "" {
		layout = "minimal"
	}
	accent := p.AccentColor
	if accent == "" {
		accent = "#c5a880"
	}
	cleanSub := strings.ToLower(strings.TrimSpace(p.Subdomain))

	// 1. Utilisateur (upsert — l'id vient de Supabase Auth ou UUID fallback).
	if _, err := s.pool.Exec(ctx, `
		INSERT INTO "User" (id, email, name, username, role, "createdAt", "updatedAt")
		VALUES ($1, $2, $3, $4, $5, now(), now())
		ON CONFLICT (id) DO UPDATE SET
		  email = $2, name = $3, username = $4, role = $5, "updatedAt" = now()`,
		p.ID, p.Email, p.Name, p.Username, role); err != nil {
		return fmt.Errorf("user: %w", err)
	}

	// 2. Publication personnelle (get-or-create).
	var pubID string
	err := s.pool.QueryRow(ctx, `
		SELECT p.id FROM "Publication" p
		JOIN "User" u ON u."publicationId" = p.id
		WHERE u.id = $1 AND p.type = 'PERSONAL'
		LIMIT 1`, p.ID).Scan(&pubID)
	if errors.Is(err, pgx.ErrNoRows) {
		pubID = "pub_" + p.ID
		if _, err := s.pool.Exec(ctx, `
			INSERT INTO "Publication" (id, type, name, slug, subdomain, "accentColor", "layoutStyle", "themeMode", "createdAt", "updatedAt")
			VALUES ($1, 'PERSONAL', $2, $3, $4, $5, $6, 'system', now(), now())`,
			pubID, p.Name, p.Username, nullIfEmpty(cleanSub), accent, layout); err != nil {
			return fmt.Errorf("publication create: %w", err)
		}
	} else if err != nil {
		return fmt.Errorf("publication lookup: %w", err)
	} else {
		if _, err := s.pool.Exec(ctx, `
			UPDATE "Publication" SET name = $2, slug = $3, subdomain = $4,
			  "layoutStyle" = $5, "accentColor" = $6, "themeMode" = 'system', "updatedAt" = now()
			WHERE id = $1`, pubID, p.Name, p.Username, nullIfEmpty(cleanSub), layout, accent); err != nil {
			return fmt.Errorf("publication update: %w", err)
		}
	}
	if _, err := s.pool.Exec(ctx,
		`UPDATE "User" SET "publicationId" = $1, "updatedAt" = now() WHERE id = $2`,
		pubID, p.ID); err != nil {
		return fmt.Errorf("lien user/publication: %w", err)
	}

	// 3. Pack de départ si créateur.
	if role == "creator" {
		if err := s.seedCreatorPack(ctx, pubID, p.ID); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) seedCreatorPack(ctx context.Context, pubID, authorID string) error {
	// Nettoyer les anciennes données pour éviter les collisions de clés uniques.
	if _, err := s.pool.Exec(ctx, `DELETE FROM "NavigationItem" WHERE "publicationId" = $1`, pubID); err != nil {
		return fmt.Errorf("nav delete: %w", err)
	}
	if _, err := s.pool.Exec(ctx, `DELETE FROM "SocialLink" WHERE "publicationId" = $1`, pubID); err != nil {
		return fmt.Errorf("social delete: %w", err)
	}
	if _, err := s.pool.Exec(ctx, `DELETE FROM "Category" WHERE "publicationId" = $1`, pubID); err != nil {
		return fmt.Errorf("category delete: %w", err)
	}
	if _, err := s.pool.Exec(ctx, `DELETE FROM "Article" WHERE "authorId" = $1`, authorID); err != nil {
		return fmt.Errorf("article delete: %w", err)
	}

	navs := []struct {
		label, url string
		order      int32
	}{
		{"Accueil", "/", 1},
		{"Souveraineté", "/category/souverainete", 2},
		{"Écologie", "/category/ecologie", 3},
		{"À Propos", "/about", 4},
	}
	for _, n := range navs {
		if _, err := s.pool.Exec(ctx, `
			INSERT INTO "NavigationItem" (id, label, url, "order", "isExternal", "publicationId")
			VALUES (gen_random_uuid()::text, $1, $2, $3, false, $4)`,
			n.label, n.url, n.order, pubID); err != nil {
			return fmt.Errorf("nav insert: %w", err)
		}
	}

	socials := []struct {
		platform, url string
		order         int32
	}{
		{"x", "https://x.com", 1},
		{"bluesky", "https://bsky.app", 2},
		{"mastodon", "https://mastodon.social", 3},
	}
	for _, soc := range socials {
		if _, err := s.pool.Exec(ctx, `
			INSERT INTO "SocialLink" (id, platform, url, "order", "publicationId")
			VALUES (gen_random_uuid()::text, $1, $2, $3, $4)`,
			soc.platform, soc.url, soc.order, pubID); err != nil {
			return fmt.Errorf("social insert: %w", err)
		}
	}

	var cat1 string
	if err := s.pool.QueryRow(ctx, `
		INSERT INTO "Category" (id, name, slug, "publicationId")
		VALUES (gen_random_uuid()::text, 'Souveraineté', 'souverainete', $1)
		ON CONFLICT (slug, "publicationId") DO UPDATE SET name = 'Souveraineté'
		RETURNING id`, pubID).Scan(&cat1); err != nil {
		return fmt.Errorf("catégorie souveraineté: %w", err)
	}
	var cat2 string
	if err := s.pool.QueryRow(ctx, `
		INSERT INTO "Category" (id, name, slug, "publicationId")
		VALUES (gen_random_uuid()::text, 'Écologie', 'ecologie', $1)
		ON CONFLICT (slug, "publicationId") DO UPDATE SET name = 'Écologie'
		RETURNING id`, pubID).Scan(&cat2); err != nil {
		return fmt.Errorf("catégorie écologie: %w", err)
	}

	articles := []struct {
		slug, title, content string
		readingTime          int32
		isPremium            bool
		categoryID           string
	}{
		{"souverainete-numerique-reprendre-le-controle", "Souveraineté Numérique : Reprendre le contrôle de nos esprits",
			"<p>Dans un monde où chaque seconde d'attention est marchandée au plus offrant par des algorithmes de capture, la souveraineté numérique n'est plus une simple option technique : c'est un impératif éthique et politique.</p><p>Pour l'auteur indépendant, habiter sa propre plateforme sans intermédiaire de censure ou de recommandation biaisée est le premier pas vers une écriture libre et affranchie du bruit ambiant.</p>",
			4, false, cat1},
		{"ecologie-politique-resilience-territoriale", "Écologie politique et résilience territoriale à l'ère de l'Anthropocène",
			"<p>L'urgence écologique exige que nous repensions nos modes de subsistance et d'organisation collective directement à l'échelle des territoires. La résilience n'est pas un repli frileux, mais une réappropriation joyeuse de nos forces de production et de nos communs.</p>",
			6, false, cat2},
		{"manifeste-journalisme-attention-premium", "[Premium] Le Manifeste pour un journalisme de l'attention",
			"<p>Cet article est réservé à nos membres Premium. Merci de votre soutien indéfectible qui finance notre indépendance et la rigueur de notre travail.</p><p>Le journalisme moderne est mort de sa dépendance aux clics. Pour survivre et retrouver sa dignité, le journalisme doit devenir un sanctuaire pour l'attention du lecteur.</p>",
			8, true, cat1},
	}
	for _, a := range articles {
		if err := seed.UpsertArticle(ctx, s.pool, pubID, authorID,
			a.slug, a.title, a.content, a.readingTime, a.isPremium, "PUBLIC", false); err != nil {
			return err
		}
		// Lier la catégorie (UpsertArticle ne gère pas categoryId).
		if _, err := s.pool.Exec(ctx,
			`UPDATE "Article" SET "categoryId" = $1 WHERE "publicationId" = $2 AND slug = $3`,
			a.categoryID, pubID, a.slug); err != nil {
			return fmt.Errorf("category link %s: %w", a.slug, err)
		}
	}
	return nil
}

// ---------------------------------------------------------------------------
// ✍️ Génération de pensées de démo (+15 posts feed)
// ---------------------------------------------------------------------------

// GeneratePosts insère 15 pensées aléatoires de créateurs existants.
func (s *Service) GeneratePosts(ctx context.Context, userID string) error {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return err
	}

	rows, err := s.pool.Query(ctx,
		`SELECT id FROM "User" WHERE role = 'creator' ORDER BY random() LIMIT 10`)
	if err != nil {
		return fmt.Errorf("creators: %w", err)
	}
	creators := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		creators = append(creators, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	if len(creators) == 0 {
		return errors.New("veuillez d'abord créer au moins un utilisateur 'creator' avec les devtools !")
	}

	quotes := []string{
		"Dans un monde de stimulations algorithmiques continues, la lecture silencieuse est un acte de résistance spirituelle.",
		"L'attention n'est pas une ressource à exploiter, c'est l'essence même de notre conscience libre.",
		"Le vrai luxe moderne n'est pas d'être connecté partout, mais d'avoir le choix de s'isoler pour penser profondément.",
		"L'écologie politique n'est pas une liste de privations, mais le projet enthousiasmant d'une souveraineté partagée.",
		"Reprendre le contrôle de ses écrits, c'est refuser de livrer ses pensées aux machines de capture d'attention.",
		"Une communauté solide se construit sur la confiance et l'indépendance financière mutuelle, loin des intermédiaires publicitaires.",
		"La clarté de l'esprit commence par le dépouillement des notifications et des flux d'actualités anxiogènes.",
		"L'écriture longue forme nous force à structurer notre pensée, là où les réseaux de micro-messages l'émiettent.",
		"Nous devons repenser notre relation à la technologie : l'outil doit servir l'homme, non l'asservir à ses métriques d'engagement.",
		"Le Sanctuaire Elfique de qoe.fi est conçu pour libérer l'esprit de sa charge mentale algorithmique.",
	}
	tagsOptions := [][]string{
		{"philosophie", "souverainete"},
		{"ecologie", "politique"},
		{"attention", "silence"},
		{"medias"},
		{"technologie", "ethique"},
	}

	for i := 0; i < 15; i++ {
		author := creators[rand.Intn(len(creators))]
		quote := quotes[rand.Intn(len(quotes))]
		tags := tagsOptions[rand.Intn(len(tagsOptions))]
		content := fmt.Sprintf("%s #%s", quote, strings.Join(tags, " #"))
		if _, err := s.pool.Exec(ctx, `
			INSERT INTO "Post" (id, content, "authorId", tags, visibility, "isDraft", "createdAt", "updatedAt")
			VALUES (gen_random_uuid()::text, $1, $2, $3, 'public', false, now(), now())`,
			content, author, tags); err != nil {
			return fmt.Errorf("post %d: %w", i, err)
		}
	}
	return nil
}

// ---------------------------------------------------------------------------
// 🧹 Reset de la base (parité resetDatabaseAction)
// ---------------------------------------------------------------------------

// Reset vide la base dans un ordre sûr, puis ré-injecte les SystemConfig par
// défaut de la landing page.
func (s *Service) Reset(ctx context.Context, userID string) error {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return err
	}

	tables := []string{
		"PollVote", "PollOption", "Poll", "StarterPackItem", "StarterPack",
		"Notification", "NotificationPreference", "AnnotationComment", "AnnotationUpvote",
		"ArticleComment", "ApiKey", "TranslationAuditLog", "CollaborationRequest",
		"MediaMember", "MediaInvite", "Recommendation", "Like", "Post", "Highlight",
		"Bookmark", "Subscriber", "WalletTransaction", "Follows", "MutedWord",
		"BlockedUser", "Letter", "Article", "Tier", "Category", "NavigationItem",
		"SocialLink", "PartnerPromo", "Trend", "User", "SystemConfig", "Media", "Publication",
	}
	for _, t := range tables {
		if _, err := s.pool.Exec(ctx, fmt.Sprintf(`DELETE FROM "%s"`, t)); err != nil {
			return fmt.Errorf("delete %s: %w", t, err)
		}
	}

	configs := []struct{ key, value, description string }{
		{"hero_pitch_read", "Une lecture monastique, libérée du bruit.", "Texte d'introduction pour le mode lecture (Je veux lire)"},
		{"hero_pitch_publish", "Devenez le souverain de votre propre média.", "Texte d'introduction pour le mode publication (Je veux publier)"},
		{"creators_title", "Ils écrivent sur qoe.fi", "Titre de la section des créateurs de confiance"},
		{"creators_tagline", "Des voix libres et indépendantes", "Tagline de la section des créateurs de confiance"},
		{"format_title", "Cinq Formats de Récits", "Titre de la section de prévisualisation des formats"},
		{"format_tagline", "Au-delà du simple mur de texte", "Tagline de la section de prévisualisation des formats"},
		{"featured_title", "Écrits Majeurs", "Titre de la section des publications phares"},
		{"featured_tagline", "Sélection Écologique et Politique", "Tagline de la section des publications phares"},
		{"comparison_title", "Souveraineté ou Intermédiation ?", "Titre du tableau comparatif avec Substack"},
		{"comparison_tagline", "Pourquoi qoe.fi redéfinit l'édition indépendante", "Tagline du tableau comparatif avec Substack"},
		{"preview_title", "L'architecture du silence", "Titre de l'aperçu du produit (ProductPreview)"},
		{"preview_content", "Dans un monde saturé de stimuli, la lecture souveraine n'est pas un acte de consommation, mais une forme de résistance. C'est ici, dans ce Sanctuaire Elfique, que l'esprit retrouve sa trajectoire originelle, loin des algorithmes de capture de l'attention.", "Texte principal de l'aperçu du produit (ProductPreview)"},
		{"cta_title", "Prêt à habiter votre esprit ?", "Titre de l'appel à l'action final (CTA)"},
		{"cta_description", "Rejoignez un réseau où la qualité prime sur la quantité, et où votre attention est le bien le plus précieux.", "Description de l'appel à l'action final (CTA)"},
	}
	for _, c := range configs {
		if _, err := s.pool.Exec(ctx, `
			INSERT INTO "SystemConfig" ("key", value, description, "updatedAt")
			VALUES ($1, $2, $3, now())
			ON CONFLICT ("key") DO UPDATE SET value = $2, description = $3, "updatedAt" = now()`,
			c.key, c.value, c.description); err != nil {
			return fmt.Errorf("config %s: %w", c.key, err)
		}
	}
	return nil
}

// Seed exécute le seed canonique Go (internal/seed) — bouton « Pack Complet ».
func (s *Service) Seed(ctx context.Context, userID string) error {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return err
	}
	return seed.Run(ctx, s.pool)
}

// Reindex re-synchronise l'index Meilisearch (backfill idempotent : seuls les
// documents manquants sont upsertés). Retourne (total en base, upsertés).
func (s *Service) Reindex(ctx context.Context, userID string) (map[string]any, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return nil, err
	}
	total, upserted, err := workers.NewSearchWorker(s.pool).ReindexAll(ctx)
	if err != nil {
		return nil, err
	}
	return map[string]any{"success": true, "total": total, "upserted": upserted}, nil
}

// SeedTop régénère la DB « top du top » (wipe + génération déterministe) et
// enqueue les embeddings articles + users en asynchrone (asynq) pour ne pas
// bloquer la requête HTTP. L'umami est généré si UMAMI_DATABASE_URL est dispo.
func (s *Service) SeedTop(ctx context.Context, userID string) (map[string]any, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return nil, err
	}
	res, err := seed.RunTop(ctx, s.pool, seed.TopOptions{})
	if err != nil {
		return nil, err
	}

	out := map[string]any{
		"success": true, "users": len(res.Users), "articles": len(res.Articles),
		"posts": len(res.PostIDs), "readingSessions": res.ReadingSess,
		"follows": res.Follows, "likes": res.Likes, "subscribers": res.Subscribers,
	}

	// Embeddings asynchrones (articles + users) — le worker s'en charge.
	if ac := queue.NewClient(os.Getenv("REDIS_URL")); ac != nil {
		for _, a := range res.Articles {
			_ = queue.PublishArticleEmbedding(ac, queue.EmbeddingPayload{ArticleID: a.ID})
		}
		for _, u := range res.Users {
			_ = queue.PublishUserEmbedding(ac, queue.EmbeddingPayload{UserID: u.ID})
		}
		ac.Close()
		out["embeddingsEnqueued"] = len(res.Articles) + len(res.Users)
	}

	// Umami — pool séparé vers la DB analytics (best-effort).
	if dsn := os.Getenv("UMAMI_DATABASE_URL"); dsn != "" {
		umamiPool, err := pgxpool.New(ctx, dsn)
		if err == nil {
			defer umamiPool.Close()
			if err := seed.RunTopUmami(ctx, umamiPool, res, seed.TopOptions{}); err != nil {
				log.Printf("[devtools] umami seed: %v", err)
			} else {
				out["umami"] = "généré"
			}
		}
	}

	// Meili : reindex (le seed insère en SQL direct, sans passer par l'API).
	if _, _, err := workers.NewSearchWorker(s.pool).ReindexAll(ctx); err != nil {
		log.Printf("[devtools] reindex post-seed: %v", err)
	}

	return out, nil
}

// SeedTopComplete prépare une base de démonstration complète en une seule
// action : reset déterministe, monde vivant, contenu additif riche, embeddings
// via Redis et synchronisation Meilisearch/Umami.
func (s *Service) SeedTopComplete(ctx context.Context, userID string) (map[string]any, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return nil, err
	}
	res, err := seed.RunTop(ctx, s.pool, seed.TopOptions{})
	if err != nil {
		return nil, err
	}
	added, err := seed.AddTop(ctx, s.pool, seed.TopOptions{Articles: 200, Posts: 1480})
	if err != nil {
		return nil, err
	}
	res.Articles = append(res.Articles, added.Articles...)
	res.PostIDs = append(res.PostIDs, added.PostIDs...)
	// AddTop est exécuté après RunWorld : ses nouveaux articles réutilisent le
	// graphe existant, puis on rejoue la couche d'interactions dédiée pour que
	// les commentaires et lectures couvrent aussi le contenu additionnel.
	if err := seed.RunWorld(ctx, s.pool); err != nil {
		return nil, fmt.Errorf("world refresh: %w", err)
	}

	out := map[string]any{
		"success": true, "users": len(res.Users), "articles": len(res.Articles),
		"posts": len(res.PostIDs), "readingSessions": res.ReadingSess,
		"follows": res.Follows, "likes": res.Likes, "subscribers": res.Subscribers,
		"contentMode": "reset+additive",
	}
	if ac := queue.NewClient(os.Getenv("REDIS_URL")); ac != nil {
		for _, a := range res.Articles {
			_ = queue.PublishArticleEmbedding(ac, queue.EmbeddingPayload{ArticleID: a.ID})
		}
		for _, u := range res.Users {
			_ = queue.PublishUserEmbedding(ac, queue.EmbeddingPayload{UserID: u.ID})
		}
		ac.Close()
		out["embeddingsEnqueued"] = len(res.Articles) + len(res.Users)
	}
	if dsn := os.Getenv("UMAMI_DATABASE_URL"); dsn != "" {
		umamiPool, openErr := pgxpool.New(ctx, dsn)
		if openErr == nil {
			defer umamiPool.Close()
			if umamiErr := seed.RunTopUmami(ctx, umamiPool, res, seed.TopOptions{}); umamiErr == nil {
				out["umami"] = "généré"
			} else {
				log.Printf("[devtools] umami seed: %v", umamiErr)
			}
		}
	}
	if total, upserted, reindexErr := workers.NewSearchWorker(s.pool).ReindexAll(ctx); reindexErr == nil {
		out["meilisearch"] = map[string]int{"total": total, "upserted": upserted}
	} else {
		log.Printf("[devtools] reindex complete: %v", reindexErr)
	}
	return out, nil
}

// ---------------------------------------------------------------------------
// 🎭 Simulateurs (abonné, follow, like, fonds, onboarding)
// ---------------------------------------------------------------------------

// SimulateSubscriberParams alimente la simulation d'un abonné CRM.
type SimulateSubscriberParams struct {
	Email         string `json:"email"`
	PublicationID string `json:"publicationId"`
	IsPremium     bool   `json:"isPremium"`
	LtvCents      int    `json:"ltvCents"`
}

// SimulateSubscriber upsert un abonné (email + publication) et, si premium,
// crédite le portefeuille du propriétaire de la publication.
func (s *Service) SimulateSubscriber(ctx context.Context, userID string, p SimulateSubscriberParams) error {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return err
	}
	email := strings.ToLower(strings.TrimSpace(p.Email))
	if email == "" || p.PublicationID == "" {
		return errors.New("email et publicationId requis")
	}

	if _, err := s.pool.Exec(ctx, `
		INSERT INTO "Subscriber" (id, email, "publicationId", "isActive", "isPremium", "ltvCents", "createdAt", "updatedAt")
		VALUES (gen_random_uuid()::text, $1, $2, true, $3, $4, now(), now())
		ON CONFLICT ("email", "publicationId") DO UPDATE SET
		  "isActive" = true, "isPremium" = $3, "ltvCents" = "Subscriber"."ltvCents" + $4,
		  "updatedAt" = now()`,
		email, p.PublicationID, p.IsPremium, p.LtvCents); err != nil {
		return fmt.Errorf("subscriber: %w", err)
	}

	if p.IsPremium && p.LtvCents > 0 {
		// Transaction de portefeuille pour l'utilisateur lié à cet email (s'il existe).
		var userIDByEmail string
		err := s.pool.QueryRow(ctx,
			`SELECT id FROM "User" WHERE email = $1 LIMIT 1`, email).Scan(&userIDByEmail)
		if err == nil {
			if _, err := s.pool.Exec(ctx, `
				INSERT INTO "WalletTransaction" (id, "userId", "amountCents", type, "createdAt")
				VALUES (gen_random_uuid()::text, $1, $2, 'SUBSCRIPTION_PAYMENT', now())`,
				userIDByEmail, -p.LtvCents); err != nil {
				return fmt.Errorf("wallet tx (reader): %w", err)
			}
		}

		// Propriétaire de la publication (user direct ou owner du média).
		var ownerID *string
		err = s.pool.QueryRow(ctx, `
			SELECT u.id FROM "Publication" p
			JOIN "User" u ON u."publicationId" = p.id
			WHERE p.id = $1
			UNION
			SELECT mm."userId" FROM "Publication" p
			JOIN "Media" m ON m."publicationId" = p.id
			JOIN "MediaMember" mm ON mm."mediaId" = m.id AND mm.role = 'owner' AND mm.status = 'active'
			WHERE p.id = $1
			LIMIT 1`, p.PublicationID).Scan(&ownerID)
		if err == nil && ownerID != nil {
			if _, err := s.pool.Exec(ctx,
				`UPDATE "User" SET "walletBalanceCents" = "walletBalanceCents" + $2, "updatedAt" = now() WHERE id = $1`,
				*ownerID, p.LtvCents); err != nil {
				return fmt.Errorf("wallet balance (owner): %w", err)
			}
			if _, err := s.pool.Exec(ctx, `
				INSERT INTO "WalletTransaction" (id, "userId", "amountCents", type, "createdAt")
				VALUES (gen_random_uuid()::text, $1, $2, 'DEPOSIT', now())`,
				*ownerID, p.LtvCents); err != nil {
				return fmt.Errorf("wallet tx (owner): %w", err)
			}
		}
	}
	return nil
}

// SimulateFollow crée une liaison lecteur → publication (idempotent).
func (s *Service) SimulateFollow(ctx context.Context, userID, readerID, publicationID string) error {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return err
	}
	if readerID == "" || publicationID == "" {
		return errors.New("readerId et publicationId requis")
	}
	if _, err := s.pool.Exec(ctx, `
		INSERT INTO "Follows" (id, "readerId", "publicationId", "createdAt")
		VALUES (gen_random_uuid()::text, $1, $2, now())
		ON CONFLICT ("readerId", "publicationId") DO NOTHING`,
		readerID, publicationID); err != nil {
		return fmt.Errorf("follow: %w", err)
	}
	return nil
}

// SimulateLike bascule un like sur un post (retire s'il existe, sinon ajoute).
func (s *Service) SimulateLike(ctx context.Context, userID, postID, likerID string) (bool, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return false, err
	}
	if postID == "" || likerID == "" {
		return false, errors.New("postId et userId requis")
	}

	var existingID string
	err := s.pool.QueryRow(ctx,
		`SELECT id FROM "Like" WHERE "postId" = $1 AND "userId" = $2 LIMIT 1`,
		postID, likerID).Scan(&existingID)
	if err == nil {
		if _, err := s.pool.Exec(ctx, `DELETE FROM "Like" WHERE id = $1`, existingID); err != nil {
			return false, fmt.Errorf("like delete: %w", err)
		}
		_, _ = s.pool.Exec(ctx,
			`UPDATE "Post" SET "likeCount" = GREATEST("likeCount" - 1, 0) WHERE id = $1`, postID)
		return false, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return false, fmt.Errorf("like lookup: %w", err)
	}
	if _, err := s.pool.Exec(ctx, `
		INSERT INTO "Like" (id, "postId", "userId", "createdAt")
		VALUES (gen_random_uuid()::text, $1, $2, now())`,
		postID, likerID); err != nil {
		return false, fmt.Errorf("like insert: %w", err)
	}
	_, _ = s.pool.Exec(ctx,
		`UPDATE "Post" SET "likeCount" = "likeCount" + 1 WHERE id = $1`, postID)
	return true, nil
}

// AddFunds ajuste le portefeuille d'un utilisateur et journalise une transaction.
func (s *Service) AddFunds(ctx context.Context, userID, targetUserID string, amountCents int) (int, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return 0, err
	}
	if targetUserID == "" {
		return 0, errors.New("userId requis")
	}
	var balance int
	if err := s.pool.QueryRow(ctx, `
		UPDATE "User" SET "walletBalanceCents" = "walletBalanceCents" + $2, "updatedAt" = now()
		WHERE id = $1 RETURNING "walletBalanceCents"`,
		targetUserID, amountCents).Scan(&balance); err != nil {
		return 0, fmt.Errorf("wallet update: %w", err)
	}
	txType := "DEPOSIT"
	if amountCents < 0 {
		txType = "WITHDRAWAL"
	}
	if _, err := s.pool.Exec(ctx, `
		INSERT INTO "WalletTransaction" (id, "userId", "amountCents", type, "createdAt")
		VALUES (gen_random_uuid()::text, $1, $2, $3, now())`,
		targetUserID, amountCents, txType); err != nil {
		return 0, fmt.Errorf("wallet tx: %w", err)
	}
	return balance, nil
}

// ResetOnboarding remet hasCompletedOnboarding à false pour un utilisateur
// (ou pour tous si aucun identifiant n'est fourni).
func (s *Service) ResetOnboarding(ctx context.Context, userID, target string) error {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return err
	}
	if target != "" {
		if _, err := s.pool.Exec(ctx, `
			UPDATE "User" SET "hasCompletedOnboarding" = false, "updatedAt" = now()
			WHERE id = $1 OR lower(email) = lower($1::text)`, target); err != nil {
			return fmt.Errorf("reset onboarding: %w", err)
		}
		return nil
	}
	if _, err := s.pool.Exec(ctx, `
		UPDATE "User" SET "hasCompletedOnboarding" = false, "updatedAt" = now()`); err != nil {
		return fmt.Errorf("reset onboarding all: %w", err)
	}
	return nil
}

// UserByEmail retourne l'utilisateur correspondant (pour l'impersonation).
func (s *Service) UserByEmail(ctx context.Context, userID, email string) (*DevtoolsUser, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return nil, err
	}
	var u DevtoolsUser
	var createdAt time.Time
	err := s.pool.QueryRow(ctx, `
		SELECT id, name, email, username, role, NULL, NULL, NULL, NULL, "createdAt"
		FROM "User" WHERE lower(email) = lower($1) LIMIT 1`,
		strings.TrimSpace(email)).Scan(&u.ID, &u.Name, &u.Email, &u.Username, &u.Role,
		&u.Subdomain, &u.CustomDomain, &u.AccentColor, &u.LayoutStyle, &createdAt)
	if err != nil {
		return nil, err
	}
	u.CreatedAt = createdAt.Format(time.RFC3339)
	return &u, nil
}

func nullIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
