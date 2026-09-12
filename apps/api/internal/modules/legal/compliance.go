package legal

// =====================================================================
// 🛡️ Compliance — la vue qui répond à « est-ce qu'on est en règle, là, tout de suite ? »
// =====================================================================
// Le contenu juridique peut être publié et pourtant la plateforme rester hors
// des clous : un document « à accepter » sans version publiée, une majorité
// d'utilisateurs qui n'ont jamais confirmé la version courante, une politique
// que personne n'a relue depuis 14 mois… Le tableau de bord transforme ces
// angles morts en signaux explicites, avec la référence légale en clair.
//
// Les échéances ne sont pas saisies à la main : elles sont dérivées de la date
// de dernière publication de chaque document. Une revue annuelle repart donc
// automatiquement du jour où le texte a réellement été republié — impossible
// d'oublier de remettre le compteur à zéro.
// =====================================================================

import (
	"context"
	"time"
)

// Seuils d'alerte (jours) d'une échéance réglementaire.
const (
	obligationDueSoonDays = 30
	// Couverture en dessous de laquelle un document « à accepter » est signalé.
	complianceLowCoverage = 60
)

// ComplianceDocument décrit l'état d'un document sur l'axe conformité.
type ComplianceDocument struct {
	ID                 string     `json:"id"`
	Slug               string     `json:"slug"`
	Category           string     `json:"category"`
	Audience           string     `json:"audience"`
	RequiresAcceptance bool       `json:"requiresAcceptance"`
	IsActive           bool       `json:"isActive"`
	PublishedVersion   string     `json:"publishedVersion"`
	PublishedLocales   int64      `json:"publishedLocales"`
	DistinctLocales    int64      `json:"distinctLocales"`
	DraftsCount        int64      `json:"draftsCount"`
	TotalAcceptances   int64      `json:"totalAcceptances"`
	CurrentAcceptances int64      `json:"currentAcceptances"`
	CoveragePercent    int        `json:"coveragePercent"`
	LastPublishedAt    *time.Time `json:"lastPublishedAt,omitempty"`
	LastAcceptedAt     *time.Time `json:"lastAcceptedAt,omitempty"`
	Status             string     `json:"status"`
	Issues             []string   `json:"issues"`
}

// Obligation est une échéance réglementaire suivie.
type Obligation struct {
	Key         string     `json:"key"`
	Label       string     `json:"label"`
	Document    string     `json:"document"`
	Legal       string     `json:"legal"`
	CadenceDays int        `json:"cadenceDays"`
	LastDone    *time.Time `json:"lastDone,omitempty"`
	NextDue     *time.Time `json:"nextDue,omitempty"`
	DaysLeft    *int       `json:"daysLeft,omitempty"`
	Status      string     `json:"status"` // ok | soon | overdue | unknown
}

// ComplianceSummary est le verdict global du tableau de bord.
type ComplianceSummary struct {
	Score               int `json:"score"`
	Critical            int `json:"critical"`
	Warning             int `json:"warning"`
	DocumentsTracked    int `json:"documentsTracked"`
	MissingPublications int `json:"missingPublications"`
	OverdueObligations  int `json:"overdueObligations"`
}

// ComplianceSnapshot est la réponse complète du tableau de bord.
type ComplianceSnapshot struct {
	GeneratedAt        time.Time               `json:"generatedAt"`
	Documents          []ComplianceDocument    `json:"documents"`
	Obligations        []Obligation            `json:"obligations"`
	Notices            []LegalNotice           `json:"notices"`
	CookieConsent      *CookieConsentStatsView `json:"cookieConsent,omitempty"`
	EligibleUsers      int64                   `json:"eligibleUsers"`
	CreatorUsers       int64                   `json:"creatorUsers"`
	UsersWithGaps      int64                   `json:"usersWithGaps"`
	PendingAcceptances int64                   `json:"pendingAcceptances"`
	Summary            ComplianceSummary       `json:"summary"`
}

// obligationRule attache une cadence de revue à un document publié.
type obligationRule struct {
	Key      string
	Label    string
	Document string
	Legal    string
	Cadence  time.Duration
}

// obligationRules est le registre des revues périodiques. La référence légale
// est affichée telle quelle : l'éditeur doit pouvoir vérifier pourquoi cette
// échéance existe sans fouiller le code.
func obligationRules() []obligationRule {
	return []obligationRule{
		{
			Key: "cookies-review", Label: "Revue de la politique de cookies",
			Document: "politique-cookies", Cadence: 183 * 24 * time.Hour,
			Legal: "art. 82 loi Informatique et Libertés — le choix traceurs est redemandé tous les 6 mois",
		},
		{
			Key: "privacy-review", Label: "Revue de la politique de confidentialité",
			Document: "politique-confidentialite", Cadence: 365 * 24 * time.Hour,
			Legal: "art. 13-14 RGPD — information à tenir à jour",
		},
		{
			Key: "terms-review", Label: "Revue des conditions générales d'utilisation",
			Document: "conditions-generales-utilisation", Cadence: 365 * 24 * time.Hour,
			Legal: "art. 6 LCEN — accessibilité des conditions d'utilisation",
		},
		{
			Key: "accessibility-review", Label: "Revue de l'engagement d'accessibilité",
			Document: "engagement-accessibilite", Cadence: 365 * 24 * time.Hour,
			Legal: "art. 47 loi n° 2005-102 — schéma pluriannuel et déclaration annuelle",
		},
		{
			Key: "subprocessors-review", Label: "Revue du registre des sous-traitants",
			Document: "sous-traitants", Cadence: 365 * 24 * time.Hour,
			Legal: "art. 28 RGPD — tenue du registre et information des responsables de traitement",
		},
		{
			Key: "dpa-review", Label: "Revue du DPA créateurs et médias",
			Document: "accord-traitement-donnees", Cadence: 365 * 24 * time.Hour,
			Legal: "art. 28 RGPD — encadrement du sous-traitant",
		},
	}
}

// Compliance construit la photographie de conformité. Réservé au superadmin.
func (s *Service) Compliance(ctx context.Context, actor string) (*ComplianceSnapshot, error) {
	if err := s.checkSuperadmin(ctx, actor); err != nil {
		return nil, err
	}

	rows, err := s.q.ListLegalComplianceDocuments(ctx)
	if err != nil {
		return nil, err
	}
	users, err := s.q.CountLegalEligibleUsers(ctx)
	if err != nil {
		return nil, err
	}
	gaps, err := s.q.CountLegalConsentGaps(ctx)
	if err != nil {
		return nil, err
	}
	cookieStats, err := s.q.CookieConsentStats(ctx)
	if err != nil {
		return nil, err
	}
	noticeRows, err := s.q.ListLegalNoticesAdmin(ctx, 20)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	snapshot := &ComplianceSnapshot{
		GeneratedAt:        now,
		Documents:          make([]ComplianceDocument, 0, len(rows)),
		Notices:            make([]LegalNotice, 0, len(noticeRows)),
		EligibleUsers:      users.Eligible,
		CreatorUsers:       users.Creators,
		UsersWithGaps:      gaps.UsersWithGaps,
		PendingAcceptances: gaps.PendingAcceptances,
		CookieConsent: &CookieConsentStatsView{
			Total: cookieStats.Total, Last30d: cookieStats.Last30d,
			DistinctBrowsers: cookieStats.DistinctBrowsers,
			AnalyticsOptIn:   cookieStats.AnalyticsOptIn, AnalyticsOptOut: cookieStats.AnalyticsOptOut,
			LastChoiceAt: tsTime(cookieStats.LastChoiceAt),
		},
	}

	lastPublished := make(map[string]time.Time, len(rows))
	for _, r := range rows {
		doc := ComplianceDocument{
			ID: r.ID, Slug: r.Slug, Category: r.Category, Audience: r.Audience,
			RequiresAcceptance: r.RequiresAcceptance, IsActive: r.IsActive,
			PublishedVersion: r.PublishedVersion, PublishedLocales: r.PublishedLocales,
			DistinctLocales: r.DistinctLocales, DraftsCount: r.DraftsCount,
			TotalAcceptances: r.TotalAcceptances, CurrentAcceptances: r.CurrentAcceptances,
			LastPublishedAt: tsTime(r.LastPublishedAt), LastAcceptedAt: tsTime(r.LastAcceptedAt),
			Issues: make([]string, 0, 4),
		}
		if doc.LastPublishedAt != nil {
			lastPublished[doc.Slug] = *doc.LastPublishedAt
		}
		doc.CoveragePercent, doc.Status, doc.Issues = evaluateDocument(doc, users.Eligible)
		snapshot.Documents = append(snapshot.Documents, doc)
		if doc.Status == "critical" {
			snapshot.Summary.Critical++
			if doc.RequiresAcceptance && doc.PublishedLocales == 0 {
				snapshot.Summary.MissingPublications++
			}
		} else if doc.Status == "warning" {
			snapshot.Summary.Warning++
		}
	}
	snapshot.Summary.DocumentsTracked = len(snapshot.Documents)

	for _, r := range noticeRows {
		snapshot.Notices = append(snapshot.Notices, LegalNotice{
			ID: r.ID, DocumentID: r.DocumentID, DocumentSlug: r.DocumentSlug,
			VersionID: r.VersionID, Version: r.Version, Locale: r.Locale,
			Title: r.Title, Changelog: textPtr(r.Changelog), PortalPath: r.PortalPath,
			CreatedAt:  tsTime(r.CreatedAt),
			Deliveries: r.Deliveries, Sent: r.Sent, Failed: r.Failed,
		})
	}

	// Échéances : dérivées de la dernière publication réelle de chaque document.
	for _, rule := range obligationRules() {
		obl := Obligation{
			Key: rule.Key, Label: rule.Label, Document: rule.Document,
			Legal: rule.Legal, CadenceDays: int(rule.Cadence.Hours() / 24),
		}
		if last, ok := lastPublished[rule.Document]; ok {
			lastCopy := last
			next := last.Add(rule.Cadence)
			days := int(next.Sub(now).Hours() / 24)
			obl.LastDone = &lastCopy
			obl.NextDue = &next
			obl.DaysLeft = &days
			switch {
			case days < 0:
				obl.Status = "overdue"
			case days <= obligationDueSoonDays:
				obl.Status = "soon"
			default:
				obl.Status = "ok"
			}
		} else {
			// Document jamais publié : l'échéance n'existe pas encore, mais le
			// document manquant est déjà signalé ligne par ligne.
			obl.Status = "unknown"
		}
		if obl.Status == "overdue" {
			snapshot.Summary.OverdueObligations++
		}
		snapshot.Obligations = append(snapshot.Obligations, obl)
	}

	snapshot.Summary.Score = complianceScore(snapshot.Summary, len(snapshot.Obligations))
	return snapshot, nil
}

// evaluateDocument produit le verdict d'un document : couverture du
// consentement sur la version publiée courante, angles morts, statut.
func evaluateDocument(doc ComplianceDocument, eligible int64) (int, string, []string) {
	issues := make([]string, 0, 4)
	coverage := 100
	status := "ok"

	if doc.RequiresAcceptance && doc.PublishedLocales == 0 {
		issues = append(issues, "Document à accepter sans aucune version publiée : aucune page légale n'est servie.")
		status = "critical"
	}
	if doc.RequiresAcceptance && doc.DistinctLocales > 0 && doc.DistinctLocales < 2 {
		issues = append(issues, "Une seule locale publiée : les lecteurs non francophones acceptent un texte qu'ils ne peuvent pas lire.")
		if status == "ok" {
			status = "warning"
		}
	}
	if doc.RequiresAcceptance {
		if eligible > 0 {
			coverage = int(doc.CurrentAcceptances * 100 / eligible)
		}
		if coverage < complianceLowCoverage {
			issues = append(issues, "Moins de 60 % des comptes actifs ont accepté la version publiée courante.")
			if status == "ok" {
				status = "warning"
			}
		}
	} else {
		coverage = 100
	}
	if !doc.IsActive && doc.RequiresAcceptance {
		issues = append(issues, "Document désactivé alors qu'il exige un consentement : la vérification est impossible.")
		if status == "ok" {
			status = "warning"
		}
	}

	return coverage, status, issues
}

// complianceScore résume la situation en un score 0-100 : chaque point de
// rigidité coûte, un document critique coûte beaucoup plus qu'un avertissement.
func complianceScore(summary ComplianceSummary, obligations int) int {
	score := 100
	score -= summary.Critical * 18
	score -= summary.Warning * 6
	score -= summary.OverdueObligations * 8
	if score < 0 {
		score = 0
	}
	_ = obligations
	return score
}
