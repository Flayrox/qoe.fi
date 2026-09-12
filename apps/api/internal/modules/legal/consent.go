package legal

// =====================================================================
// ✍️ Consentement — capture à la source (inscription, onboarding, lot)
// =====================================================================
// Le portail de re-consentement rattrape un utilisateur déjà connecté. Ce
// fichier traite le moment qui compte le plus juridiquement : la création du
// compte et la fin de l'onboarding, où l'utilisateur coche explicitement les
// documents qu'il accepte.
//
// Le formulaire d'inscription dépose son choix dans `user_metadata.signupConsent`
// (Supabase) : le serveur ne PEUT pas le lire avant que le compte n'existe, et
// la ligne User n'est créée qu'au premier JWT valide. `RecordSignupConsent` est
// donc appelé par `users.SyncUserFromAuth` juste après la création de la ligne :
// la preuve est ancrée côté serveur, à la seconde où le compte naît.
//
// Chaque entrée porte la version réellement affichée au moment du clic. Si la
// version publiée a changé entre l'inscription et l'activation, on n'enregistre
// RIEN pour ce document : laisser croire à un consentement sur un texte que la
// personne n'a pas lu serait une fausse preuve. Le portail repose la question.
// =====================================================================

import (
	"context"
	"encoding/json"
	"log"
	"strings"
	"time"

	db "github.com/qoefi/api/internal/database"
)

// SignupConsentItem est un document coché au moment de l'inscription.
type SignupConsentItem struct {
	Slug      string `json:"slug"`
	VersionID string `json:"versionId,omitempty"`
	Version   string `json:"version,omitempty"`
}

// SignupConsent est la charge utile déposée dans `user_metadata.signupConsent`.
type SignupConsent struct {
	Locale string              `json:"locale"`
	At     string              `json:"at"`
	Items  []SignupConsentItem `json:"items"`
}

// parseSignupConsent accepte la valeur brute des claims (map après décodage
// JWT) et la normalise. Toute forme inattendue renvoie nil : un claim abîmé ne
// doit jamais faire échouer la création de compte.
func parseSignupConsent(raw any) *SignupConsent {
	if raw == nil {
		return nil
	}
	var out SignupConsent
	switch v := raw.(type) {
	case SignupConsent:
		out = v
	case string:
		if err := json.Unmarshal([]byte(v), &out); err != nil {
			return nil
		}
	default:
		encoded, err := json.Marshal(v)
		if err != nil {
			return nil
		}
		if err := json.Unmarshal(encoded, &out); err != nil {
			return nil
		}
	}
	if len(out.Items) == 0 {
		return nil
	}
	return &out
}

// RecordSignupConsent enregistre les acceptations recueillies par le formulaire
// d'inscription. `payload` est la valeur brute de `user_metadata.signupConsent`.
//
// Retourne le nombre de preuves réellement écrites. Ne renvoie jamais d'erreur
// bloquante : l'échec d'une preuve secondaire ne doit pas empêcher la création
// d'un compte (le portail de consentement reprendra la main).
func (s *Service) RecordSignupConsent(
	ctx context.Context,
	userID, locale, source, ip, userAgent string,
	payload any,
) (int, error) {
	if userID == "" {
		return 0, nil
	}
	consent := parseSignupConsent(payload)
	if consent == nil {
		return 0, nil
	}
	if loc := strings.TrimSpace(consent.Locale); loc != "" {
		locale = loc
	}
	if strings.TrimSpace(source) == "" {
		source = "signup"
	}

	written := 0
	for _, item := range consent.Items {
		slug := strings.TrimSpace(item.Slug)
		if slug == "" {
			continue
		}
		doc, err := s.GetPublished(ctx, slug, locale)
		if err != nil {
			// Document retiré/inactif entre-temps : on n'écrit pas de preuve.
			log.Printf("[legal] consentement inscription ignoré (%s): %v", slug, err)
			continue
		}
		// Version figée : le texte accepté doit être celui qui était affiché.
		if item.VersionID != "" && item.VersionID != doc.VersionID {
			log.Printf("[legal] consentement inscription ignoré (%s): version %s devenue %s", slug, item.VersionID, doc.VersionID)
			continue
		}
		if _, err := s.q.UpsertLegalAcceptance(ctx, db.UpsertLegalAcceptanceParams{
			UserID:     toUUID(userID),
			DocumentID: doc.ID,
			VersionID:  doc.VersionID,
			Version:    doc.Version,
			Locale:     doc.Locale,
			Ip:         optText(ip),
			UserAgent:  optText(userAgent),
			Source:     source,
			Method:     "signup-checkbox",
		}); err != nil {
			log.Printf("[legal] consentement inscription non persisté (%s): %v", slug, err)
			continue
		}
		s.audit(ctx, userID, "legal.accept", doc.ID, map[string]any{
			"slug": doc.Slug, "version": doc.Version, "locale": doc.Locale, "source": source,
		})
		written++
	}
	return written, nil
}

// BatchAcceptInput décrit une acceptation par lot (fin d'onboarding, portail).
// `AcceptBatchInput` est l'alias attendu par les appelants internes.
type BatchAcceptInput struct {
	Locale    string   `json:"locale"`
	Source    string   `json:"source"`
	Method    string   `json:"method"`
	Slugs     []string `json:"slugs"`
	IP        string   `json:"-"`
	UserAgent string   `json:"-"`
}

// AcceptBatchInput est la variante interne (IP/UA non désérialisés du JSON).
type AcceptBatchInput = BatchAcceptInput

// AcceptBatch enregistre l'acceptation de la version publiée courante de
// plusieurs documents en une requête. Utilisé par l'onboarding créateur et par
// le portail, où plusieurs documents doivent être confirmés d'un coup.
//
// Idempotent : re-accepter la même version ne réécrit pas la preuve d'origine.
func (s *Service) AcceptBatch(ctx context.Context, userID string, in BatchAcceptInput) ([]Acceptance, error) {
	if userID == "" {
		return nil, errForbidden
	}
	if len(in.Slugs) == 0 {
		return nil, errInvalid
	}
	source := strings.TrimSpace(in.Source)
	if source == "" {
		source = "web"
	}
	method := strings.TrimSpace(in.Method)
	if method == "" {
		method = "checkbox"
	}

	out := make([]Acceptance, 0, len(in.Slugs))
	seen := make(map[string]bool, len(in.Slugs))
	for _, raw := range in.Slugs {
		slug := strings.TrimSpace(raw)
		if slug == "" || seen[slug] {
			continue
		}
		seen[slug] = true

		doc, err := s.GetPublished(ctx, slug, in.Locale)
		if err != nil {
			// Un slug inconnu n'annule pas les autres acceptations : on
			// renvoie ce qui a pu être prouvé.
			continue
		}
		row, err := s.q.UpsertLegalAcceptance(ctx, db.UpsertLegalAcceptanceParams{
			UserID:     toUUID(userID),
			DocumentID: doc.ID,
			VersionID:  doc.VersionID,
			Version:    doc.Version,
			Locale:     doc.Locale,
			Ip:         optText(in.IP),
			UserAgent:  optText(in.UserAgent),
			Source:     source,
			Method:     method,
		})
		if err != nil {
			return out, err
		}
		s.audit(ctx, userID, "legal.accept", doc.ID, map[string]any{
			"slug": doc.Slug, "version": doc.Version, "locale": doc.Locale, "source": source,
		})
		out = append(out, *acceptanceFromRow(row, doc.Slug, doc.Category))
	}
	return out, nil
}

// ─── Consentement traceurs (journal serveur) ─────────────────────────

// CookieConsentInput est un choix de traceurs rapporté par le navigateur.
// Aucune authentification n'est requise : la loi impose de recueillir le choix
// d'un visiteur anonyme, et la preuve doit exister même sans compte.
type CookieConsentInput struct {
	ConsentID     string          `json:"consentId"`
	SessionID     string          `json:"sessionId"`
	Locale        string          `json:"locale"`
	PolicyVersion string          `json:"policyVersion"`
	Categories    map[string]bool `json:"categories"`
	Source        string          `json:"source"`
	Country       string          `json:"country"`
	IP            string          `json:"-"`
	UserAgent     string          `json:"-"`
	UserID        string          `json:"-"`
}

// CookieConsentReceipt est l'accusé de réception du journal.
type CookieConsentReceipt struct {
	ID         string     `json:"id"`
	ConsentID  string     `json:"consentId"`
	RecordedAt *time.Time `json:"recordedAt"`
}

// RecordCookieConsent ajoute une ligne au journal append-only des choix de
// traceurs. On n'écrase jamais une ligne : un changement de choix est un
// événement, et l'historique complet reste auditable.
func (s *Service) RecordCookieConsent(ctx context.Context, in CookieConsentInput) (*CookieConsentReceipt, error) {
	policyVersion := strings.TrimSpace(in.PolicyVersion)
	if policyVersion == "" {
		return nil, errInvalid
	}
	categories := in.Categories
	if categories == nil {
		categories = map[string]bool{}
	}
	encoded, err := json.Marshal(categories)
	if err != nil {
		return nil, errInvalid
	}
	source := strings.TrimSpace(in.Source)
	if source == "" {
		source = "banner"
	}
	locale := NormalizeLocale(in.Locale)
	if strings.TrimSpace(in.Locale) == "" {
		locale = "fr"
	}

	row, err := s.q.InsertCookieConsentRecord(ctx, db.InsertCookieConsentRecordParams{
		ConsentID:     optText(in.ConsentID),
		UserID:        toUUID(in.UserID),
		SessionID:     optText(in.SessionID),
		Locale:        locale,
		PolicyVersion: policyVersion,
		Categories:    encoded,
		Source:        source,
		Country:       optText(in.Country),
		Ip:            optText(in.IP),
		UserAgent:     optText(in.UserAgent),
	})
	if err != nil {
		return nil, err
	}
	return &CookieConsentReceipt{
		ID:         row.ID,
		ConsentID:  in.ConsentID,
		RecordedAt: tsTime(row.CreatedAt),
	}, nil
}

// ─── Helpers de lecture (console) ────────────────────────────────────

// CookieConsentStats agrège le journal des choix de traceurs.
func (s *Service) CookieConsentStats(ctx context.Context, actor string) (*CookieConsentStatsView, error) {
	if err := s.checkSuperadmin(ctx, actor); err != nil {
		return nil, err
	}
	row, err := s.q.CookieConsentStats(ctx)
	if err != nil {
		return nil, err
	}
	return &CookieConsentStatsView{
		Total:            row.Total,
		Last30d:          row.Last30d,
		DistinctBrowsers: row.DistinctBrowsers,
		AnalyticsOptIn:   row.AnalyticsOptIn,
		AnalyticsOptOut:  row.AnalyticsOptOut,
		LastChoiceAt:     tsTime(row.LastChoiceAt),
	}, nil
}

// CookieConsentStatsView est la vue sérialisée des statistiques traceurs.
type CookieConsentStatsView struct {
	Total            int64      `json:"total"`
	Last30d          int64      `json:"last30d"`
	DistinctBrowsers int64      `json:"distinctBrowsers"`
	AnalyticsOptIn   int64      `json:"analyticsOptIn"`
	AnalyticsOptOut  int64      `json:"analyticsOptOut"`
	LastChoiceAt     *time.Time `json:"lastChoiceAt,omitempty"`
}

// CookieConsentRecord est une ligne du journal, exposée à la console.
type CookieConsentRecord struct {
	ID            string          `json:"id"`
	ConsentID     *string         `json:"consentId,omitempty"`
	UserID        *string         `json:"userId,omitempty"`
	Locale        string          `json:"locale"`
	PolicyVersion string          `json:"policyVersion"`
	Categories    map[string]bool `json:"categories"`
	Source        string          `json:"source"`
	IP            *string         `json:"ip,omitempty"`
	Country       *string         `json:"country,omitempty"`
	UserAgent     *string         `json:"userAgent,omitempty"`
	CreatedAt     *time.Time      `json:"createdAt,omitempty"`
}

// ListCookieConsentRecords expose le journal des choix (console superadmin).
func (s *Service) ListCookieConsentRecords(ctx context.Context, actor, consentID string, limit int32) ([]CookieConsentRecord, error) {
	if err := s.checkSuperadmin(ctx, actor); err != nil {
		return nil, err
	}
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	rows, err := s.q.ListCookieConsentRecords(ctx, db.ListCookieConsentRecordsParams{
		ConsentID:  optText(consentID),
		LimitCount: limit,
	})
	if err != nil {
		return nil, err
	}
	out := make([]CookieConsentRecord, 0, len(rows))
	for _, r := range rows {
		categories := map[string]bool{}
		if len(r.Categories) > 0 {
			_ = json.Unmarshal(r.Categories, &categories)
		}
		out = append(out, CookieConsentRecord{
			ID: r.ID, ConsentID: textPtr(r.ConsentID), UserID: uuidPtr(r.UserID),
			Locale: r.Locale, PolicyVersion: r.PolicyVersion, Categories: categories,
			Source: r.Source, IP: textPtr(r.Ip), Country: textPtr(r.Country),
			UserAgent: textPtr(r.UserAgent), CreatedAt: tsTime(r.CreatedAt),
		})
	}
	return out, nil
}
