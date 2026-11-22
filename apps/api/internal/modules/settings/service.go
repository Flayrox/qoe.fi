// Package settings — profil créateur, onboarding, sous-domaine, liens, clés API.
// Migration du module dashboard (packages/api-client actions/dashboard).
package settings

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"sort"
	"strings"
	"time"

	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/antispam"
	"github.com/qoefi/api/internal/apiaccess"
	"github.com/qoefi/api/internal/auditlog"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/domainevents"
	"github.com/qoefi/api/internal/flags"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/permissions"
	"github.com/qoefi/api/internal/queue"
	"github.com/qoefi/api/internal/shared/identifier"
	"github.com/qoefi/api/internal/slug"
	"github.com/qoefi/api/internal/trust"
)

var (
	errForbidden = errors.New("accès refusé")
	errNotFound  = errors.New("introuvable")
)

// Service porte les opérations de settings du créateur.
type Service struct {
	pool pooler
	q    ServiceQuerier

	// flags est conservé pour le futur mode verbeux de l'audit ; la trace
	// AdminAuditLog n'est plus conditionnée par admin-audit-log.
	flags *flags.Service

	// Fournisseur email + adresse d'expéditeur pour l'envoi de test du
	// panneau email (POST /v1/settings/email/test). Nil = fonctionnalité
	// éteinte (503 explicite).
	emailProvider emailTester
	emailFrom     string

	trustSvc *trust.Service
	asynq    *asynq.Client

	// newQ fabrique le querier d'une transaction. Nil = db.New(tx). Permet aux
	// tests d'injecter un faux querier identique à l'intérieur des transactions.
	newQ func(tx db.DBTX) ServiceQuerier
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool, q: db.New(pool)}
}

// SetAsynqClient branche le client asynq pour les alertes de sécurité.
func (s *Service) SetAsynqClient(c *asynq.Client) { s.asynq = c }

// SetFlags branche le service feature flags (journal d'audit admin).
func (s *Service) SetFlags(f *flags.Service) {
	s.flags = f
}

// SetTrustService branche le cache Trust pour invalidation temps réel.
func (s *Service) SetTrustService(ts *trust.Service) {
	s.trustSvc = ts
}

// authorizeSettings vérifie que l'utilisateur peut administrer la publication :
// publication personnelle, ou Média avec la permission manage_settings.
// Une panne de lecture est remontée telle quelle : la transformer en 403
// ferait passer une base indisponible pour un refus de droit.
func (s *Service) authorizeSettings(ctx context.Context, userID, publisherID string) error {
	if userID == "" {
		return errUnauthenticated
	}
	// Identité inexploitable (jeton forgé / sujet non-UUID) : aucun droit, et
	// pas une 500 de cast SQL.
	if !validUUID(userID) {
		return errForbidden
	}
	if p, ok := middleware.GetPrincipal(ctx); ok && p.Type == middleware.PrincipalTypePublisher {
		if p.PublisherID != nil && *p.PublisherID == publisherID {
			return nil
		}
	}
	personal, err := s.q.GetUserPersonalPublisher(ctx, userID)
	if err == nil && personal.String == publisherID && personal.Valid {
		return nil
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return fmt.Errorf("publication personnelle: %w", err)
	}
	member, err := s.q.GetMediaMemberContext(ctx, db.GetMediaMemberContextParams{
		PublisherId: publisherID, UserId: toUUID(userID),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return errForbidden
	}
	if err != nil {
		return fmt.Errorf("membre média: %w", err)
	}
	if !permissions.CanMedia(&permissions.MediaMember{
		Role: member.Role, Permissions: member.Permissions, Status: member.Status,
	}, permissions.PermManageSettings) {
		return errForbidden
	}
	return nil
}

// qtx construit le querier transactionnel. Le champ `newQ` permet aux tests
// d'injecter le même faux querier (erreurs ciblées) à l'intérieur des
// transactions que sur le chemin hors transaction.
func (s *Service) qtx(tx pgx.Tx) ServiceQuerier {
	if s.newQ != nil {
		return s.newQ(tx)
	}
	return db.New(tx)
}

// withTx exécute fn dans une transaction unique (commit si succès, rollback
// sinon). Remplace les séquences « plusieurs écritures indépendantes » qui
// laissaient des états partiels en cas de panne au milieu.
func (s *Service) withTx(ctx context.Context, fn func(tx pgx.Tx) error) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// ── Lecture de la page settings (parité prisma.publication.findUnique include) ──

// SettingsNavItem est un lien de navigation (parité NavigationItem Prisma).
type SettingsNavItem struct {
	ID         string  `json:"id"`
	Label      string  `json:"label"`
	URL        *string `json:"url"`
	Order      int32   `json:"order"`
	IsExternal bool    `json:"isExternal"`
}

// SettingsSocialLink est un lien social (parité SocialLink Prisma).
type SettingsSocialLink struct {
	ID       string `json:"id"`
	Platform string `json:"platform"`
	URL      string `json:"url"`
	Order    int32  `json:"order"`
}

// SettingsArticle est un article de la liste settings (parité Article Prisma).
type SettingsArticle struct {
	ID             string  `json:"id"`
	Title          string  `json:"title"`
	Slug           string  `json:"slug"`
	Content        string  `json:"content"`
	Published      bool    `json:"published"`
	IsPremium      bool    `json:"isPremium"`
	CategoryID     *string `json:"categoryId"`
	SeoTitle       *string `json:"seoTitle"`
	SeoDescription *string `json:"seoDescription"`
	CreatedAt      string  `json:"createdAt"`
}

// SettingsCategory est une catégorie de la liste settings (parité Category Prisma).
type SettingsCategory struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Slug        string  `json:"slug"`
	Description *string `json:"description,omitempty"`
	ParentID    *string `json:"parentId,omitempty"`
}

// SettingsOwner est le propriétaire de la publication (parité user: {select} Prisma).
type SettingsOwner struct {
	ID                   string  `json:"id"`
	Email                *string `json:"email"`
	Username             *string `json:"username"`
	AdvancedSettingsMode bool    `json:"advancedSettingsMode"`
}

// SettingsPublication est la publication complète de la page settings
// (mêmes champs JSON que le include Prisma — mapping studio inchangé).
type SettingsPublisher struct {
	ID             string               `json:"id"`
	Name           string               `json:"name"`
	Slug           string               `json:"slug"`
	Subdomain      *string              `json:"subdomain"`
	CustomDomain   *string              `json:"customDomain"`
	HeroText       *string              `json:"heroText"`
	AccentColor    *string              `json:"accentColor"`
	FontFamily     *string              `json:"fontFamily"`
	ThemeMode      *string              `json:"themeMode"`
	LayoutStyle    *string              `json:"layoutStyle"`
	LogoURL        *string              `json:"logoUrl"`
	HeaderImageURL *string              `json:"headerImageUrl"`
	FooterText     *string              `json:"footerText"`
	SeoTitle       *string              `json:"seoTitle"`
	SeoDescription *string              `json:"seoDescription"`
	AllowIndexing  bool                 `json:"allowIndexing"`
	SupportURL     *string              `json:"supportUrl"`
	Type           string               `json:"type"`
	UmamiWebsiteID *string              `json:"umamiWebsiteId"`
	SiteOptions    map[string]any       `json:"siteOptions"`
	Navigation     []SettingsNavItem    `json:"navigation"`
	SocialLinks    []SettingsSocialLink `json:"socialLinks"`
	Articles       []SettingsArticle    `json:"articles"`
	Categories     []SettingsCategory   `json:"categories"`
	User           *SettingsOwner       `json:"user"`
}

// GetPublisherSettings retourne la publication + relations de la page
// settings créateur. Accès : publication personnelle OU média avec
// manage_settings (même check que les écritures).
func (s *Service) GetPublisherSettings(ctx context.Context, userID, publisherID string) (*SettingsPublisher, error) {
	if err := s.authorizeSettings(ctx, userID, publisherID); err != nil {
		return nil, errForbidden
	}

	row, err := s.q.GetPublisherForSettings(ctx, publisherID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errNotFound
		}
		return nil, err
	}

	pub := &SettingsPublisher{
		ID: row.ID, Name: row.Name, Slug: row.Slug,
		Subdomain: textPtr(row.Subdomain), CustomDomain: textPtr(row.CustomDomain),
		HeroText: textPtr(row.HeroText), AccentColor: textPtr(row.AccentColor),
		FontFamily: textPtr(row.FontFamily), ThemeMode: textPtr(row.ThemeMode),
		LayoutStyle: textPtr(row.LayoutStyle), LogoURL: textPtr(row.LogoUrl),
		HeaderImageURL: textPtr(row.HeaderImageUrl), FooterText: textPtr(row.FooterText),
		SeoTitle: textPtr(row.SeoTitle), SeoDescription: textPtr(row.SeoDescription),
		AllowIndexing: row.AllowIndexing, SupportURL: textPtr(row.SupportUrl),
		Type: string(row.Type), UmamiWebsiteID: textPtr(row.UmamiWebsiteId),
		SiteOptions: map[string]any{},
		Navigation:  []SettingsNavItem{},
		SocialLinks: []SettingsSocialLink{},
		Articles:    []SettingsArticle{},
		Categories:  []SettingsCategory{},
	}
	if len(row.SiteOptions) > 0 {
		var opts map[string]any
		if err := json.Unmarshal(row.SiteOptions, &opts); err == nil && opts != nil {
			pub.SiteOptions = opts
		}
	}
	if row.OwnerID != "" {
		pub.User = &SettingsOwner{
			ID: row.OwnerID, Email: textPtr(row.OwnerEmail),
			Username:             textPtr(row.OwnerUsername),
			AdvancedSettingsMode: row.OwnerAdvancedSettingsMode.Bool,
		}
	}

	navRows, err := s.q.ListNavigationForPublisher(ctx, publisherID)
	if err != nil {
		return nil, err
	}
	for _, n := range navRows {
		pub.Navigation = append(pub.Navigation, SettingsNavItem{
			ID: n.ID, Label: n.Label, URL: textPtr(n.Url),
			Order: n.Order, IsExternal: n.IsExternal,
		})
	}

	socialRows, err := s.q.ListSocialLinksForPublisher(ctx, publisherID)
	if err != nil {
		return nil, err
	}
	for _, sl := range socialRows {
		pub.SocialLinks = append(pub.SocialLinks, SettingsSocialLink{
			ID: sl.ID, Platform: sl.Platform, URL: sl.Url, Order: sl.Order,
		})
	}

	articleRows, err := s.q.ListArticlesForSettings(ctx, publisherID)
	if err != nil {
		return nil, err
	}
	for _, a := range articleRows {
		pub.Articles = append(pub.Articles, SettingsArticle{
			ID: a.ID, Title: a.Title, Slug: a.Slug, Content: a.Content,
			Published: a.Published, IsPremium: a.IsPremium,
			CategoryID: textPtr(a.CategoryId), SeoTitle: textPtr(a.SeoTitle),
			SeoDescription: textPtr(a.SeoDescription),
			CreatedAt:      a.CreatedAt.Time.Format(time.RFC3339),
		})
	}

	catRows, err := s.q.ListCategoriesForPublisher(ctx, publisherID)
	if err != nil {
		return nil, err
	}
	for _, c := range catRows {
		pub.Categories = append(pub.Categories, SettingsCategory{
			ID:          c.ID,
			Name:        c.Name,
			Slug:        c.Slug,
			Description: textPtr(c.Description),
			ParentID:    textPtr(c.ParentId),
		})
	}

	return pub, nil
}

// colonnes Publication autorisées pour le profil (body key → column).
var profileStringColumns = map[string]string{
	"name":           "name",
	"heroText":       "heroText",
	"accentColor":    "accentColor",
	"layoutStyle":    "layoutStyle",
	"logoUrl":        "logoUrl",
	"headerImageUrl": "headerImageUrl",
	"fontFamily":     "fontFamily",
	"themeMode":      "themeMode",
	"footerText":     "footerText",
	"seoTitle":       "seoTitle",
	"seoDescription": "seoDescription",
	"supportUrl":     "supportUrl",
}

// UpdateProfile applique une mise à jour partielle du profil (miroir updateCreatorProfileAction).
// body : clés présentes = champs à modifier, valeur null = effacer.
func (s *Service) UpdateProfile(ctx context.Context, userID, publisherID string, body map[string]any) (db.GetUserForSettingsRow, error) {
	if err := s.authorizeSettings(ctx, userID, publisherID); err != nil {
		return db.GetUserForSettingsRow{}, err
	}

	fields := map[string]any{}
	for key, col := range profileStringColumns {
		if v, ok := body[key]; ok {
			switch {
			case v == nil:
				fields[col] = nil
			case isString(v):
				// Parité TS : un name vide n'est pas appliqué.
				if key == "name" && v == "" {
					continue
				}
				if key == "logoUrl" || key == "headerImageUrl" || key == "supportUrl" {
					if err := antispam.ValidateSafeURL(v.(string)); err != nil {
						return db.GetUserForSettingsRow{}, err
					}
					fields[col] = v
				} else {
					maxR := 200
					switch key {
					case "name":
						maxR = 120
					case "heroText", "footerText", "seoDescription":
						maxR = 1000
					}
					cleaned, err := antispam.SanitizeAndValidateText(v.(string), 0, maxR, antispam.TextOptions{
						AllowNewlines: key == "heroText" || key == "footerText" || key == "seoDescription",
						CheckXSS:      true,
					})
					if err != nil {
						return db.GetUserForSettingsRow{}, err
					}
					fields[col] = cleaned
				}
			default:
				return db.GetUserForSettingsRow{}, fmt.Errorf("champ invalide: %s", key)
			}
		}
	}
	if v, ok := body["allowIndexing"]; ok {
		b, ok := v.(bool)
		if !ok {
			return db.GetUserForSettingsRow{}, errors.New("allowIndexing doit être un booléen")
		}
		fields["allowIndexing"] = b
	}
	if v, ok := body["siteOptions"]; ok {
		if v == nil {
			fields["siteOptions"] = []byte("{}")
		} else {
			raw, err := json.Marshal(v)
			if err != nil {
				return db.GetUserForSettingsRow{}, errors.New("siteOptions JSON invalide")
			}
			fields["siteOptions"] = raw
		}
	}

	var onboarding *pgtype.Text
	if v, ok := body["onboardingText"]; ok {
		t, err := textFromAny(v)
		if err != nil {
			return db.GetUserForSettingsRow{}, err
		}
		if t.Valid {
			cleaned, err := antispam.SanitizeAndValidateText(t.String, 0, 1000, antispam.TextOptions{
				AllowNewlines: true,
				CheckXSS:      true,
			})
			if err != nil {
				return db.GetUserForSettingsRow{}, err
			}
			t = pgtype.Text{String: cleaned, Valid: cleaned != ""}
		}
		onboarding = &t
	}

	// Profil et texte d'onboarding sont deux écritures : une seule transaction,
	// sinon une panne au milieu laisse la publication modifiée et le compte non.
	if len(fields) > 0 || onboarding != nil {
		if err := s.withTx(ctx, func(tx pgx.Tx) error {
			if len(fields) > 0 {
				if err := s.updatePublisherTx(ctx, tx, publisherID, fields); err != nil {
					return err
				}
			}
			if onboarding != nil {
				return s.qtx(tx).UpdateUserOnboardingText(ctx, db.UpdateUserOnboardingTextParams{
					ID: userID, OnboardingText: *onboarding,
				})
			}
			return nil
		}); err != nil {
			return db.GetUserForSettingsRow{}, err
		}
	}

	row, err := s.q.GetUserForSettings(ctx, userID)
	if err != nil {
		// Panne ≠ compte absent : le handler doit répondre 500, pas 404.
		return db.GetUserForSettingsRow{}, err
	}
	return row, nil
}

// updatePublisher construit un UPDATE dynamique limité à un allowlist de colonnes.
func (s *Service) updatePublisher(ctx context.Context, publisherID string, fields map[string]any) error {
	return s.withTx(ctx, func(tx pgx.Tx) error {
		return s.updatePublisherTx(ctx, tx, publisherID, fields)
	})
}

// updatePublisherTx applique l'UPDATE dans la transaction fournie.
func (s *Service) updatePublisherTx(ctx context.Context, tx pgx.Tx, publisherID string, fields map[string]any) error {
	keys := make([]string, 0, len(fields))
	for k := range fields {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	sets := make([]string, 0, len(keys))
	args := make([]any, 0, len(keys)+1)
	args = append(args, publisherID)
	for _, k := range keys {
		switch v := fields[k].(type) {
		case []byte:
			// Le pool tourne en QueryExecModeExec (PgBouncer) : pgx encoderait un
			// []byte en bytea → 22P02 sur une colonne JSONB. On passe donc le JSON
			// en texte et on le caste côté SQL.
			sets = append(sets, fmt.Sprintf("%q = $%d::jsonb", k, len(args)+1))
			args = append(args, string(v))
		default:
			sets = append(sets, fmt.Sprintf("%q = $%d", k, len(args)+1))
			args = append(args, fields[k])
		}
	}
	query := fmt.Sprintf(
		`UPDATE "Publisher" SET %s, "updatedAt" = now() WHERE id = $1`,
		strings.Join(sets, ", "),
	)
	_, err := tx.Exec(ctx, query, args...)
	return err
}

// Tenant subdomains are single DNS labels: dots are deliberately forbidden.
var subdomainRegex = identifier.SubdomainPattern

// CheckSubdomain valide un sous-domaine et vérifie sa disponibilité.
func isReservedIdentifier(ctx context.Context, pool pooler, kind, value string) (bool, error) {
	var raw string
	err := pool.QueryRow(ctx, `SELECT value FROM "SystemConfig" WHERE key = $1`, "RESERVED_"+strings.ToUpper(kind)+"S").Scan(&raw)
	if errors.Is(err, pgx.ErrNoRows) {
		raw = "admin,api,app,auth,billing,docs,feed,home,login,settings,studio,www"
	} else if err != nil {
		return false, err
	}
	for _, item := range strings.FieldsFunc(strings.ToLower(raw), func(r rune) bool { return r == ',' || r == '\n' || r == '\r' || r == ' ' }) {
		if item == strings.ToLower(value) {
			return true, nil
		}
	}
	return false, nil
}

// validateSubdomain normalise puis valide un sous-domaine. Source unique de
// vérité pour le check public ET l'écriture : avant, le check normalisait
// (NormalizeSubdomain) alors que l'écriture ne faisait que minuscule+trim, si
// bien qu'un nom annoncé disponible pouvait être refusé à l'enregistrement.
// Retourne (nom normalisé, "") ou ("", raison du refus).
func validateSubdomain(subdomain string) (string, string) {
	// Subdomains intentionally keep their existing hyphenated syntax; only the
	// protected-name source is shared with the admin configuration contract.
	clean := identifier.NormalizeSubdomain(subdomain)
	if !identifier.ValidSubdomain(clean) || strings.Contains(clean, ".") {
		return "", "Le sous-domaine ne doit contenir que des lettres minuscules et des tirets, sans point."
	}
	if len(clean) < 3 || len(clean) > 30 {
		return "", "La longueur doit être comprise entre 3 et 30 caractères."
	}
	if strings.HasPrefix(clean, "-") || strings.HasSuffix(clean, "-") || strings.Contains(clean, "--") {
		return "", "Le sous-domaine ne peut pas commencer, finir ou répéter un tiret."
	}
	return clean, ""
}

// CheckSubdomain valide un sous-domaine et vérifie sa disponibilité. Une panne
// de lecture est remontée : répondre « indisponible » (200) sur une base en
// panne ferait passer toute panne pour un nom déjà pris.
func (s *Service) CheckSubdomain(ctx context.Context, subdomain string) (available bool, reason string, err error) {
	clean, reason := validateSubdomain(subdomain)
	if reason != "" {
		return false, reason, nil
	}
	reserved, err := isReservedIdentifier(ctx, s.pool, "subdomain", clean)
	if err != nil {
		return false, "", err
	}
	// Denylist unique partagée avec les usernames (identifier.reserved).
	if reserved || identifier.IsReserved(clean) {
		return false, "Ce nom de sous-domaine est réservé par la plateforme.", nil
	}
	exists, err := s.q.CheckSubdomainExists(ctx, pgtype.Text{String: clean, Valid: true})
	if err != nil {
		return false, "", err
	}
	if exists {
		return false, "Ce sous-domaine est déjà attribué à une autre publication.", nil
	}
	return true, "", nil
}

// UpdateSubdomain change le sous-domaine de la publication active. Un
// sous-domaine vide retire le sous-domaine (chemin explicite, plus de branche
// morte réservée au handler). Retourne la valeur réellement enregistrée.
func (s *Service) UpdateSubdomain(ctx context.Context, userID, publisherID, subdomain string) (string, error) {
	if err := s.authorizeSettings(ctx, userID, publisherID); err != nil {
		return "", err
	}
	if strings.TrimSpace(subdomain) == "" {
		if err := s.q.UpdatePublisherSubdomain(ctx, db.UpdatePublisherSubdomainParams{
			ID:        publisherID,
			Subdomain: pgtype.Text{Valid: false},
		}); err != nil {
			return "", err
		}
		return "", nil
	}

	clean, reason := validateSubdomain(subdomain)
	if reason != "" {
		return "", invalid("%s", reason)
	}

	existsOther, err := s.q.CheckSubdomainExistsOther(ctx, db.CheckSubdomainExistsOtherParams{
		Subdomain: pgtype.Text{String: clean, Valid: true},
		ID:        publisherID,
	})
	if err != nil {
		return "", err
	}
	if existsOther {
		return "", invalid("Ce sous-domaine est déjà attribué à une autre publication.")
	}
	reserved, err := isReservedIdentifier(ctx, s.pool, "subdomain", clean)
	if err != nil {
		return "", err
	}
	if reserved || identifier.IsReserved(clean) {
		return "", invalid("Ce nom de sous-domaine est réservé par la plateforme.")
	}

	if err := s.q.UpdatePublisherSubdomain(ctx, db.UpdatePublisherSubdomainParams{
		ID:        publisherID,
		Subdomain: pgtype.Text{String: clean, Valid: true},
	}); err != nil {
		// The database unique index is authoritative under concurrent requests.
		// Do not leak a driver error or turn a race into a 500.
		if isUniqueViolation(err) {
			return "", invalid("Ce sous-domaine est déjà attribué à une autre publication.")
		}
		return "", err
	}
	return clean, nil
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

// NavigationLink est un lien de navigation du studio.
type NavigationLink struct {
	Label string `json:"label"`
	URL   string `json:"url"`
}

// SaveNavigation remplace la liste des liens de navigation.
func (s *Service) SaveNavigation(ctx context.Context, userID, publisherID string, links []NavigationLink) error {
	if err := s.authorizeSettings(ctx, userID, publisherID); err != nil {
		return err
	}
	if len(links) > 20 {
		return &antispam.RejectionError{HTTPStatus: 400, Code: antispam.CodeContentTooLarge, Message: "Maximum 20 liens de navigation autorisés."}
	}
	for i := range links {
		cleaned, err := antispam.SanitizeAndValidateText(links[i].Label, 1, 80, antispam.TextOptions{
			AllowNewlines: false,
			CheckXSS:      true,
		})
		if err != nil {
			return err
		}
		links[i].Label = cleaned
		if err := antispam.ValidateSafeURL(links[i].URL); err != nil {
			return err
		}
	}
	// Remplacement atomique : le DELETE puis les inserts vivaient hors
	// transaction, une panne au milieu effaçait définitivement tous les liens.
	return s.withTx(ctx, func(tx pgx.Tx) error {
		q := s.qtx(tx)
		if err := q.DeleteNavigationItems(ctx, publisherID); err != nil {
			return err
		}
		for i, link := range links {
			if err := q.InsertNavigationItem(ctx, db.InsertNavigationItemParams{
				Label:       link.Label,
				Url:         textFromString(link.URL),
				Order:       int32(i),
				IsExternal:  strings.HasPrefix(link.URL, "http"),
				PublisherId: publisherID,
			}); err != nil {
				return err
			}
		}
		return nil
	})
}

// SocialLink est un lien social du studio.
type SocialLink struct {
	Platform string `json:"platform"`
	URL      string `json:"url"`
}

// SaveSocial remplace la liste des liens sociaux.
func (s *Service) SaveSocial(ctx context.Context, userID, publisherID string, links []SocialLink) error {
	if err := s.authorizeSettings(ctx, userID, publisherID); err != nil {
		return err
	}
	if len(links) > 20 {
		return &antispam.RejectionError{HTTPStatus: 400, Code: antispam.CodeContentTooLarge, Message: "Maximum 20 liens sociaux autorisés."}
	}
	for i := range links {
		cleaned, err := antispam.SanitizeAndValidateText(links[i].Platform, 1, 40, antispam.TextOptions{
			AllowNewlines: false,
			CheckXSS:      true,
		})
		if err != nil {
			return err
		}
		links[i].Platform = cleaned
		if err := antispam.ValidateSafeURL(links[i].URL); err != nil {
			return err
		}
	}
	// Idem navigation : DELETE + INSERT atomiques.
	return s.withTx(ctx, func(tx pgx.Tx) error {
		q := s.qtx(tx)
		if err := q.DeleteSocialLinks(ctx, publisherID); err != nil {
			return err
		}
		for i, link := range links {
			if err := q.InsertSocialLink(ctx, db.InsertSocialLinkParams{
				Platform:    link.Platform,
				Url:         link.URL,
				Order:       int32(i),
				PublisherId: publisherID,
			}); err != nil {
				return err
			}
		}
		return nil
	})
}

// SetDownloadDefault règle le défaut de téléchargement des NOUVEAUX articles
// (appliqué à la création — l'auteur ajuste ensuite par article). Retourne
// la valeur stockée.
func (s *Service) SetDownloadDefault(ctx context.Context, userID, publisherID string, allow bool) (bool, error) {
	if err := s.authorizeSettings(ctx, userID, publisherID); err != nil {
		return false, err
	}
	return s.q.SetPublisherDownloadDefault(ctx, db.SetPublisherDownloadDefaultParams{
		ID:                   publisherID,
		AllowDownloadDefault: allow,
	})
}

// SubmitApiApplication enregistre une demande d'accès API (pending).
// Une demande déjà en attente est idempotente ; une demande DÉJÀ APPROUVÉE
// n'est jamais remise en attente (la re-soumission écrasait la décision d'un
// administrateur et remettait l'accès en file d'attente).
func (s *Service) SubmitApiApplication(ctx context.Context, userID, reason string) error {
	status, err := s.q.GetUserApiAccessStatus(ctx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return errNotFound
		}
		return err
	}
	switch status {
	case "pending":
		return nil
	case "approved":
		return policy("Votre accès API est déjà approuvé.")
	}
	return s.q.SetApiApplication(ctx, db.SetApiApplicationParams{
		ID: userID, ApiApplicationReason: textFromString(reason),
	})
}

// scopesValides est l'allowlist des scopes de clé API (moindre privilège).
var scopesValides = map[string]bool{"READ": true, "WRITE": true, "ANALYTICS": true}

// allowedApiScopes retourne les scopes de clé API autorisés par les grants API
// entrante de l'utilisateur, filtrés par les modules actifs sur la plateforme.
func (s *Service) allowedApiScopes(ctx context.Context, userID string) ([]string, error) {
	grants, err := s.q.GetUserApiGrants(ctx, userID)
	if err != nil {
		// Panne ≠ compte absent : la remonter telle quelle (500 côté handler).
		return nil, err
	}
	allowed := make([]string, 0, 3)
	for _, sc := range apiaccess.ScopesForGrants(grants) {
		module := apiaccess.ScopeModule(sc)
		if module != "" && apiaccess.IsEnabled(ctx, s.pool, module) {
			allowed = append(allowed, sc)
		}
	}
	return allowed, nil
}

// GenerateApiKey crée une clé API qoe_live_ et retourne le token en clair.
// scopes : vide = accès complet sur les permissions accordées, sinon filtrage
// strict — une clé ne peut jamais porter un scope non couvert par les grants
// API entrante de l'utilisateur (moindre privilège, permissions modulables).
func (s *Service) GenerateApiKey(ctx context.Context, userID, name string, scopes []string) (string, error) {
	status, err := s.q.GetUserApiAccessStatus(ctx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", errNotFound
		}
		return "", err
	}
	if status != "approved" {
		return "", policy("Votre demande d'accès à l'API doit être approuvée par un administrateur.")
	}

	allowedScopes, err := s.allowedApiScopes(ctx, userID)
	if err != nil {
		return "", err
	}
	if len(allowedScopes) == 0 {
		return "", policy("Aucune permission d'API entrante (lecture/écriture/analytics) ne vous a été accordée.")
	}

	finalScopes := make([]string, 0, len(scopes))
	seen := map[string]bool{}
	for _, s := range scopes {
		if !scopesValides[s] || seen[s] || !middleware.HasScope(allowedScopes, s) {
			continue
		}
		seen[s] = true
		finalScopes = append(finalScopes, s)
	}
	if len(scopes) > 0 && len(finalScopes) == 0 {
		return "", policy("Sélectionnez au moins un scope autorisé par vos permissions (lecture, écriture, analytics).")
	}
	// scopes vide = accès complet sur les permissions accordées.
	if len(finalScopes) == 0 {
		finalScopes = allowedScopes
	}

	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	apiKey := "qoe_live_" + hex.EncodeToString(raw)
	sum := sha256.Sum256([]byte(apiKey))
	keyHash := hex.EncodeToString(sum[:])

	if name == "" {
		name = "Clé API"
	}
	if err := s.q.InsertApiKey(ctx, db.InsertApiKeyParams{
		Name: name, KeyPrefix: "qoe_live", KeyHash: keyHash, Scopes: finalScopes, UserId: toUUID(userID),
	}); err != nil {
		return "", err
	}
	auditlog.Write(ctx, s.q, s.flags, userID, "api.key.created", "user", userID,
		map[string]any{"name": name, "scopes": finalScopes})
	s.recordApiKeySecurityEvent(ctx, userID, "", "api_key_created", map[string]any{"name": name, "scopes": finalScopes})
	return apiKey, nil
}

// RevokeApiKey révoque une clé API de l'utilisateur. Une clé inexistante (ou
// appartenant à autrui) répond 404 au lieu d'un succès fantôme.
func (s *Service) RevokeApiKey(ctx context.Context, userID, id string) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM "ApiKey" WHERE id = $1 AND "userId" = $2`, id, toUUID(userID))
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errNotFound
	}
	auditlog.Write(ctx, s.q, s.flags, userID, "api.key.revoked", "user", userID,
		map[string]any{"keyId": id})
	s.recordApiKeySecurityEvent(ctx, userID, id, "api_key_revoked", map[string]any{"keyId": id})
	return nil
}

// RotateApiKey régénère le secret d'une clé API existante : même id, nouveaux
// keyPrefix/keyHash — les anciens tokens qoe_live_* sont immédiatement
// invalides (auth par hash). Retourne le nouveau token en clair (affiché 1x).
func (s *Service) RotateApiKey(ctx context.Context, userID, id string) (string, error) {
	status, err := s.q.GetUserApiAccessStatus(ctx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", errNotFound
		}
		return "", err
	}
	if status != "approved" {
		return "", policy("Votre demande d'accès à l'API doit être approuvée par un administrateur.")
	}
	if _, err := s.allowedApiScopes(ctx, userID); err != nil {
		return "", err
	}

	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	apiKey := "qoe_live_" + hex.EncodeToString(raw)
	sum := sha256.Sum256([]byte(apiKey))

	n, err := s.q.UpdateApiKeySecret(ctx, db.UpdateApiKeySecretParams{
		ID: id, KeyHash: hex.EncodeToString(sum[:]), KeyPrefix: "qoe_live", UserId: toUUID(userID),
	})
	if err != nil {
		return "", err
	}
	if n == 0 {
		return "", errNotFound
	}
	auditlog.Write(ctx, s.q, s.flags, userID, "api.key.rotated", "user", userID,
		map[string]any{"keyId": id})
	s.recordApiKeySecurityEvent(ctx, userID, id, "api_key_rotated", map[string]any{"keyId": id})
	return apiKey, nil
}

// recordApiKeySecurityEvent journalise la vie d'une clé API. Chaque échec est
// tracé : un insert silencieusement raté laissait le journal de sécurité vide
// (même défaut que F538 côté users). `metadata` est toujours un JSON objet,
// sinon la contrainte NOT NULL de la colonne rejette la ligne.
func (s *Service) recordApiKeySecurityEvent(ctx context.Context, userID, keyID, eventType string, meta map[string]any) {
	if s.pool == nil || userID == "" {
		return
	}
	if meta == nil {
		meta = map[string]any{}
	}
	metaBytes, err := json.Marshal(meta)
	if err != nil {
		log.Printf("[settings] security event %s: marshal metadata: %v", eventType, err)
		metaBytes = []byte("{}")
	}
	if _, err := db.New(s.pool).InsertSecurityEvent(ctx, db.InsertSecurityEventParams{
		UserId:    toUUID(userID),
		ApiKeyId:  pgtype.Text{String: keyID, Valid: keyID != ""},
		EventType: eventType,
		Metadata:  metaBytes,
	}); err != nil {
		log.Printf("[settings] security event %s (%s): insert: %v", eventType, userID, err)
	}
	var email string
	if err := s.pool.QueryRow(ctx, `SELECT COALESCE(email, '') FROM "User" WHERE id = $1`, toUUID(userID)).Scan(&email); err != nil {
		log.Printf("[settings] security event %s (%s): email: %v", eventType, userID, err)
		return
	}
	if email != "" {
		if err := queue.PublishSecurityAlertEmail(s.asynq, queue.SecurityAlertEmailPayload{
			UserID:    userID,
			Email:     email,
			EventType: eventType,
			Occurred:  time.Now().UTC().Format(time.RFC3339),
		}); err != nil {
			log.Printf("[settings] security event %s (%s): alerte email: %v", eventType, userID, err)
		}
	}
}

// ApiKeyDTO est une clé API listée (le hash n'est jamais exposé).
type ApiKeyDTO struct {
	ID         string   `json:"id"`
	Name       string   `json:"name"`
	KeyPrefix  string   `json:"keyPrefix"`
	Scopes     []string `json:"scopes"`
	CreatedAt  string   `json:"createdAt"`
	LastUsedAt *string  `json:"lastUsedAt"`
}

// ListApiKeys retourne les clés API de l'utilisateur (triées par création déc).
func (s *Service) ListApiKeys(ctx context.Context, userID string) ([]ApiKeyDTO, error) {
	rows, err := s.q.ListApiKeys(ctx, toUUID(userID))
	if err != nil {
		return nil, err
	}
	out := make([]ApiKeyDTO, 0, len(rows))
	for _, r := range rows {
		dto := ApiKeyDTO{
			ID:        r.ID,
			Name:      r.Name,
			KeyPrefix: r.KeyPrefix,
			Scopes:    r.Scopes,
			CreatedAt: r.CreatedAt.Time.Format(time.RFC3339),
		}
		if r.LastUsedAt.Valid {
			last := r.LastUsedAt.Time.Format(time.RFC3339)
			dto.LastUsedAt = &last
		}
		out = append(out, dto)
	}
	return out, nil
}

// OnboardingInput porte les données du formulaire d'onboarding.
type OnboardingInput struct {
	Name        string `json:"name"`
	HeroText    string `json:"heroText"`
	Subdomain   string `json:"subdomain"`
	LayoutStyle string `json:"layoutStyle"`
}

// CompleteOnboarding finalise l'onboarding : rôle, publication personnelle +
// slug. Toutes les écritures sont dans une transaction : avant, le compte
// était marqué « onboardé » avec le rôle creator avant la création de la
// publication, si bien qu'une panne laissait un compte sans publication que
// l'écran ne pouvait plus réparer (ou une publication orpheline si le lien
// échouait).
func (s *Service) CompleteOnboarding(ctx context.Context, userID string, in OnboardingInput) error {
	if userID == "" {
		return errUnauthenticated
	}
	user, err := s.q.GetUserForSettings(ctx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return errNotFound
		}
		return err
	}

	role := "creator"
	if user.Role == "superadmin" {
		role = "superadmin"
	}
	name := strings.TrimSpace(in.Name)
	if name == "" {
		switch {
		case user.Name.Valid && user.Name.String != "":
			name = user.Name.String
		case user.Username.Valid && user.Username.String != "":
			name = user.Username.String
		default:
			name = strings.SplitN(user.Email, "@", 2)[0]
		}
	}
	cleanedName, err := antispam.SanitizeAndValidateText(name, 1, 120, antispam.TextOptions{CheckXSS: true})
	if err != nil {
		return err
	}
	name = cleanedName

	heroText := pgtype.Text{}
	if strings.TrimSpace(in.HeroText) != "" {
		cleaned, err := antispam.SanitizeAndValidateText(in.HeroText, 0, 1000, antispam.TextOptions{
			AllowNewlines: true,
			CheckXSS:      true,
		})
		if err != nil {
			return err
		}
		heroText = textFromString(cleaned)
	}

	layoutStyle := pgtype.Text{}
	if strings.TrimSpace(in.LayoutStyle) != "" {
		cleaned, err := antispam.SanitizeAndValidateText(in.LayoutStyle, 1, 40, antispam.TextOptions{CheckXSS: true})
		if err != nil {
			return err
		}
		layoutStyle = textFromString(cleaned)
	}

	// Sous-domaine éventuel : même validation que le check public (syntaxe,
	// réservés) et disponibilité, sinon l'onboarding enregistrait un
	// sous-domaine invalide ou déjà pris (puis 500 sur l'index d'unicité).
	subdomain := pgtype.Text{}
	if strings.TrimSpace(in.Subdomain) != "" {
		clean, reason := validateSubdomain(in.Subdomain)
		if reason != "" {
			return invalid("%s", reason)
		}
		reserved, err := isReservedIdentifier(ctx, s.pool, "subdomain", clean)
		if err != nil {
			return err
		}
		if reserved || identifier.IsReserved(clean) {
			return invalid("Ce nom de sous-domaine est réservé par la plateforme.")
		}
		exists, err := s.q.CheckSubdomainExistsOther(ctx, db.CheckSubdomainExistsOtherParams{
			Subdomain: pgtype.Text{String: clean, Valid: true},
			ID:        user.PublisherId.String,
		})
		if err != nil {
			return err
		}
		if exists {
			return invalid("Ce sous-domaine est déjà attribué à une autre publication.")
		}
		subdomain = textFromString(clean)
	}

	pubSlug := name
	if user.Username.Valid && user.Username.String != "" {
		pubSlug = user.Username.String
	}
	pubSlug = slug.Slugify(pubSlug)
	if pubSlug == "" {
		pubSlug = "creator"
	}
	hasPublisher := user.PublisherId.Valid && user.PublisherId.String != ""

	err = s.withTx(ctx, func(tx pgx.Tx) error {
		q := s.qtx(tx)
		if err := q.CompleteOnboardingUser(ctx, db.CompleteOnboardingUserParams{
			ID: userID, Role: role, Name: textFromString(name),
		}); err != nil {
			return err
		}
		if hasPublisher {
			return q.UpdatePersonalPublisher(ctx, db.UpdatePersonalPublisherParams{
				ID: user.PublisherId.String, Name: name, Subdomain: subdomain,
				HeroText: heroText, LayoutStyle: layoutStyle,
			})
		}
		id, err := q.CreatePersonalPublisher(ctx, db.CreatePersonalPublisherParams{
			Name: name, Slug: pubSlug, Subdomain: subdomain, HeroText: heroText,
			LayoutStyle: layoutStyle, LogoUrl: user.LogoUrl, IsCertified: user.IsCertified,
		})
		if err != nil {
			if isUniqueViolation(err) {
				return invalid("Ce nom de publication est déjà utilisé, choisissez un autre nom.")
			}
			return err
		}
		return q.LinkUserPublisher(ctx, db.LinkUserPublisherParams{
			ID: userID, PublisherId: textFromString(id),
		})
	})
	if err != nil {
		return err
	}
	if s.trustSvc != nil {
		s.trustSvc.InvalidateUser(ctx, userID)
	}
	return nil
}

func textPtr(t pgtype.Text) *string {
	if !t.Valid {
		return nil
	}
	v := t.String
	return &v
}

func toUUID(id string) pgtype.UUID {
	u := pgtype.UUID{}
	_ = u.Scan(id)
	return u
}

// validUUID indique si id est un UUID exploitable en base.
func validUUID(id string) bool {
	u := pgtype.UUID{}
	return u.Scan(id) == nil && u.Valid
}

func isString(v any) bool {
	_, ok := v.(string)
	return ok
}

func textFromString(s string) pgtype.Text {
	if s == "" {
		return pgtype.Text{}
	}
	return pgtype.Text{String: s, Valid: true}
}

func textFromAny(v any) (pgtype.Text, error) {
	if v == nil {
		return pgtype.Text{}, nil
	}
	s, ok := v.(string)
	if !ok {
		return pgtype.Text{}, errors.New("champ texte invalide")
	}
	return textFromString(s), nil
}

// ── Préférences lecteur (userSettings) + demande de suppression ───────────

// UserSettings est la ligne userSettings du lecteur (GET/PATCH /v1/settings/preferences).
type UserSettings struct {
	ID                            string `json:"id"`
	UserID                        string `json:"userId"`
	ProfileVisibility             string `json:"profileVisibility"`
	AllowMentions                 bool   `json:"allowMentions"`
	AllowCollaborationInvites     bool   `json:"allowCollaborationInvites"`
	CollaborationInvitePermission string `json:"collaborationInvitePermission"`
	ShowSensitiveContent          bool   `json:"showSensitiveContent"`
	LikeVisibility                string `json:"likeVisibility"`
	AutoplayMedia                 bool   `json:"autoplayMedia"`
	ReduceMotion                  bool   `json:"reduceMotion"`
	HighContrast                  bool   `json:"highContrast"`
	FontScale                     int32  `json:"fontScale"`
	DefaultFeed                   string `json:"defaultFeed"`
	CreatedAt                     string `json:"createdAt"`
	UpdatedAt                     string `json:"updatedAt"`
}

const (
	defaultUserSettingsProfileVisibility = "PUBLIC"
	defaultUserSettingsFontScale         = 100
	defaultUserSettingsDefaultFeed       = "FOLLOWING"
)

func scanUserSettings(row pgx.Row) (UserSettings, error) {
	var s UserSettings
	var createdAt, updatedAt pgtype.Timestamp
	var collabPerm pgtype.Text
	err := row.Scan(&s.ID, &s.UserID, &s.ProfileVisibility, &s.AllowMentions,
		&s.AllowCollaborationInvites, &collabPerm, &s.ShowSensitiveContent, &s.LikeVisibility,
		&s.AutoplayMedia, &s.ReduceMotion, &s.HighContrast, &s.FontScale, &s.DefaultFeed,
		&createdAt, &updatedAt)
	if err != nil {
		return s, err
	}
	s.CollaborationInvitePermission = "EVERYONE"
	if collabPerm.Valid && collabPerm.String != "" {
		s.CollaborationInvitePermission = collabPerm.String
	}
	s.CreatedAt = createdAt.Time.Format(time.RFC3339)
	s.UpdatedAt = updatedAt.Time.Format(time.RFC3339)
	return s, nil
}

// userSettingsSelect projette la ligne « UserSettings » dans l'ordre attendu
// par scanUserSettings.
const userSettingsSelect = `id, "userId", "profileVisibility", "allowMentions", "allowCollaborationInvites",
	       COALESCE("collaborationInvitePermission", 'EVERYONE'),
	       "showSensitiveContent", "likeVisibility", "autoplayMedia", "reduceMotion", "highContrast",
	       "fontScale", "defaultFeed", "createdAt", "updatedAt"`

// GetUserSettings lit les préférences du lecteur, en créant la ligne par
// défaut si absente (équivalent de l'upsert Prisma de getAccountSettingsAction).
// Un seul aller-retour : l'ancienne version faisait SELECT puis INSERT puis
// SELECT récursif, et deux lectures concurrentes sans ligne pouvaient partir en
// boucle sur un conflit d'unicité.
func (s *Service) GetUserSettings(ctx context.Context, userID string) (UserSettings, error) {
	if userID == "" {
		return UserSettings{}, errUnauthenticated
	}
	row := s.pool.QueryRow(ctx, `
		INSERT INTO "UserSettings" (id, "userId", "collaborationInvitePermission", "likeVisibility", "createdAt", "updatedAt")
		VALUES (gen_random_uuid()::text, $1, 'EVERYONE', 'PUBLIC', now(), now())
		ON CONFLICT ("userId") DO UPDATE SET "updatedAt" = "UserSettings"."updatedAt"
		RETURNING `+userSettingsSelect, toUUID(userID))
	return scanUserSettings(row)
}

// UpdateUserSettings applique un patch validé sur les préférences du lecteur.
// Seules les clés connues et validées sont écrites (miroir de
// updateAccountSettingsAction).
func (s *Service) UpdateUserSettings(ctx context.Context, userID string, patch map[string]any) (UserSettings, error) {
	allowed := map[string]func(any) bool{
		"profileVisibility": func(v any) bool {
			str, ok := v.(string)
			return ok && (str == "PUBLIC" || str == "FOLLOWERS" || str == "PRIVATE")
		},
		"allowMentions":             func(v any) bool { _, ok := v.(bool); return ok },
		"allowCollaborationInvites": func(v any) bool { _, ok := v.(bool); return ok },
		"collaborationInvitePermission": func(v any) bool {
			str, ok := v.(string)
			return ok && (str == "EVERYONE" || str == "MUTUALS" || str == "FOLLOWING" || str == "MEDIA_ONLY" || str == "NOBODY")
		},
		"showSensitiveContent": func(v any) bool { _, ok := v.(bool); return ok },
		"likeVisibility": func(v any) bool {
			str, ok := v.(string)
			return ok && (str == "PUBLIC" || str == "PRIVATE")
		},
		"autoplayMedia": func(v any) bool { _, ok := v.(bool); return ok },
		"reduceMotion":  func(v any) bool { _, ok := v.(bool); return ok },
		"highContrast":  func(v any) bool { _, ok := v.(bool); return ok },
		"fontScale": func(v any) bool {
			var n float64
			switch t := v.(type) {
			case float64:
				n = t
			case float32:
				n = float64(t)
			case int:
				n = float64(t)
			case int32:
				n = float64(t)
			default:
				return false
			}
			return n == 90 || n == 100 || n == 110 || n == 125
		},
		"defaultFeed": func(v any) bool {
			str, ok := v.(string)
			return ok && (str == "FOLLOWING" || str == "DISCOVER")
		},
	}
	cols := []string{"profileVisibility", "allowMentions", "allowCollaborationInvites", "collaborationInvitePermission",
		"showSensitiveContent", "likeVisibility", "autoplayMedia", "reduceMotion", "highContrast",
		"fontScale", "defaultFeed"}
	for key := range patch {
		if _, ok := allowed[key]; !ok {
			return UserSettings{}, fmt.Errorf("clé de réglage inconnue: %s", key)
		}
	}
	set := make([]string, 0, len(cols))
	args := make([]any, 0, len(cols)+1)
	for _, c := range cols {
		v, ok := patch[c]
		if !ok {
			continue
		}
		validator := allowed[c]
		if !validator(v) {
			return UserSettings{}, fmt.Errorf("valeur invalide pour %s", c)
		}
		args = append(args, v)
		set = append(set, fmt.Sprintf(`"%s" = $%d`, c, len(args)))
	}
	args = append(args, toUUID(userID))
	if len(set) == 0 {
		return s.GetUserSettings(ctx, userID)
	}
	query := `UPDATE "UserSettings" SET ` + strings.Join(set, ", ") + `, "updatedAt" = now() WHERE "userId" = $` + fmt.Sprint(len(args))

	// Tout dans une transaction : la ligne est créée si besoin, verrouillée
	// (FOR UPDATE : deux patches concurrents ne peuvent plus s'écraser sans
	// que l'ancienne visibilité lue soit la vraie), puis l'événement de
	// visibilité est distribué dans la MÊME transaction. Avant, la lecture de
	// l'ancienne valeur et l'écriture étaient séparées et un échec de
	// distribution laissait un compte PUBLIC sans acceptation des demandes.
	err := s.withTx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			INSERT INTO "UserSettings" (id, "userId", "collaborationInvitePermission", "likeVisibility", "createdAt", "updatedAt")
			VALUES (gen_random_uuid()::text, $1, 'EVERYONE', 'PUBLIC', now(), now())
			ON CONFLICT ("userId") DO NOTHING`, toUUID(userID)); err != nil {
			return err
		}
		var oldVisibility string
		if err := tx.QueryRow(ctx,
			`SELECT "profileVisibility" FROM "UserSettings" WHERE "userId" = $1 FOR UPDATE`,
			toUUID(userID)).Scan(&oldVisibility); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, query, args...); err != nil {
			return err
		}
		newVis, ok := patch["profileVisibility"].(string)
		if !ok || newVis == oldVisibility {
			return nil
		}
		return domainevents.Dispatch(ctx, tx, domainevents.ProfileVisibilityChangedEvent{
			UserID:        userID,
			OldVisibility: oldVisibility,
			NewVisibility: newVis,
		})
	})
	if err != nil {
		return UserSettings{}, err
	}

	return s.GetUserSettings(ctx, userID)
}

// DeletionRequest est la demande de suppression de compte (lecteur).
type DeletionRequest struct {
	ID          string `json:"id"`
	Status      string `json:"status"`
	RequestedAt string `json:"requestedAt"`
}

// GetDeletionRequest retourne la dernière demande du lecteur (nil si aucune).
func (s *Service) GetDeletionRequest(ctx context.Context, userID string) (*DeletionRequest, error) {
	var d DeletionRequest
	var requestedAt pgtype.Timestamp
	err := s.pool.QueryRow(ctx, `
		SELECT id, status, "requestedAt"
		FROM "AccountDeletionRequest" WHERE "userId" = $1
		ORDER BY "requestedAt" DESC LIMIT 1`, toUUID(userID)).
		Scan(&d.ID, &d.Status, &requestedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	d.RequestedAt = requestedAt.Time.Format(time.RFC3339)
	return &d, nil
}

// CreateDeletionRequest crée une demande si aucune PENDING/PROCESSING
// n'existe déjà (idempotent, miroir de requestAccountDeletionAction).
func (s *Service) CreateDeletionRequest(ctx context.Context, userID, reason string) (*DeletionRequest, error) {
	var id string
	var status string
	var requestedAt pgtype.Timestamp
	err := s.pool.QueryRow(ctx, `
		INSERT INTO "AccountDeletionRequest" (id, "userId", status, reason)
		SELECT gen_random_uuid()::text, $1, 'PENDING', $2
		WHERE NOT EXISTS (
			SELECT 1 FROM "AccountDeletionRequest"
			WHERE "userId" = $1 AND status IN ('PENDING', 'PROCESSING')
		)
		RETURNING id, status, "requestedAt"`, toUUID(userID), reason).
		Scan(&id, &status, &requestedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return s.GetDeletionRequest(ctx, userID)
	}
	if err != nil {
		// Deux demandes simultanées : l'index partiel (une seule demande
		// active par compte) rejette la seconde — on renvoie celle qui a gagné
		// au lieu d'une 500.
		if isUniqueViolation(err) {
			return s.GetDeletionRequest(ctx, userID)
		}
		return nil, err
	}
	return &DeletionRequest{ID: id, Status: status, RequestedAt: requestedAt.Time.Format(time.RFC3339)}, nil
}

// CancelDeletionRequest annule les demandes PENDING du lecteur.
func (s *Service) CancelDeletionRequest(ctx context.Context, userID string) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE "AccountDeletionRequest"
		SET status = 'CANCELED', "processedAt" = now()
		WHERE "userId" = $1 AND status = 'PENDING'`, toUUID(userID))
	return err
}
