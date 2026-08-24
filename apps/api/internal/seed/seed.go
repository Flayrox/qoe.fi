// Package seed — données de démo (migration de packages/db/prisma/seed.ts).
//
// Parité exacte avec l'ancien seed Prisma : mêmes IDs (e2e), mêmes upserts
// (ON CONFLICT … DO UPDATE), mêmes données. Les ids des articles/navigations
// restent générés (gen_random_uuid) — seuls les identifiants d'e2e sont fixes.
package seed

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	AdminUserID = "85003f3c-924c-4b85-b796-8832bbf02e45"
	AdminPubID  = "pub_12345678123412341234123456789012"
	MediaPubID  = "pub_media_00000000000000000001"
	MediaID     = "media_00000000000000000001"
	MediaOwner  = "20000000-0000-0000-0000-000000000001"
	MediaEditor = "20000000-0000-0000-0000-000000000002"
	MediaWriter = "20000000-0000-0000-0000-000000000003"
	MediaViewer = "20000000-0000-0000-0000-000000000004"
)

// Run insère (ou met à jour) toutes les données de démo.
func Run(ctx context.Context, pool *pgxpool.Pool) error {
	// 0. Utilisateur admin (FK vers les articles/navigation/catégories).
	if err := upsertUser(ctx, pool, AdminUserID, "admin@qoe.fi", "Super Admin", "superadmin"); err != nil {
		return err
	}

	// 0b. Publication personnelle (identité tenant) + lien + certification.
	if _, err := pool.Exec(ctx, `
		INSERT INTO "Publication" (id, type, name, slug, subdomain, "createdAt", "updatedAt")
		VALUES ($1, 'PERSONAL', 'Super Admin', 'admin', 'admin', now(), now())
		ON CONFLICT (id) DO UPDATE SET name = 'Super Admin', slug = 'admin',
		  subdomain = 'admin', "updatedAt" = now()`, AdminPubID); err != nil {
		return fmt.Errorf("publication admin: %w", err)
	}
	if _, err := pool.Exec(ctx, `
		UPDATE "User" SET "publicationId" = $1, "updatedAt" = now() WHERE id = $2`,
		AdminPubID, AdminUserID); err != nil {
		return fmt.Errorf("lien user/publication: %w", err)
	}
	if _, err := pool.Exec(ctx, `
		UPDATE "Publication" SET "isCertified" = true, "updatedAt" = now() WHERE id = $1`,
		AdminPubID); err != nil {
		return fmt.Errorf("certification: %w", err)
	}

	// 0d. Média complet (publication MEDIA + équipe + article — requis par l'e2e).
	mediaUsers := []struct{ id, email, name, username, role string }{
		{MediaOwner, "directrice@media-clair.fr", "Camille Roux", "camilleroux", "creator"},
		{MediaEditor, "redac-chef@media-clair.fr", "Yann Delcourt", "yanndelcourt", "creator"},
		{MediaWriter, "journaliste@media-clair.fr", "Salomé Petit", "salomepetit", "creator"},
		{MediaViewer, "lectrice@media-clair.fr", "Inès Bernard", "inesbernard", "user"},
	}
	for _, u := range mediaUsers {
		if err := upsertUser(ctx, pool, u.id, u.email, u.name, u.role); err != nil {
			return err
		}
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO "Publication" (id, type, name, slug, subdomain, bio, "isCertified", "createdAt", "updatedAt")
		VALUES ($1, 'MEDIA', 'Le Média Clair', 'media-clair', 'media-clair',
		        'Un média local indépendant, financé par ses lecteurs.', true, now(), now())
		ON CONFLICT (id) DO UPDATE SET type = 'MEDIA', name = 'Le Média Clair',
		  slug = 'media-clair', subdomain = 'media-clair',
		  bio = 'Un média local indépendant, financé par ses lecteurs.',
		  "isCertified" = true, "updatedAt" = now()`, MediaPubID); err != nil {
		return fmt.Errorf("publication média: %w", err)
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO "Media" (id, "publicationId", "createdAt", "updatedAt")
		VALUES ($1, $2, now(), now())
		ON CONFLICT ("publicationId") DO UPDATE SET "updatedAt" = now()`,
		MediaID, MediaPubID); err != nil {
		return fmt.Errorf("media: %w", err)
	}

	mediaMembers := []struct {
		userID      string
		role        string
		permissions []string
	}{
		{MediaOwner, "owner", []string{"manage_members", "publish_any"}},
		{MediaEditor, "editor", []string{"publish_any"}},
		{MediaWriter, "writer", []string{}},
		{MediaViewer, "viewer", []string{}},
	}
	for _, m := range mediaMembers {
		if _, err := pool.Exec(ctx, `
			INSERT INTO "MediaMember" (id, "mediaId", "userId", role, permissions, status, "createdAt", "updatedAt")
			VALUES (gen_random_uuid()::text, $1, $2, $3, $4, 'active', now(), now())
			ON CONFLICT ("mediaId", "userId") DO UPDATE SET role = $3, permissions = $4,
			  status = 'active', "updatedAt" = now()`,
			MediaID, m.userID, m.role, m.permissions); err != nil {
			return fmt.Errorf("member %s: %w", m.userID, err)
		}
	}

	if err := UpsertArticle(ctx, pool, MediaPubID, MediaWriter,
		"enquete-locale-pouvoir",
		"Enquête : qui détient vraiment le pouvoir local ?",
		"<p>Six mois d'investigation sur les réseaux d'influence de notre région.</p><p>Un travail collectif de la rédaction, publié avec le soutien de nos abonnés.</p>",
		7, false, "PUBLIC", false); err != nil {
		return err
	}

	// 0e. Article Premium (paywall) — requis par l'e2e parcours lecture.
	if err := UpsertArticle(ctx, pool, AdminPubID, AdminUserID,
		"essai-premium-souverainete",
		"L'économie de l'attention, dix ans après",
		"<p>Premier paragraphe offert : le temps de lecture est une denrée rare.</p><p>Deuxième paragraphe offert : la plupart des plateformes en vivent.</p><!--paywall--><p>Ce passage est réservé aux abonnés premium de cette publication.</p><p>La suite de l'analyse est exclusive.</p>",
		9, true, "PAID_SUBSCRIBERS", false); err != nil {
		return err
	}

	// 0c. Articles démo (feed /home — requis par l'e2e).
	demoArticles := []struct {
		slug, title, content string
		editorPick           bool
	}{
		{"souverainete-medias-independants", "La souveraineté des médias indépendants",
			"<p>Dans un monde saturé de plateformes, posséder son propre espace de publication n'est plus un luxe : c'est une condition de survie éditoriale.</p><p>Cet article explore ce que signifie réellement être souverain sur son audience, son contenu et ses revenus.</p>",
			true},
		{"pourquoi-temps-long-gagne", "Pourquoi le temps long gagne toujours",
			"<p>L'économie de l'attention récompense le bruit. L'histoire, elle, récompense la constance.</p><p>Les médias qui écrivent pour durer finissent toujours par gagner la confiance de leur lectorat.</p>",
			false},
		{"architecture-du-silence-numerique", "L'architecture du silence numérique",
			"<p>Le silence n'est pas l'absence de contenu : c'est une architecture de lecture.</p><p>qoe.fi est construit autour de cette idée : moins d'interruptions, plus de sens.</p>",
			false},
	}
	for _, a := range demoArticles {
		if err := UpsertArticle(ctx, pool, AdminPubID, AdminUserID,
			a.slug, a.title, a.content, 4, false, "PUBLIC", a.editorPick); err != nil {
			return err
		}
	}

	// 1. Navigation (pas d'unicité → delete + insert pour l'idempotence).
	if _, err := pool.Exec(ctx, `DELETE FROM "NavigationItem" WHERE "publicationId" = $1`, AdminPubID); err != nil {
		return fmt.Errorf("navigation delete: %w", err)
	}
	navs := []struct {
		label, url string
		order      int32
	}{
		{"Accueil", "/", 1},
		{"Politique", "/category/politique", 2},
		{"Écologie", "/category/ecologie", 3},
		{"Notre Équipe", "/about", 4},
	}
	for _, n := range navs {
		if _, err := pool.Exec(ctx, `
			INSERT INTO "NavigationItem" (id, label, url, "order", "isExternal", "publicationId")
			VALUES (gen_random_uuid()::text, $1, $2, $3, false, $4)`,
			n.label, n.url, n.order, AdminPubID); err != nil {
			return fmt.Errorf("navigation insert: %w", err)
		}
	}

	// 2. Réseaux sociaux (idem : delete + insert).
	if _, err := pool.Exec(ctx, `DELETE FROM "SocialLink" WHERE "publicationId" = $1`, AdminPubID); err != nil {
		return fmt.Errorf("social delete: %w", err)
	}
	socials := []struct {
		platform, url string
		order         int32
	}{
		{"x", "https://twitter.com/mediamilitant", 1},
		{"bluesky", "https://bsky.app/profile/mediamilitant.bsky.social", 2},
		{"youtube", "https://youtube.com/mediamilitant", 3},
		{"mastodon", "https://mastodon.social/@mediamilitant", 4},
	}
	for _, s := range socials {
		if _, err := pool.Exec(ctx, `
			INSERT INTO "SocialLink" (id, platform, url, "order", "publicationId")
			VALUES (gen_random_uuid()::text, $1, $2, $3, $4)`,
			s.platform, s.url, s.order, AdminPubID); err != nil {
			return fmt.Errorf("social insert: %w", err)
		}
	}

	// 3. Catégories (Politique + International en enfant).
	var catPolitique string
	if err := pool.QueryRow(ctx, `
		INSERT INTO "Category" (id, name, slug, description, "publicationId")
		VALUES (gen_random_uuid()::text, 'Politique', 'politique', 'desc', $1)
		ON CONFLICT (slug, "publicationId") DO UPDATE SET name = 'Politique'
		RETURNING id`, AdminPubID).Scan(&catPolitique); err != nil {
		return fmt.Errorf("catégorie politique: %w", err)
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO "Category" (id, name, slug, description, "publicationId", "parentId")
		VALUES (gen_random_uuid()::text, 'International', 'international', 'desc', $1, $2)
		ON CONFLICT (slug, "publicationId") DO UPDATE SET name = 'International', "parentId" = $2`,
		AdminPubID, catPolitique); err != nil {
		return fmt.Errorf("catégorie international: %w", err)
	}

	// 4. SystemConfigs par défaut (landing page).
	configs := []struct {
		key, value, description string
	}{
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
		{"feature_wallet_desc", "Un portefeuille virtuel intégré permettant de soutenir vos auteurs préférés via WalletTransaction sans intermédiaire.", "Description de la fonctionnalité de micro-portefeuille dans la grille Bento"},
		{"feature_vector_desc", "Grâce à pgvector, notre IA brise votre bulle idéologique en injectant des perspectives radicalement différentes.", "Description de la fonctionnalité de sérendipité IA dans la grille Bento"},
		{"feature_monastic_desc", "Un carnet personnel numérique où vos Highlights deviennent la matière première de votre propre pensée.", "Description de la fonctionnalité de carnet personnel dans la grille Bento"},
		{"feature_sovereign_desc", "Aucun algorithme caché. Vous contrôlez chaque octet de votre expérience de lecture.", "Description de la souveraineté dans la grille Bento"},
	}
	for _, c := range configs {
		if _, err := pool.Exec(ctx, `
			INSERT INTO "SystemConfig" ("key", value, description, "updatedAt")
			VALUES ($1, $2, $3, now())
			ON CONFLICT ("key") DO UPDATE SET value = $2, description = $3, "updatedAt" = now()`,
			c.key, c.value, c.description); err != nil {
			return fmt.Errorf("config %s: %w", c.key, err)
		}
	}
	return nil
}

func upsertUser(ctx context.Context, pool *pgxpool.Pool, id, email, name, role string) error {
	_, err := pool.Exec(ctx, `
		INSERT INTO "User" (id, email, name, role, "createdAt", "updatedAt")
		VALUES ($1, $2, $3, $4, now(), now())
		ON CONFLICT (id) DO UPDATE SET email = $2, name = $3, role = $4, "updatedAt" = now()`,
		id, email, name, role)
	if err != nil {
		return fmt.Errorf("user %s: %w", id, err)
	}
	return nil
}

// UpsertArticle crée/met à jour un article publié (dédup publicationId + slug).
func UpsertArticle(ctx context.Context, pool *pgxpool.Pool, publicationID, authorID, slug, title, content string,
	readingTime int32, isPremium bool, visibility string, editorPick bool) error {
	_, err := pool.Exec(ctx, `
		INSERT INTO "Article" (id, title, slug, content, published, status, visibility,
		                       "isPremium", "isEditorPick", "readingTime", "publicationId", "authorId",
		                       "createdAt", "updatedAt")
		VALUES (gen_random_uuid()::text, $2, $3, $4, true, 'PUBLISHED', $5, $6, $7, $8, $1, $9,
		        now(), now())
		ON CONFLICT ("publicationId", slug) DO UPDATE SET
		  title = $2, content = $4, published = true, status = 'PUBLISHED', visibility = $5,
		  "isPremium" = $6, "isEditorPick" = $7, "updatedAt" = now()`,
		publicationID, title, slug, content, visibility, isPremium, editorPick, readingTime, authorID)
	if err != nil {
		return fmt.Errorf("article %s: %w", slug, err)
	}
	return nil
}
