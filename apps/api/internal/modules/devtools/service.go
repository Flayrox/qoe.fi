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
	"math"
	"os"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/qoefi/api/internal/queue"
	"github.com/qoefi/api/internal/seed"
	"github.com/qoefi/api/internal/workers"
)

var errForbidden = errors.New("réservé au superadmin")
var errSeedJobNotFound = errors.New("job de régénération inconnu")

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

	// Job de régénération asynchrone (un seul à la fois).
	jobMu sync.Mutex
	job   *SeedJob
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
// 🧹 Reset de la base (parité resetDatabaseAction)
// ---------------------------------------------------------------------------

// Reset vide la base dans un ordre sûr, puis ré-injecte les SystemConfig par
// défaut de la landing page.
func (s *Service) Reset(ctx context.Context, userID string) error {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return err
	}

	// Wipe via la liste UNIQUE partagée avec le seed (seed.WipeTables) : les
	// deux chemins de reset doivent vider exactement la même base, sinon des
	// résidus survivent (ReadingSession, ArticleSlugHistory, OAuth*…).
	if err := seed.WipeAll(ctx, s.pool); err != nil {
		return err
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
	// Catalogue du moteur feed + OAuth (mêmes clés que seed.RunSeed : le reset
	// et le seed doivent exposer exactement le même panel de réglages).
	for _, c := range seed.DefaultEngineConfigs() {
		if _, err := s.pool.Exec(ctx, `
			INSERT INTO "SystemConfig" ("key", value, description, "updatedAt")
			VALUES ($1, $2, $3, now())
			ON CONFLICT ("key") DO UPDATE SET value = $2, description = $3, "updatedAt" = now()`,
			c.Key, c.Value, c.Description); err != nil {
			return fmt.Errorf("config %s: %w", c.Key, err)
		}
	}
	return nil
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

// ---------------------------------------------------------------------------
// 🔎 Diagnostic embeddings (qualité de personnalisation par compte)
// ---------------------------------------------------------------------------

// EmbeddingTier classe la qualité de personnalisation d'un compte.
type EmbeddingTier string

const (
	TierColdStart EmbeddingTier = "cold_start"
	TierWeak      EmbeddingTier = "faible"
	TierDecent    EmbeddingTier = "correct"
	TierRich      EmbeddingTier = "riche"
)

// EmbeddingDiagnosticRow est la ligne de diagnostic d'un compte.
type EmbeddingDiagnosticRow struct {
	ID            string        `json:"id"`
	Username      string        `json:"username"`
	Name          string        `json:"name"`
	Email         string        `json:"email"`
	Role          string        `json:"role"`
	Thoughts      int           `json:"thoughts"`                // pensées publiées servant au profil (embedding non nul)
	PositiveReads int           `json:"positiveReads"`           // lectures à signal positif (COMPLETE/PARTIAL/SKIM)
	Bounces       int           `json:"bounces"`                 // lectures rebonds (facteur d'un profil froid)
	HasEmbedding  bool          `json:"hasEmbedding"`            // vecteur présent en base
	FreshnessDays *int          `json:"freshnessDays,omitempty"` // jours depuis la dernière activité (null = aucune)
	Quality       float64       `json:"quality"`                 // score de personnalisation 0..1
	Tier          EmbeddingTier `json:"tier"`
}

// EmbeddingDiagnostic est la sortie du diagnostic (synthèse + lignes triées).
type EmbeddingDiagnostic struct {
	Total     int                      `json:"total"`
	ColdStart int                      `json:"coldStart"`
	Weak      int                      `json:"weak"`
	Decent    int                      `json:"decent"`
	Rich      int                      `json:"rich"`
	Rows      []EmbeddingDiagnosticRow `json:"rows"`
}

// EmbeddingDiagnostic classe les comptes par qualité d'embedding. Contrat
// identique au worker prod (embed_test.go) : le vecteur d'un user = moyenne de
// SES pensées publiées, ou de ce qu'il lit à signal positif ; un compte sans
// aucune activité reste en cold start. La sortie expose qui est froid vs bien
// profilé pour piloter finement le seed / les filtres de recommandation.
func (s *Service) EmbeddingDiagnostic(ctx context.Context, userID string) (*EmbeddingDiagnostic, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return nil, err
	}

	rows, err := s.pool.Query(ctx, `
		SELECT u.id::text,
		       COALESCE(u.username, ''),
		       COALESCE(u.name, ''),
		       u.email,
		       u.role,
		       COALESCE(ps.thoughts, 0),
		       COALESCE(rs.positive_reads, 0),
		       COALESCE(rs.bounces, 0),
		       (u.embedding IS NOT NULL),
		       ps.last_post,
		       rs.last_read
		FROM "User" u
		LEFT JOIN (
			SELECT p."authorId" AS uid, COUNT(*)::int AS thoughts, MAX(p."createdAt") AS last_post
			FROM "Post" p
			WHERE p.embedding IS NOT NULL AND p."deletedAt" IS NULL
			  AND p."isDraft" = false AND p."isHiddenByAuthor" = false
			GROUP BY p."authorId"
		) ps ON ps.uid = u.id
		LEFT JOIN (
			SELECT rs."userId" AS uid,
			       COUNT(*) FILTER (WHERE rs.status IN ('READ_COMPLETE','READ_PARTIAL','SKIM'))::int AS positive_reads,
			       COUNT(*) FILTER (WHERE rs.status = 'BOUNCE')::int AS bounces,
			       MAX(rs."createdAt") AS last_read
			FROM "ReadingSession" rs
			GROUP BY rs."userId"
		) rs ON rs.uid = u.id`)
	if err != nil {
		return nil, fmt.Errorf("diagnostic embeddings: %w", err)
	}
	defer rows.Close()

	diag := &EmbeddingDiagnostic{Rows: []EmbeddingDiagnosticRow{}}
	for rows.Next() {
		var r EmbeddingDiagnosticRow
		var lastPost, lastRead *time.Time
		if err := rows.Scan(&r.ID, &r.Username, &r.Name, &r.Email, &r.Role,
			&r.Thoughts, &r.PositiveReads, &r.Bounces, &r.HasEmbedding,
			&lastPost, &lastRead); err != nil {
			return nil, err
		}

		// Fraîcheur : dernière activité (pensée publiée ou lecture).
		var last *time.Time
		switch {
		case lastPost != nil && lastRead != nil && lastRead.After(*lastPost):
			last = lastRead
		case lastPost != nil:
			last = lastPost
		case lastRead != nil:
			last = lastRead
		}
		if last != nil {
			days := int(time.Since(*last).Hours() / 24)
			if days < 0 {
				days = 0
			}
			r.FreshnessDays = &days
		}
		r.Quality, r.Tier = embeddingScore(r)

		diag.Rows = append(diag.Rows, r)
		diag.Total++
		switch r.Tier {
		case TierRich:
			diag.Rich++
		case TierDecent:
			diag.Decent++
		case TierWeak:
			diag.Weak++
		default:
			diag.ColdStart++
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Tri : qualité desc, puis volume de signal (pensées puis lectures).
	sort.Slice(diag.Rows, func(i, j int) bool {
		a, b := diag.Rows[i], diag.Rows[j]
		if a.Quality != b.Quality {
			return a.Quality > b.Quality
		}
		if a.Thoughts != b.Thoughts {
			return a.Thoughts > b.Thoughts
		}
		return a.PositiveReads > b.PositiveReads
	})
	return diag, nil
}

// embeddingScore évalue la richesse de personnalisation d'un compte : 0 =
// cold start (pas de vecteur), puis boost par les pensées publiées (signal le
// plus fort, 0..0.5), les lectures positives (0..0.3) et la fraîcheur (0..0.2).
// Le tier découle du vecteur présent + du volume de signal.
func embeddingScore(r EmbeddingDiagnosticRow) (float64, EmbeddingTier) {
	if !r.HasEmbedding {
		return 0, TierColdStart
	}
	postsBoost := math.Min(0.5, 0.1*float64(r.Thoughts))
	readsBoost := math.Min(0.3, 0.04*float64(r.PositiveReads))
	fresh := 0.0
	if r.FreshnessDays != nil {
		fresh = math.Max(0, 0.2*(1-float64(*r.FreshnessDays)/60.0))
	}
	q := math.Min(1, 0.2+postsBoost+readsBoost+fresh)
	q = math.Round(q*100) / 100

	var tier EmbeddingTier
	switch {
	case r.Thoughts >= 3:
		tier = TierRich
	case r.Thoughts > 0 || r.PositiveReads >= 10:
		tier = TierDecent
	default:
		tier = TierWeak
	}
	return q, tier
}

// SeedTopComplete prépare une base de démonstration complète (synchrone) :
// reset déterministe, monde vivant, contenu additif riche, embeddings via
// Redis et synchronisation Meilisearch/Umami. Utilisé par les tests ; le
// panneau devtools passe par StartSeedTopComplete (asynchrone avec suivi).
func (s *Service) SeedTopComplete(ctx context.Context, userID string) (map[string]any, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return nil, err
	}
	return runSeedTopComplete(ctx, s.pool, nil)
}

// ---------------------------------------------------------------------------
// 🔄 Régénération asynchrone avec suivi de progression (panneau devtools)
// ---------------------------------------------------------------------------

// SeedJob suit la progression d'une régénération de la DB lancée en
// arrière-plan. Un seul job actif à la fois (dev-only, mono-utilisateur).
type SeedJob struct {
	mu       sync.Mutex
	ID       string         `json:"id"`
	Done     bool           `json:"done"`
	Success  bool           `json:"success"`
	Error    string         `json:"error,omitempty"`
	Current  string         `json:"current,omitempty"`
	Steps    []string       `json:"steps"`
	Progress int            `json:"progress"`
	Result   map[string]any `json:"result,omitempty"`
	Updated  time.Time      `json:"updatedAt"`
}

const seedTotalSteps = 5

// markStep passe à l'étape suivante (l'étape en cours rejoint Steps).
func (j *SeedJob) markStep(label string) {
	j.mu.Lock()
	defer j.mu.Unlock()
	if j.Current != "" {
		j.Steps = append(j.Steps, j.Current)
	}
	j.Current = label
	j.Progress = len(j.Steps) * 100 / seedTotalSteps
	j.Updated = time.Now()
}

// finish clôt le job (succès ou échec) avec le résultat final.
func (j *SeedJob) finish(res map[string]any, err error) {
	j.mu.Lock()
	defer j.mu.Unlock()
	if j.Current != "" {
		j.Steps = append(j.Steps, j.Current)
		j.Current = ""
	}
	j.Done = true
	j.Progress = 100
	j.Updated = time.Now()
	if err != nil {
		j.Error = err.Error()
		return
	}
	j.Success = true
	j.Result = res
}

// Snapshot retourne une copie sûre du job (pour la sérialisation HTTP).
func (j *SeedJob) Snapshot() *SeedJob {
	j.mu.Lock()
	defer j.mu.Unlock()
	cp := &SeedJob{
		ID:       j.ID,
		Done:     j.Done,
		Success:  j.Success,
		Error:    j.Error,
		Current:  j.Current,
		Steps:    append([]string(nil), j.Steps...),
		Progress: j.Progress,
		Updated:  j.Updated,
	}
	if j.Result != nil {
		cp.Result = make(map[string]any, len(j.Result))
		for k, v := range j.Result {
			cp.Result[k] = v
		}
	}
	return cp
}

// StartSeedTopComplete lance la régénération complète en arrière-plan et
// retourne immédiatement le job (progression via SeedJobProgress). Si un job
// est déjà en cours, il est retourné tel quel (pas de double démarrage).
func (s *Service) StartSeedTopComplete(ctx context.Context, userID string) (*SeedJob, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return nil, err
	}
	s.jobMu.Lock()
	if s.job != nil && !s.job.Done {
		job := s.job
		s.jobMu.Unlock()
		return job.Snapshot(), nil
	}
	job := &SeedJob{ID: fmt.Sprintf("seed_%d", time.Now().UnixNano()), Steps: []string{}}
	s.job = job
	s.jobMu.Unlock()

	go func() {
		res, err := runSeedTopComplete(context.Background(), s.pool, job.markStep)
		job.finish(res, err)
	}()
	return job.Snapshot(), nil
}

// SeedJobProgress retourne l'état courant d'un job (404 si inconnu).
func (s *Service) SeedJobProgress(ctx context.Context, userID, jobID string) (*SeedJob, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return nil, err
	}
	s.jobMu.Lock()
	defer s.jobMu.Unlock()
	if s.job == nil || s.job.ID != jobID {
		return nil, errSeedJobNotFound
	}
	return s.job.Snapshot(), nil
}

// runSeedTopComplete exécute les étapes de la régénération complète. onStep
// (optionnel) est appelé au début de chaque étape pour suivre la progression.
func runSeedTopComplete(ctx context.Context, pool *pgxpool.Pool, onStep func(string)) (map[string]any, error) {
	step := func(label string) {
		if onStep != nil {
			onStep(label)
		}
		log.Printf("[devtools] seed-top-complete: %s", label)
	}

	step("Wipe + génération du volume (RunTop)")
	res, err := seed.RunTop(ctx, pool, seed.TopOptions{})
	if err != nil {
		return nil, err
	}

	step("Contenu additif (AddTop)")
	added, err := seed.AddTop(ctx, pool, seed.TopOptions{Articles: 200, Posts: 1480})
	if err != nil {
		return nil, err
	}
	res.Articles = append(res.Articles, added.Articles...)
	res.PostIDs = append(res.PostIDs, added.PostIDs...)

	// AddTop est exécuté après RunTop : ses nouveaux articles réutilisent le
	// graphe existant, puis on rejoue la couche d'interactions dédiée pour que
	// les commentaires et lectures couvrent aussi le contenu additionnel.
	step("Monde vivant (RunWorld)")
	if err := seed.RunWorld(ctx, pool); err != nil {
		return nil, fmt.Errorf("world refresh: %w", err)
	}

	// Embeddings SYNCHRONES (articles + posts + users) : le devtools devrait
	// produire une base prête à l'emploi — vecteurs calculés et persistés en
	// dur ici, et non pas délégués à un worker qui tourne après coup. La file
	// Redis ci-dessous reste en recours pour couvrir ce qui aurait échoué.
	step("Embeddings (synchrone, persistés en DB)")
	_, _, embedErr := seed.EmbedTop(ctx, pool, res, os.Getenv("EMBEDDING_URL"))
	if embedErr != nil {
		log.Printf("[devtools] embeddings synchrones: %v", embedErr)
	}
	embeddingsSynced := embedErr == nil && os.Getenv("EMBEDDING_URL") != ""

	// RunWorld crée aussi du contenu, mais ne renvoie pas ses IDs. Les
	// vecteurs manquants (embedding encore NULL après le passe synchrone)
	// sont enqueuées pour que le worker les calcule en background.
	step("Embeddings (enqueue Redis)")
	if err := enqueueMissingEmbeddings(ctx, pool); err != nil {
		log.Printf("[devtools] enqueue missing embeddings: %v", err)
	}

	out := map[string]any{
		"success": true, "users": len(res.Users), "articles": len(res.Articles),
		"posts": len(res.PostIDs), "readingSessions": res.ReadingSess,
		"follows": res.Follows, "likes": res.Likes, "subscribers": res.Subscribers,
		"embeddingsSynced": embeddingsSynced,
		"contentMode":      "reset+additive",
	}
	if ac := queue.NewClient(os.Getenv("REDIS_URL")); ac != nil {
		queued := 0
		for _, a := range res.Articles {
			if err := queue.PublishArticleEmbedding(ac, queue.EmbeddingPayload{ArticleID: a.ID}); err == nil {
				queued++
			}
		}
		for _, u := range res.Users {
			if err := queue.PublishUserEmbedding(ac, queue.EmbeddingPayload{UserID: u.ID}); err == nil {
				queued++
			}
		}
		ac.Close()
		out["embeddingsEnqueued"] = queued
	}
	if dsn := os.Getenv("UMAMI_DATABASE_URL"); dsn != "" {
		step("Umami (analytics)")
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
	step("Meilisearch (reindex)")
	searchWorker := workers.NewSearchWorker(pool)
	// La DB vient d'être régénérée : l'index doit être vidé d'abord, sinon
	// ReindexAll (idempotent par ID, seed déterministe) ne remplacerait rien.
	searchWorker.ClearAll(ctx)
	if total, upserted, reindexErr := searchWorker.ReindexAll(ctx); reindexErr == nil {
		out["meilisearch"] = map[string]int{"total": total, "upserted": upserted}
	} else {
		log.Printf("[devtools] reindex complete: %v", reindexErr)
	}
	return out, nil
}

func enqueueMissingEmbeddings(ctx context.Context, pool *pgxpool.Pool) error {
	client := queue.NewClient(os.Getenv("REDIS_URL"))
	if client == nil {
		return errors.New("REDIS_URL non configuré")
	}
	defer client.Close()
	rows, err := pool.Query(ctx, `SELECT id FROM "Article" WHERE embedding IS NULL`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err == nil {
			_ = queue.PublishArticleEmbedding(client, queue.EmbeddingPayload{ArticleID: id})
		}
	}
	rows.Close()
	rows, err = pool.Query(ctx, `SELECT id FROM "User" WHERE embedding IS NULL`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err == nil {
			_ = queue.PublishUserEmbedding(client, queue.EmbeddingPayload{UserID: id})
		}
	}
	rows.Close()
	rows, err = pool.Query(ctx, `SELECT id FROM "Post"
		WHERE embedding IS NULL AND "deletedAt" IS NULL
		  AND "isDraft" = false AND "isHiddenByAuthor" = false`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err == nil {
			_ = queue.PublishPostEmbedding(client, queue.EmbeddingPayload{PostID: id})
		}
	}
	return rows.Err()
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
		// id::text : le paramètre peut être un id UUID OU un email — comparer en
		// texte évite l'inférence de type uuid qui casse le lookup par email.
		if _, err := s.pool.Exec(ctx, `
			UPDATE "User" SET "hasCompletedOnboarding" = false, "updatedAt" = now()
			WHERE id::text = $1 OR lower(email) = lower($1::text)`, target); err != nil {
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
