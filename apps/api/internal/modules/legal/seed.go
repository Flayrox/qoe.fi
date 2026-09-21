package legal

import (
	"context"
	"embed"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
)

// Le contenu légal de référence est embarqué dans le binaire : un déploiement
// ne peut pas laisser la plateforme sans CGU ni politique de confidentialité.
// Après le seed, tout passe par la console superadmin (versions + publication).
//
// Chaque document existe en français (source de référence) et en anglais : un
// lecteur anglophone doit pouvoir lire les conditions qu'il accepte, et toute
// nouvelle locale est installée sans redéploiement manuel.
//
//go:embed content/*.md
var contentFS embed.FS

type seedVersion struct {
	Locale    string
	Version   string
	Title     string
	Summary   string
	Changelog string
	File      string
}

type seedDoc struct {
	Slug               string
	Category           string
	Audience           string
	RequiresAcceptance bool
	SortOrder          int32
	Versions           []seedVersion
}

// SeedResult résume un seed (idempotent).
type SeedResult struct {
	Created  int      `json:"created"`
	Enriched int      `json:"enriched"`
	Skipped  int      `json:"skipped"`
	Versions int      `json:"versions"`
	Missing  []string `json:"missing,omitempty"`
}

// seedManifest est le plan éditorial légal de qoefi, en français et en
// anglais. L'ordre (SortOrder) est celui d'affichage public.
func seedManifest() []seedDoc {
	return []seedDoc{
		{
			Slug: "mentions-legales", Category: "legal", Audience: "all", SortOrder: 10,
			Versions: []seedVersion{
				{
					Locale: "fr", Version: "1.0.0",
					Title:   "Mentions légales",
					Summary: "Éditeur, direction de la publication, hébergement, propriété intellectuelle et signalements.",
					File:    "content/mentions-legales.fr.md",
				},
				{
					Locale: "en", Version: "1.0.0",
					Title:   "Legal notice",
					Summary: "Publisher, publication manager, hosting, intellectual property and reporting.",
					File:    "content/mentions-legales.en.md",
				},
			},
		},
		{
			Slug: "conditions-generales-utilisation", Category: "legal", Audience: "all",
			RequiresAcceptance: true, SortOrder: 20,
			Versions: []seedVersion{
				{
					Locale: "fr", Version: "1.0.0",
					Title:   "Conditions générales d'utilisation",
					Summary: "Règles d'usage du service : compte, contenus, modération DSA, responsabilité et résiliation.",
					File:    "content/conditions-generales-utilisation.fr.md",
				},
				{
					Locale: "en", Version: "1.0.0",
					Title:   "Terms of service",
					Summary: "Rules for using the service: account, content, DSA moderation, liability and termination.",
					File:    "content/conditions-generales-utilisation.en.md",
				},
			},
		},
		{
			Slug: "politique-confidentialite", Category: "privacy", Audience: "all",
			RequiresAcceptance: true, SortOrder: 30,
			Versions: []seedVersion{
				{
					Locale: "fr", Version: "1.0.0",
					Title:   "Politique de confidentialité",
					Summary: "Données collectées, bases légales, durées de conservation, droits RGPD et transferts.",
					File:    "content/politique-confidentialite.fr.md",
				},
				{
					Locale: "en", Version: "1.0.0",
					Title:   "Privacy policy",
					Summary: "Data collected, legal bases, retention periods, GDPR rights and transfers.",
					File:    "content/politique-confidentialite.en.md",
				},
			},
		},
		{
			Slug: "politique-cookies", Category: "privacy", Audience: "all", SortOrder: 40,
			Versions: []seedVersion{
				{
					Locale: "fr", Version: "1.0.0",
					Title:   "Politique de cookies",
					Summary: "Traceurs utilisés, finalités, durées et retrait du consentement.",
					File:    "content/politique-cookies.fr.md",
				},
				{
					Locale: "en", Version: "1.0.0",
					Title:   "Cookie policy",
					Summary: "Trackers in use, purposes, durations and how to withdraw consent.",
					File:    "content/politique-cookies.en.md",
				},
			},
		},
		{
			Slug: "conditions-generales-de-vente", Category: "commerce", Audience: "subscribers",
			RequiresAcceptance: true, SortOrder: 50,
			Versions: []seedVersion{
				{
					Locale: "fr", Version: "1.0.0",
					Title:   "Conditions générales de vente",
					Summary: "Abonnements lecteurs : prix, TVA, rétractation, résiliation et remboursements.",
					File:    "content/conditions-generales-de-vente.fr.md",
				},
				{
					Locale: "en", Version: "1.0.0",
					Title:   "Terms of sale",
					Summary: "Reader subscriptions: pricing, VAT, withdrawal, cancellation and refunds.",
					File:    "content/conditions-generales-de-vente.en.md",
				},
			},
		},
		{
			Slug: "accord-createur", Category: "creator", Audience: "creators",
			RequiresAcceptance: true, SortOrder: 60,
			Versions: []seedVersion{
				{
					Locale: "fr", Version: "1.0.0",
					Title:   "Accord créateur",
					Summary: "Répartition des revenus, versements, fiscalité et obligations éditoriales des créateurs.",
					File:    "content/accord-createur.fr.md",
				},
				{
					Locale: "en", Version: "1.0.0",
					Title:   "Creator agreement",
					Summary: "Revenue split, payouts, taxation and editorial obligations for creators.",
					File:    "content/accord-createur.en.md",
				},
			},
		},
		{
			Slug: "accord-traitement-donnees", Category: "privacy", Audience: "media", SortOrder: 70,
			Versions: []seedVersion{
				{
					Locale: "fr", Version: "1.0.0",
					Title:   "Accord de traitement des données (DPA)",
					Summary: "Article 28 RGPD : obligations du sous-traitant, sous-traitants ultérieurs, transferts, sort des données.",
					File:    "content/accord-traitement-donnees.fr.md",
				},
				{
					Locale: "en", Version: "1.0.0",
					Title:   "Data processing agreement (DPA)",
					Summary: "Article 28 GDPR: processor obligations, further sub-processors, transfers, fate of the data.",
					File:    "content/accord-traitement-donnees.en.md",
				},
			},
		},
		{
			Slug: "sous-traitants", Category: "security", Audience: "all", SortOrder: 80,
			Versions: []seedVersion{
				{
					Locale: "fr", Version: "1.0.0",
					Title:   "Sous-traitants",
					Summary: "Registre public des sous-traitants, localisations et encadrement des transferts.",
					File:    "content/sous-traitants.fr.md",
				},
				{
					Locale: "en", Version: "1.0.0",
					Title:   "Sub-processors",
					Summary: "Public register of sub-processors, locations and transfer safeguards.",
					File:    "content/sous-traitants.en.md",
				},
			},
		},
		{
			Slug: "politique-utilisation-acceptable", Category: "legal", Audience: "all",
			RequiresAcceptance: true, SortOrder: 90,
			Versions: []seedVersion{
				{
					Locale: "fr", Version: "1.0.0",
					Title:   "Politique d'utilisation acceptable",
					Summary: "Contenus et comportements interdits, règles d'API, emails, sanctions graduées.",
					File:    "content/politique-utilisation-acceptable.fr.md",
				},
				{
					Locale: "en", Version: "1.0.0",
					Title:   "Acceptable use policy",
					Summary: "Prohibited content and behaviour, API rules, email rules, graduated sanctions.",
					File:    "content/politique-utilisation-acceptable.en.md",
				},
			},
		},
		{
			Slug: "engagement-accessibilite", Category: "legal", Audience: "all", SortOrder: 100,
			Versions: []seedVersion{
				{
					Locale: "fr", Version: "1.0.0",
					Title:   "Engagement d'accessibilité",
					Summary: "Conformité WCAG 2.2 AA, non-conformités connues et voies de recours.",
					File:    "content/engagement-accessibilite.fr.md",
				},
				{
					Locale: "en", Version: "1.0.0",
					Title:   "Accessibility commitment",
					Summary: "WCAG 2.2 AA compliance, known non-conformities and remedies.",
					File:    "content/engagement-accessibilite.en.md",
				},
			},
		},
	}
}

// SeedDefaults installe les documents absents depuis le contenu embarqué.
// Idempotent : un document déjà présent (même inactif) n'est jamais touché —
// le contenu publié appartient à l'éditeur, pas au seed.
func (s *Service) SeedDefaults(ctx context.Context, actor string) (*SeedResult, error) {
	if err := s.checkSuperadmin(ctx, actor); err != nil {
		return nil, err
	}
	return s.seed(ctx, actor)
}

// EnsureSeeded installe le contenu embarqué au démarrage quand la base ne
// contient encore aucun document juridique (premier déploiement, base de test),
// et complète les locales manquantes sur un contenu existant (par exemple
// l'anglais arrivé après le français). Aucune garde superadmin : le binaire est
// déployé par l'éditeur lui-même, et une plateforme ne doit jamais servir des
// pages légales vides — CGU absentes = service illégal (art. 6 LCEN),
// informations RGPD manquantes (art. 12).
func (s *Service) EnsureSeeded(ctx context.Context) (*SeedResult, error) {
	return s.seed(ctx, "")
}

// seed exécute l'amorçage (l'appelant a déjà vérifié les droits).
//
// Deux cas, dans le même passage :
//   - le document n'existe pas → création complète (toutes ses locales) ;
//   - le document existe mais une locale du manifeste est absente → elle est
//     ajoutée. Une locale déjà travaillée (publiée, archivée ou même brouillon)
//     n'est JAMAIS touchée : la décision éditoriale prime sur le seed.
//
// La première version de chaque locale est publiée d'emblée : un lecteur
// anglophone ne doit pas tomber sur une page vide parce qu'une traduction
// attend une validation.
func (s *Service) seed(ctx context.Context, actor string) (*SeedResult, error) {
	res := &SeedResult{}
	now := time.Now()

	for _, doc := range seedManifest() {
		existing, err := s.q.GetLegalDocumentBySlug(ctx, doc.Slug)
		switch {
		case err == nil:
			if err := s.seedMissingLocales(ctx, actor, doc, existing.ID, now, res); err != nil {
				return nil, err
			}
			continue
		case !errors.Is(err, pgx.ErrNoRows):
			return nil, err
		}

		if created, err := s.seedNewDocument(ctx, actor, doc, now, res); err != nil {
			return nil, err
		} else if !created {
			continue
		}
	}

	s.audit(ctx, actor, "legal.seed", "", map[string]any{
		"created": res.Created, "enriched": res.Enriched,
		"skipped": res.Skipped, "versions": res.Versions,
	})
	return res, nil
}

// renderedVersion associe une version du manifeste à son corps markdown rendu.
type renderedVersion struct {
	seedVersion
	Body string
}

// renderVersions lit le contenu embarqué hors transaction (le disque n'a rien
// à faire dans une transaction) et signale les fichiers manquants.
func renderVersions(declared []seedVersion, now time.Time, res *SeedResult) []renderedVersion {
	var versions []renderedVersion
	for _, v := range declared {
		raw, err := contentFS.ReadFile(v.File)
		if err != nil {
			res.Missing = append(res.Missing, v.File)
			continue
		}
		versions = append(versions, renderedVersion{seedVersion: v, Body: renderContent(string(raw), now)})
	}
	return versions
}

// seedNewDocument crée un document et toutes ses locales. Retourne false quand
// rien n'a pu être installé (contenu embarqué introuvable ou course concurrente).
func (s *Service) seedNewDocument(
	ctx context.Context,
	actor string,
	doc seedDoc,
	now time.Time,
	res *SeedResult,
) (bool, error) {
	versions := renderVersions(doc.Versions, now, res)
	if len(versions) == 0 {
		res.Missing = append(res.Missing, doc.Slug)
		return false, nil
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.q.WithTx(tx)

	inserted, err := q.InsertLegalDocument(ctx, db.InsertLegalDocumentParams{
		Slug: doc.Slug, Category: doc.Category, Audience: doc.Audience,
		RequiresAcceptance: doc.RequiresAcceptance, IsActive: true, SortOrder: doc.SortOrder,
	})
	if err != nil {
		// Course entre deux seeds concurrents : le document existe déjà.
		if isUniqueViolation(err) {
			res.Skipped++
			return false, nil
		}
		return false, fmt.Errorf("seed %s: %w", doc.Slug, err)
	}

	if err := insertVersionsTx(ctx, q, actor, inserted.ID, versions, res); err != nil {
		return false, fmt.Errorf("seed %s: %w", doc.Slug, err)
	}
	if err := tx.Commit(ctx); err != nil {
		return false, err
	}
	res.Created++
	return true, nil
}

// seedMissingLocales complète un document existant avec les locales du
// manifeste qui n'ont aucune version en base. Les locales présentes sont
// laissées intactes, quel que soit leur statut.
func (s *Service) seedMissingLocales(
	ctx context.Context,
	actor string,
	doc seedDoc,
	documentID string,
	now time.Time,
	res *SeedResult,
) error {
	rows, err := s.q.ListLegalDocumentVersions(ctx, documentID)
	if err != nil {
		return err
	}
	known := make(map[string]bool, len(rows))
	for _, row := range rows {
		known[strings.ToLower(row.Locale)] = true
	}

	missing := make([]seedVersion, 0, len(doc.Versions))
	for _, v := range doc.Versions {
		if !known[strings.ToLower(v.Locale)] {
			missing = append(missing, v)
		}
	}
	if len(missing) == 0 {
		res.Skipped++
		return nil
	}

	rendered := renderVersions(missing, now, res)
	if len(rendered) == 0 {
		res.Skipped++
		return nil
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.q.WithTx(tx)

	if err := insertVersionsTx(ctx, q, actor, documentID, rendered, res); err != nil {
		return fmt.Errorf("complétion %s: %w", doc.Slug, err)
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	res.Enriched++
	return nil
}

// insertVersionsTx publie la première version de chaque locale et laisse les
// suivantes en brouillon. L'ordre compte : l'index unique partiel refuse deux
// versions PUBLISHED pour un même couple (document, locale).
func insertVersionsTx(
	ctx context.Context,
	q *db.Queries,
	actor, documentID string,
	versions []renderedVersion,
	res *SeedResult,
) error {
	publishedLocale := make(map[string]bool, len(versions))
	for _, v := range versions {
		row, err := q.InsertLegalDocumentVersion(ctx, db.InsertLegalDocumentVersionParams{
			DocumentID:  documentID,
			Locale:      NormalizeLocale(v.Locale),
			Version:     v.Version,
			Title:       v.Title,
			Summary:     v.Summary,
			Body:        v.Body,
			Changelog:   optText(v.Changelog),
			EffectiveAt: pgTimestamp(time.Now()),
			CreatedBy:   toUUID(actor),
		})
		if err != nil {
			return err
		}
		res.Versions++

		locale := strings.ToLower(row.Locale)
		if publishedLocale[locale] {
			continue
		}
		if err := publishTx(ctx, q, row.ID, documentID, row.Locale); err != nil {
			return err
		}
		publishedLocale[locale] = true
	}
	return nil
}

func pgTimestamp(t time.Time) pgtype.Timestamp { return pgtype.Timestamp{Time: t, Valid: true} }

// renderContent remplace les variables de gabarit du contenu embarqué.
// Seules les variables connues sont substituées : le contenu reste du markdown
// pur, éditable ensuite depuis la console.
func renderContent(raw string, now time.Time) string {
	repl := strings.NewReplacer(
		"{{updatedAt}}", now.Format("02/01/2006"),
		"{{effectiveAt}}", now.Format("02/01/2006"),
		"{{year}}", fmt.Sprintf("%d", now.Year()),
	)
	return strings.TrimSpace(repl.Replace(raw)) + "\n"
}
