// Package legal — documents juridiques versionnés de qoefi.
// =====================================================================
// Ce module est la source de vérité de tout le contenu légal de la
// plateforme (CGU, confidentialité, cookies, CGV, accord créateur, DPA,
// sous-traitants, utilisation acceptable, accessibilité).
//
// Principes :
//   - Le contenu publié est immuable : on publie une nouvelle version,
//     l'ancienne reste archivée (preuve légale, historique public).
//   - Une seule version PUBLISHED par (document, locale) — garanti par un
//     index unique partiel en base, pas seulement par le service.
//   - Chaque acceptation référence la version exacte acceptée : une nouvelle
//     version qui exige un consentement redéclenche le consentement.
//   - Le contenu de départ est embarqué dans le binaire (seed idempotent) :
//     aucune page légale vide après un déploiement.
//
// =====================================================================
package legal

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/auditlog"
	db "github.com/qoefi/api/internal/database"
)

var (
	errForbidden = errors.New("réservé au superadmin")
	errNotFound  = errors.New("document juridique introuvable")
	errConflict  = errors.New("conflit de version")
	errInvalid   = errors.New("requête invalide")
)

// FlagChecker évalue un flag (implémenté par internal/flags.Service).
type FlagChecker interface {
	IsOn(ctx context.Context, key string) bool
}

// Service porte la logique légale.
type Service struct {
	pool  *pgxpool.Pool
	q     *db.Queries
	flags FlagChecker

	// exportSigner signe les exports du registre de consentement. Nul tant
	// qu'aucune clé n'est configurée ; une clé éphémère n'est générée qu'en
	// dernier recours (développement), et jamais silencieusement.
	exportSigner     *exportSigner
	exportSignerOnce sync.Once
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool, q: db.New(pool)}
}

// SetFlags branche les feature flags (journal d'audit superadmin).
func (s *Service) SetFlags(f FlagChecker) { s.flags = f }

// ─── Types exposés ───────────────────────────────────────────────────

// Document est un document juridique publié (résumé public, sans corps).
type Document struct {
	ID                 string     `json:"id"`
	Slug               string     `json:"slug"`
	Category           string     `json:"category"`
	Audience           string     `json:"audience"`
	RequiresAcceptance bool       `json:"requiresAcceptance"`
	Version            string     `json:"version"`
	VersionID          string     `json:"versionId"`
	Locale             string     `json:"locale"`
	Title              string     `json:"title"`
	Summary            string     `json:"summary"`
	Changelog          *string    `json:"changelog,omitempty"`
	EffectiveAt        *time.Time `json:"effectiveAt,omitempty"`
	PublishedAt        *time.Time `json:"publishedAt,omitempty"`
	UpdatedAt          *time.Time `json:"updatedAt,omitempty"`
}

// FullDocument est un document publié avec son corps markdown.
type FullDocument struct {
	Document
	Body string `json:"body"`
}

// Version est une version (publiée, archivée ou brouillon) d'un document.
type Version struct {
	ID            string     `json:"id"`
	DocumentID    string     `json:"documentId"`
	DocumentSlug  string     `json:"documentSlug,omitempty"`
	Locale        string     `json:"locale"`
	Version       string     `json:"version"`
	Title         string     `json:"title"`
	Summary       string     `json:"summary"`
	Body          string     `json:"body,omitempty"`
	Status        string     `json:"status"`
	Changelog     *string    `json:"changelog,omitempty"`
	EffectiveAt   *time.Time `json:"effectiveAt,omitempty"`
	PublishedAt   *time.Time `json:"publishedAt,omitempty"`
	ArchivedAt    *time.Time `json:"archivedAt,omitempty"`
	CreatedBy     *string    `json:"createdBy,omitempty"`
	CreatedByName *string    `json:"createdByName,omitempty"`
	CreatedAt     *time.Time `json:"createdAt,omitempty"`
	UpdatedAt     *time.Time `json:"updatedAt,omitempty"`
	// Notice résume la campagne d'information déclenchée par la publication
	// (nil quand le document n'exige pas d'acceptation).
	Notice *NoticeDispatch `json:"notice,omitempty"`
}

// AdminDocument est la vue console (documents inactifs, brouillons, compteurs).
type AdminDocument struct {
	ID                 string     `json:"id"`
	Slug               string     `json:"slug"`
	Category           string     `json:"category"`
	Audience           string     `json:"audience"`
	RequiresAcceptance bool       `json:"requiresAcceptance"`
	IsActive           bool       `json:"isActive"`
	SortOrder          int32      `json:"sortOrder"`
	VersionsCount      int64      `json:"versionsCount"`
	DraftsCount        int64      `json:"draftsCount"`
	AcceptancesCount   int64      `json:"acceptancesCount"`
	PublishedVersion   *string    `json:"publishedVersion,omitempty"`
	PublishedLocale    *string    `json:"publishedLocale,omitempty"`
	PublishedTitle     *string    `json:"publishedTitle,omitempty"`
	CreatedAt          *time.Time `json:"createdAt,omitempty"`
	UpdatedAt          *time.Time `json:"updatedAt,omitempty"`
}

// PendingAcceptance signale un consentement manquant (version courante).
type PendingAcceptance struct {
	ID          string     `json:"id"`
	Slug        string     `json:"slug"`
	Category    string     `json:"category"`
	Audience    string     `json:"audience"`
	VersionID   string     `json:"versionId"`
	Version     string     `json:"version"`
	Title       string     `json:"title"`
	EffectiveAt *time.Time `json:"effectiveAt,omitempty"`
}

// Acceptance est la preuve de consentement enregistrée.
type Acceptance struct {
	ID           string     `json:"id"`
	DocumentID   string     `json:"documentId"`
	DocumentSlug string     `json:"documentSlug,omitempty"`
	Category     string     `json:"category,omitempty"`
	VersionID    string     `json:"versionId"`
	Version      string     `json:"version"`
	Locale       string     `json:"locale"`
	AcceptedAt   *time.Time `json:"acceptedAt"`
	Source       string     `json:"source"`
	Method       string     `json:"method"`
	IP           *string    `json:"ip,omitempty"`
	UserAgent    *string    `json:"userAgent,omitempty"`
	UserEmail    *string    `json:"userEmail,omitempty"`
}

// Stats agrège les preuves d'acceptation par document (console admin).
type Stats struct {
	ID                 string `json:"id"`
	Slug               string `json:"slug"`
	RequiresAcceptance bool   `json:"requiresAcceptance"`
	Acceptances        int64  `json:"acceptances"`
	Acceptances30d     int64  `json:"acceptances30d"`
	VersionsCount      int64  `json:"versionsCount"`
}

// SaveDocumentInput est la charge utile de création/mise à jour d'un document.
type SaveDocumentInput struct {
	Slug               string `json:"slug"`
	Category           string `json:"category"`
	Audience           string `json:"audience"`
	RequiresAcceptance bool   `json:"requiresAcceptance"`
	IsActive           *bool  `json:"isActive"`
	SortOrder          *int32 `json:"sortOrder"`
	// Première version (obligatoire à la création)
	Locale    string `json:"locale"`
	Version   string `json:"version"`
	Title     string `json:"title"`
	Summary   string `json:"summary"`
	Body      string `json:"body"`
	Changelog string `json:"changelog"`
	Publish   bool   `json:"publish"`
}

// SaveVersionInput est la charge utile de création d'une nouvelle version.
type SaveVersionInput struct {
	Locale      string `json:"locale"`
	Version     string `json:"version"`
	Title       string `json:"title"`
	Summary     string `json:"summary"`
	Body        string `json:"body"`
	Changelog   string `json:"changelog"`
	EffectiveAt string `json:"effectiveAt"`
}

// AcceptInput décrit la preuve de consentement à enregistrer.
type AcceptInput struct {
	Locale    string
	Source    string
	Method    string
	IP        string
	UserAgent string
}

// ─── Helpers ─────────────────────────────────────────────────────────

var validCategories = map[string]bool{
	"legal": true, "privacy": true, "commerce": true, "creator": true, "security": true, "general": true,
}

var validAudiences = map[string]bool{
	"all": true, "creators": true, "media": true, "developers": true, "subscribers": true,
}

// NormalizeLocale réduit une locale HTTP à nos deux locales supportées.
// Les autres langues retombent sur le français (source de référence).
func NormalizeLocale(raw string) string {
	l := strings.ToLower(strings.TrimSpace(raw))
	if strings.HasPrefix(l, "en") {
		return "en"
	}
	return "fr"
}

func toUUID(id string) pgtype.UUID {
	var u pgtype.UUID
	if err := u.Scan(id); err != nil {
		return pgtype.UUID{}
	}
	return u
}

func optText(s string) pgtype.Text {
	if strings.TrimSpace(s) == "" {
		return pgtype.Text{}
	}
	return pgtype.Text{String: s, Valid: true}
}

func tsTime(t pgtype.Timestamp) *time.Time {
	if !t.Valid {
		return nil
	}
	v := t.Time
	return &v
}

func textPtr(t pgtype.Text) *string {
	if !t.Valid || t.String == "" {
		return nil
	}
	v := t.String
	return &v
}

// uuidPtr formate un pgtype.UUID en chaîne canonique (nil si absent).
// pgtype.UUID n'expose pas de champ string : on formate les 16 octets.
func uuidPtr(u pgtype.UUID) *string {
	if !u.Valid {
		return nil
	}
	b := u.Bytes
	s := fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
	return &s
}

// nilIfEmpty convertit une colonne texte vide (COALESCE) en pointeur nil.
func nilIfEmpty(s string) *string {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	v := s
	return &v
}

func parseEffectiveAt(raw string) pgtype.Timestamp {
	if strings.TrimSpace(raw) == "" {
		return pgtype.Timestamp{}
	}
	for _, layout := range []string{time.RFC3339, "2006-01-02"} {
		if t, err := time.Parse(layout, raw); err == nil {
			return pgtype.Timestamp{Time: t, Valid: true}
		}
	}
	return pgtype.Timestamp{}
}

// checkSuperadmin reproduit la garde du module admin (rôle superadmin unique).
func (s *Service) checkSuperadmin(ctx context.Context, userID string) error {
	if userID == "" {
		return errForbidden
	}
	role, err := s.q.GetAdminUserRole(ctx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return errForbidden
		}
		return err
	}
	if role != "superadmin" {
		return errForbidden
	}
	return nil
}

// RequireSuperadmin expose la garde de rôle aux handlers dont l'action n'est
// portée par aucune méthode métier (déclenchement manuel du cycle de vie).
func (s *Service) RequireSuperadmin(ctx context.Context, userID string) (string, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return "", err
	}
	return userID, nil
}

func (s *Service) audit(ctx context.Context, actor, action, targetID string, metadata any) {
	auditlog.Write(ctx, s.q, s.flags, actor, action, "legal_document", targetID, metadata)
}

// ─── Lecture publique ────────────────────────────────────────────────

// ListPublished renvoie le sommaire public des documents publiés.
func (s *Service) ListPublished(ctx context.Context, locale string) ([]Document, error) {
	loc := NormalizeLocale(locale)
	rows, err := s.q.ListPublishedLegalDocuments(ctx, loc)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 && loc != "fr" {
		// Repli français : la version FR fait foi si aucune traduction.
		rows, err = s.q.ListPublishedLegalDocuments(ctx, "fr")
		if err != nil {
			return nil, err
		}
	}
	out := make([]Document, 0, len(rows))
	for _, r := range rows {
		out = append(out, Document{
			ID:                 r.ID,
			Slug:               r.Slug,
			Category:           r.Category,
			Audience:           r.Audience,
			RequiresAcceptance: r.RequiresAcceptance,
			VersionID:          r.VersionID,
			Version:            r.Version,
			Locale:             r.Locale,
			Title:              r.Title,
			Summary:            r.Summary,
			Changelog:          textPtr(r.Changelog),
			EffectiveAt:        tsTime(r.EffectiveAt),
			PublishedAt:        tsTime(r.PublishedAt),
			UpdatedAt:          tsTime(r.UpdatedAt),
		})
	}
	return out, nil
}

// GetPublished renvoie le contenu complet (markdown) d'un document publié.
// Repli automatique sur le français quand la traduction n'existe pas.
func (s *Service) GetPublished(ctx context.Context, slug, locale string) (*FullDocument, error) {
	loc := NormalizeLocale(locale)

	// 1. Version publiée dans la locale demandée.
	// 2. Sinon repli FR (la version française fait foi).
	// 3. Sinon repli EN (un document peut n'exister qu'en anglais).
	for _, candidate := range []string{loc, "fr", "en"} {
		row, err := s.q.GetPublishedLegalDocument(ctx, db.GetPublishedLegalDocumentParams{Slug: slug, Locale: candidate})
		if err == nil {
			return fullFromRow(row), nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return nil, err
		}
	}
	return nil, errNotFound
}

func fullFromRow(r db.GetPublishedLegalDocumentRow) *FullDocument {
	return &FullDocument{
		Document: Document{
			ID:                 r.ID,
			Slug:               r.Slug,
			Category:           r.Category,
			Audience:           r.Audience,
			RequiresAcceptance: r.RequiresAcceptance,
			VersionID:          r.VersionID,
			Version:            r.Version,
			Locale:             r.Locale,
			Title:              r.Title,
			Summary:            r.Summary,
			Changelog:          textPtr(r.Changelog),
			EffectiveAt:        tsTime(r.EffectiveAt),
			PublishedAt:        tsTime(r.PublishedAt),
			UpdatedAt:          tsTime(r.UpdatedAt),
		},
		Body: r.Body,
	}
}

// ListVersions renvoie l'historique public (publiées + archivées) d'un document.
func (s *Service) ListVersions(ctx context.Context, slug, locale string) ([]Version, error) {
	rows, err := s.q.ListPublishedLegalVersions(ctx, db.ListPublishedLegalVersionsParams{
		Slug: slug, Locale: NormalizeLocale(locale),
	})
	if err != nil {
		return nil, err
	}
	out := make([]Version, 0, len(rows))
	for _, r := range rows {
		out = append(out, Version{
			ID: r.ID, DocumentID: r.DocumentID, Locale: r.Locale, Version: r.Version,
			Title: r.Title, Summary: r.Summary, Status: r.Status, Changelog: textPtr(r.Changelog),
			EffectiveAt: tsTime(r.EffectiveAt), PublishedAt: tsTime(r.PublishedAt),
			ArchivedAt: tsTime(r.ArchivedAt), CreatedAt: tsTime(r.CreatedAt),
		})
	}
	return out, nil
}

// PendingAcceptances liste les documents à (re)consentir pour un utilisateur.
func (s *Service) PendingAcceptances(ctx context.Context, userID, locale string) ([]PendingAcceptance, error) {
	rows, err := s.q.ListPendingLegalAcceptances(ctx, db.ListPendingLegalAcceptancesParams{
		Locale: NormalizeLocale(locale), UserID: toUUID(userID),
	})
	if err != nil {
		return nil, err
	}
	out := make([]PendingAcceptance, 0, len(rows))
	for _, r := range rows {
		out = append(out, PendingAcceptance{
			ID: r.ID, Slug: r.Slug, Category: r.Category, Audience: r.Audience,
			VersionID: r.VersionID, Version: r.Version, Title: r.Title,
			EffectiveAt: tsTime(r.EffectiveAt),
		})
	}
	return out, nil
}

// Accept enregistre (de façon idempotente) l'acceptation de la version publiée
// courante d'un document au nom de l'utilisateur authentifié.
func (s *Service) Accept(ctx context.Context, userID, slug string, in AcceptInput) (*Acceptance, error) {
	if userID == "" {
		return nil, errForbidden
	}
	doc, err := s.GetPublished(ctx, slug, in.Locale)
	if err != nil {
		return nil, err
	}
	source := strings.TrimSpace(in.Source)
	if source == "" {
		source = "web"
	}
	method := strings.TrimSpace(in.Method)
	if method == "" {
		method = "checkbox"
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
		return nil, err
	}
	s.audit(ctx, userID, "legal.accept", doc.ID, map[string]any{
		"slug": doc.Slug, "version": doc.Version, "locale": doc.Locale, "source": source,
	})
	return acceptanceFromRow(row, doc.Slug, doc.Category), nil
}

// UserAcceptances renvoie l'historique de consentement de l'utilisateur.
func (s *Service) UserAcceptances(ctx context.Context, userID string) ([]Acceptance, error) {
	rows, err := s.q.ListUserLegalAcceptances(ctx, toUUID(userID))
	if err != nil {
		return nil, err
	}
	out := make([]Acceptance, 0, len(rows))
	for _, r := range rows {
		out = append(out, Acceptance{
			ID: r.ID, DocumentID: r.DocumentID, DocumentSlug: r.Slug, Category: r.Category,
			VersionID: r.VersionID, Version: r.Version, Locale: r.Locale,
			AcceptedAt: tsTime(r.AcceptedAt), Source: r.Source, Method: r.Method,
		})
	}
	return out, nil
}

func acceptanceFromRow(r db.LegalAcceptance, slug, category string) *Acceptance {
	return &Acceptance{
		ID: r.ID, DocumentID: r.DocumentID, DocumentSlug: slug, Category: category,
		VersionID: r.VersionID, Version: r.Version, Locale: r.Locale,
		AcceptedAt: tsTime(r.AcceptedAt), Source: r.Source, Method: r.Method,
		IP: textPtr(r.Ip), UserAgent: textPtr(r.UserAgent),
	}
}

// ─── Console superadmin ──────────────────────────────────────────────

// AdminList liste tous les documents (actifs ou non, brouillons inclus).
func (s *Service) AdminList(ctx context.Context, actor string) ([]AdminDocument, error) {
	if err := s.checkSuperadmin(ctx, actor); err != nil {
		return nil, err
	}
	rows, err := s.q.ListLegalDocumentsAdmin(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]AdminDocument, 0, len(rows))
	for _, r := range rows {
		out = append(out, AdminDocument{
			ID: r.ID, Slug: r.Slug, Category: r.Category, Audience: r.Audience,
			RequiresAcceptance: r.RequiresAcceptance, IsActive: r.IsActive, SortOrder: r.SortOrder,
			VersionsCount: r.VersionsCount, DraftsCount: r.DraftsCount, AcceptancesCount: r.AcceptancesCount,
			PublishedVersion: nilIfEmpty(r.PublishedVersion), PublishedLocale: nilIfEmpty(r.PublishedLocale),
			PublishedTitle: nilIfEmpty(r.PublishedTitle),
			CreatedAt:      tsTime(r.CreatedAt), UpdatedAt: tsTime(r.UpdatedAt),
		})
	}
	return out, nil
}

// AdminVersions liste toutes les versions d'un document (brouillons inclus).
func (s *Service) AdminVersions(ctx context.Context, actor, documentID string) ([]Version, error) {
	if err := s.checkSuperadmin(ctx, actor); err != nil {
		return nil, err
	}
	rows, err := s.q.ListLegalDocumentVersions(ctx, documentID)
	if err != nil {
		return nil, err
	}
	out := make([]Version, 0, len(rows))
	for _, r := range rows {
		out = append(out, Version{
			ID: r.ID, DocumentID: r.DocumentID, Locale: r.Locale, Version: r.Version,
			Title: r.Title, Summary: r.Summary, Body: r.Body, Status: r.Status,
			Changelog: textPtr(r.Changelog), EffectiveAt: tsTime(r.EffectiveAt),
			PublishedAt: tsTime(r.PublishedAt), ArchivedAt: tsTime(r.ArchivedAt),
			CreatedBy: uuidPtr(r.CreatedBy), CreatedByName: textPtr(r.CreatedByName),
			CreatedAt: tsTime(r.CreatedAt), UpdatedAt: tsTime(r.UpdatedAt),
		})
	}
	return out, nil
}

// CreateDocument crée un document et sa première version (brouillon ou publiée).
func (s *Service) CreateDocument(ctx context.Context, actor string, in SaveDocumentInput) (*AdminDocument, error) {
	if err := s.checkSuperadmin(ctx, actor); err != nil {
		return nil, err
	}
	if err := validateDocumentInput(in); err != nil {
		return nil, err
	}
	active := true
	if in.IsActive != nil {
		active = *in.IsActive
	}
	order := int32(100)
	if in.SortOrder != nil {
		order = *in.SortOrder
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.q.WithTx(tx)

	doc, err := q.InsertLegalDocument(ctx, db.InsertLegalDocumentParams{
		Slug: in.Slug, Category: in.Category, Audience: in.Audience,
		RequiresAcceptance: in.RequiresAcceptance, IsActive: active, SortOrder: order,
	})
	if err != nil {
		if isUniqueViolation(err) {
			return nil, fmt.Errorf("%w: un document avec le slug %q existe déjà", errConflict, in.Slug)
		}
		return nil, err
	}

	ver, err := q.InsertLegalDocumentVersion(ctx, db.InsertLegalDocumentVersionParams{
		DocumentID: doc.ID,
		Locale:     NormalizeLocale(in.Locale),
		Version:    versionOr(in.Version, "1.0.0"),
		Title:      in.Title,
		Summary:    in.Summary,
		Body:       in.Body,
		Changelog:  optText(in.Changelog),
		CreatedBy:  toUUID(actor),
	})
	if err != nil {
		return nil, err
	}
	if in.Publish {
		if err := publishTx(ctx, q, ver.ID, doc.ID, ver.Locale); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	s.audit(ctx, actor, "legal.document.create", doc.ID, map[string]any{
		"slug": doc.Slug, "version": ver.Version, "published": in.Publish,
	})
	return s.adminDocument(ctx, actor, doc.ID)
}

// UpdateDocument met à jour les métadonnées d'un document.
func (s *Service) UpdateDocument(ctx context.Context, actor, id string, in SaveDocumentInput) (*AdminDocument, error) {
	if err := s.checkSuperadmin(ctx, actor); err != nil {
		return nil, err
	}
	if strings.TrimSpace(in.Slug) == "" {
		return nil, fmt.Errorf("%w: slug requis", errInvalid)
	}
	if !validCategories[in.Category] {
		return nil, fmt.Errorf("%w: catégorie inconnue", errInvalid)
	}
	if !validAudiences[in.Audience] {
		return nil, fmt.Errorf("%w: audience inconnue", errInvalid)
	}
	current, err := s.q.GetLegalDocumentByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errNotFound
		}
		return nil, err
	}
	active := current.IsActive
	if in.IsActive != nil {
		active = *in.IsActive
	}
	order := current.SortOrder
	if in.SortOrder != nil {
		order = *in.SortOrder
	}
	if _, err := s.q.UpdateLegalDocument(ctx, db.UpdateLegalDocumentParams{
		ID: id, Slug: in.Slug, Category: in.Category, Audience: in.Audience,
		RequiresAcceptance: in.RequiresAcceptance, IsActive: active, SortOrder: order,
	}); err != nil {
		if isUniqueViolation(err) {
			return nil, fmt.Errorf("%w: slug %q déjà utilisé", errConflict, in.Slug)
		}
		return nil, err
	}
	s.audit(ctx, actor, "legal.document.update", id, map[string]any{
		"slug": in.Slug, "audience": in.Audience, "requiresAcceptance": in.RequiresAcceptance, "isActive": active,
	})
	return s.adminDocument(ctx, actor, id)
}

// DeleteDocument supprime un document et tout son historique.
// (Les preuves d'acceptation sont supprimées en cascade — usage exceptionnel.)
func (s *Service) DeleteDocument(ctx context.Context, actor, id string) error {
	if err := s.checkSuperadmin(ctx, actor); err != nil {
		return err
	}
	if err := s.q.DeleteLegalDocument(ctx, id); err != nil {
		return err
	}
	s.audit(ctx, actor, "legal.document.delete", id, nil)
	return nil
}

// CreateVersion ajoute une nouvelle version (toujours un brouillon au départ).
func (s *Service) CreateVersion(ctx context.Context, actor, documentID string, in SaveVersionInput) (*Version, error) {
	if err := s.checkSuperadmin(ctx, actor); err != nil {
		return nil, err
	}
	if strings.TrimSpace(in.Title) == "" {
		return nil, fmt.Errorf("%w: titre requis", errInvalid)
	}
	if strings.TrimSpace(in.Body) == "" {
		return nil, fmt.Errorf("%w: contenu requis", errInvalid)
	}
	doc, err := s.q.GetLegalDocumentByID(ctx, documentID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errNotFound
		}
		return nil, err
	}
	row, err := s.q.InsertLegalDocumentVersion(ctx, db.InsertLegalDocumentVersionParams{
		DocumentID:  documentID,
		Locale:      NormalizeLocale(in.Locale),
		Version:     versionOr(in.Version, ""),
		Title:       in.Title,
		Summary:     in.Summary,
		Body:        in.Body,
		Changelog:   optText(in.Changelog),
		EffectiveAt: parseEffectiveAt(in.EffectiveAt),
		CreatedBy:   toUUID(actor),
	})
	if err != nil {
		if isUniqueViolation(err) {
			return nil, fmt.Errorf("%w: la version %q existe déjà pour cette locale", errConflict, in.Version)
		}
		return nil, err
	}
	s.audit(ctx, actor, "legal.version.create", doc.ID, map[string]any{
		"slug": doc.Slug, "version": row.Version, "locale": row.Locale,
	})
	return adminVersion(row), nil
}

// UpdateVersion édite un brouillon (une version publiée est immuable).
func (s *Service) UpdateVersion(ctx context.Context, actor, versionID string, in SaveVersionInput) (*Version, error) {
	if err := s.checkSuperadmin(ctx, actor); err != nil {
		return nil, err
	}
	row, err := s.q.UpdateLegalDocumentVersion(ctx, db.UpdateLegalDocumentVersionParams{
		ID: versionID, Title: in.Title, Summary: in.Summary, Body: in.Body,
		Changelog: optText(in.Changelog), EffectiveAt: parseEffectiveAt(in.EffectiveAt),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Soit inexistante, soit déjà publiée (immuable).
			return nil, fmt.Errorf("%w: version introuvable ou déjà publiée (immuable)", errConflict)
		}
		return nil, err
	}
	s.audit(ctx, actor, "legal.version.update", row.DocumentID, map[string]any{
		"versionId": row.ID, "version": row.Version, "locale": row.Locale,
	})
	return adminVersion(row), nil
}

// PublishVersion publie un brouillon et archive la version publiée précédente
// dans la même locale (opération transactionnelle : jamais deux publiées).
func (s *Service) PublishVersion(ctx context.Context, actor, versionID string) (*Version, error) {
	if err := s.checkSuperadmin(ctx, actor); err != nil {
		return nil, err
	}
	current, err := s.q.GetLegalDocumentVersion(ctx, versionID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errNotFound
		}
		return nil, err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.q.WithTx(tx)
	published, err := publishTxRow(ctx, q, versionID, current.DocumentID, current.Locale)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	s.audit(ctx, actor, "legal.version.publish", current.DocumentID, map[string]any{
		"versionId": published.ID, "version": published.Version, "locale": published.Locale,
	})
	out := adminVersion(published)
	// 🔄 Si cette version était le brouillon d'une revue périodique, publier
	// la clôt : la revue a rempli son rôle, on ne la laisse pas ouverte à
	// traîner dans le tableau de conformité.
	if err := s.q.CompleteLegalReviewsForVersion(ctx, optText(published.ID)); err != nil {
		log.Printf("[legal] revue non clôturée après publication (version %s): %v", published.ID, err)
	}
	// 📣 Prévenir les personnes qui avaient accepté la version précédente :
	// c'est l'obligation d'information effective (art. 12 RGPD), et sans elle
	// une acceptation tacite ne vaudrait rien. Best-effort : une campagne qui
	// échoue ne doit pas annuler une publication déjà commitée.
	if notice, err := s.EnqueueNotice(ctx, actor, published); err != nil {
		log.Printf("[legal] avis de publication non préparé (version %s): %v", published.ID, err)
	} else {
		out.Notice = notice
	}
	return out, nil
}

// ArchiveVersion dépublie une version publiée (le document disparaît du public
// tant qu'aucune autre version n'est publiée pour cette locale).
func (s *Service) ArchiveVersion(ctx context.Context, actor, versionID string) (*Version, error) {
	if err := s.checkSuperadmin(ctx, actor); err != nil {
		return nil, err
	}
	row, err := s.q.ArchiveLegalDocumentVersion(ctx, versionID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, fmt.Errorf("%w: seule une version publiée peut être archivée", errConflict)
		}
		return nil, err
	}
	s.audit(ctx, actor, "legal.version.archive", row.DocumentID, map[string]any{
		"versionId": row.ID, "version": row.Version, "locale": row.Locale,
	})
	return adminVersion(row), nil
}

// DeleteDraft supprime un brouillon (jamais une version publiée/archivée).
func (s *Service) DeleteDraft(ctx context.Context, actor, versionID string) error {
	if err := s.checkSuperadmin(ctx, actor); err != nil {
		return err
	}
	if err := s.q.DeleteLegalDocumentVersion(ctx, versionID); err != nil {
		return err
	}
	s.audit(ctx, actor, "legal.version.delete", versionID, nil)
	return nil
}

// AdminAcceptances liste les preuves de consentement (filtre slug optionnel).
func (s *Service) AdminAcceptances(ctx context.Context, actor, slug string, limit int32) ([]Acceptance, error) {
	if err := s.checkSuperadmin(ctx, actor); err != nil {
		return nil, err
	}
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	rows, err := s.q.ListLegalAcceptancesAdmin(ctx, db.ListLegalAcceptancesAdminParams{Slug: slug, LimitCount: limit})
	if err != nil {
		return nil, err
	}
	out := make([]Acceptance, 0, len(rows))
	for _, r := range rows {
		out = append(out, Acceptance{
			ID: r.ID, DocumentID: r.DocumentID, DocumentSlug: r.DocumentSlug,
			Version: r.Version, Locale: r.Locale, AcceptedAt: tsTime(r.AcceptedAt),
			Source: r.Source, Method: r.Method, IP: textPtr(r.Ip), UserAgent: textPtr(r.UserAgent),
			UserEmail: textPtr(r.UserEmail),
		})
	}
	return out, nil
}

// AdminStats agrège les acceptations par document.
func (s *Service) AdminStats(ctx context.Context, actor string) ([]Stats, error) {
	if err := s.checkSuperadmin(ctx, actor); err != nil {
		return nil, err
	}
	rows, err := s.q.LegalAcceptanceStats(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]Stats, 0, len(rows))
	for _, r := range rows {
		out = append(out, Stats{
			ID: r.ID, Slug: r.Slug, RequiresAcceptance: r.RequiresAcceptance,
			Acceptances: r.Acceptances, Acceptances30d: r.Acceptances30d, VersionsCount: r.VersionsCount,
		})
	}
	return out, nil
}

// adminDocument relit la fiche admin d'un document (après écriture).
func (s *Service) adminDocument(ctx context.Context, actor, id string) (*AdminDocument, error) {
	list, err := s.AdminList(ctx, actor)
	if err != nil {
		return nil, err
	}
	for i := range list {
		if list[i].ID == id {
			return &list[i], nil
		}
	}
	return nil, errNotFound
}

// ─── Helpers internes ────────────────────────────────────────────────

func validateDocumentInput(in SaveDocumentInput) error {
	if strings.TrimSpace(in.Slug) == "" {
		return fmt.Errorf("%w: slug requis", errInvalid)
	}
	if !validCategories[in.Category] {
		return fmt.Errorf("%w: catégorie inconnue", errInvalid)
	}
	if !validAudiences[in.Audience] {
		return fmt.Errorf("%w: audience inconnue", errInvalid)
	}
	if strings.TrimSpace(in.Title) == "" {
		return fmt.Errorf("%w: titre requis", errInvalid)
	}
	return nil
}

func versionOr(v, fallback string) string {
	v = strings.TrimSpace(v)
	if v != "" {
		return v
	}
	return fallback
}

func publishTx(ctx context.Context, q *db.Queries, versionID, documentID, locale string) error {
	_, err := publishTxRow(ctx, q, versionID, documentID, locale)
	return err
}

// publishTxRow archive la version publiée courante puis publie le brouillon.
// L'ordre compte : l'index unique partiel refuse deux PUBLISHED simultanées.
func publishTxRow(ctx context.Context, q *db.Queries, versionID, documentID, locale string) (db.LegalDocumentVersion, error) {
	if err := q.ArchivePublishedLegalVersions(ctx, db.ArchivePublishedLegalVersionsParams{
		DocumentID: documentID, Locale: locale,
	}); err != nil {
		return db.LegalDocumentVersion{}, err
	}
	return q.PublishLegalDocumentVersion(ctx, versionID)
}

func adminVersion(row db.LegalDocumentVersion) *Version {
	return &Version{
		ID: row.ID, DocumentID: row.DocumentID, Locale: row.Locale, Version: row.Version,
		Title: row.Title, Summary: row.Summary, Body: row.Body, Status: row.Status,
		Changelog: textPtr(row.Changelog), EffectiveAt: tsTime(row.EffectiveAt),
		PublishedAt: tsTime(row.PublishedAt), ArchivedAt: tsTime(row.ArchivedAt),
		CreatedBy: uuidPtr(row.CreatedBy), CreatedAt: tsTime(row.CreatedAt), UpdatedAt: tsTime(row.UpdatedAt),
	}
}

// isUniqueViolation détecte une violation de contrainte unique Postgres (23505).
func isUniqueViolation(err error) bool {
	var pgErr interface{ SQLState() string }
	if errors.As(err, &pgErr) {
		return pgErr.SQLState() == "23505"
	}
	return strings.Contains(err.Error(), "23505") || strings.Contains(err.Error(), "duplicate key")
}

// IsNotFound expose l'erreur « introuvable » aux handlers.
func IsNotFound(err error) bool { return errors.Is(err, errNotFound) }

// IsForbidden expose l'erreur « réservé superadmin » aux handlers.
func IsForbidden(err error) bool { return errors.Is(err, errForbidden) }

// IsConflict expose l'erreur de conflit (version/slug déjà existant).
func IsConflict(err error) bool { return errors.Is(err, errConflict) }

// IsInvalid expose l'erreur de validation.
func IsInvalid(err error) bool { return errors.Is(err, errInvalid) }
