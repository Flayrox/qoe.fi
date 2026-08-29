// Package settings — profil créateur, onboarding, sous-domaine, liens, clés API.
// Migration du module dashboard (packages/api-client actions/dashboard).
package settings

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/permissions"
	"github.com/qoefi/api/internal/slug"
)

var (
	errForbidden = errors.New("accès refusé")
	errNotFound  = errors.New("introuvable")
)

// Service porte les opérations de settings du créateur.
type Service struct {
	pool pooler
	q    ServiceQuerier
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool, q: db.New(pool)}
}

// authorizeSettings vérifie que l'utilisateur peut administrer la publication :
// publication personnelle, ou Média avec la permission manage_settings.
func (s *Service) authorizeSettings(ctx context.Context, userID, publicationID string) error {
	if personal, err := s.q.GetUserPersonalPublication(ctx, userID); err == nil && personal.String == publicationID {
		return nil
	}
	member, err := s.q.GetMediaMemberContext(ctx, db.GetMediaMemberContextParams{
		PublicationId: publicationID, UserId: toUUID(userID),
	})
	if err != nil {
		return errForbidden
	}
	if !permissions.CanMedia(&permissions.MediaMember{
		Role: member.Role, Permissions: member.Permissions, Status: member.Status,
	}, permissions.PermManageSettings) {
		return errForbidden
	}
	return nil
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
	ID   string `json:"id"`
	Name string `json:"name"`
	Slug string `json:"slug"`
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
type SettingsPublication struct {
	ID             string              `json:"id"`
	Name           string              `json:"name"`
	Slug           string              `json:"slug"`
	Subdomain      *string             `json:"subdomain"`
	CustomDomain   *string             `json:"customDomain"`
	HeroText       *string             `json:"heroText"`
	AccentColor    *string             `json:"accentColor"`
	FontFamily     *string             `json:"fontFamily"`
	ThemeMode      *string             `json:"themeMode"`
	LayoutStyle    *string             `json:"layoutStyle"`
	LogoURL        *string             `json:"logoUrl"`
	HeaderImageURL *string             `json:"headerImageUrl"`
	FooterText     *string             `json:"footerText"`
	SeoTitle       *string             `json:"seoTitle"`
	SeoDescription *string             `json:"seoDescription"`
	AllowIndexing  bool                `json:"allowIndexing"`
	SupportURL     *string             `json:"supportUrl"`
	Type           string              `json:"type"`
	UmamiWebsiteID *string             `json:"umamiWebsiteId"`
	Navigation     []SettingsNavItem   `json:"navigation"`
	SocialLinks    []SettingsSocialLink `json:"socialLinks"`
	Articles       []SettingsArticle   `json:"articles"`
	Categories     []SettingsCategory  `json:"categories"`
	User           *SettingsOwner      `json:"user"`
}

// GetPublicationSettings retourne la publication + relations de la page
// settings créateur. Accès : publication personnelle OU média avec
// manage_settings (même check que les écritures).
func (s *Service) GetPublicationSettings(ctx context.Context, userID, publicationID string) (*SettingsPublication, error) {
	if err := s.authorizeSettings(ctx, userID, publicationID); err != nil {
		return nil, errForbidden
	}

	row, err := s.q.GetPublicationForSettings(ctx, publicationID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errNotFound
		}
		return nil, err
	}

	pub := &SettingsPublication{
		ID: row.ID, Name: row.Name, Slug: row.Slug,
		Subdomain: textPtr(row.Subdomain), CustomDomain: textPtr(row.CustomDomain),
		HeroText: textPtr(row.HeroText), AccentColor: textPtr(row.AccentColor),
		FontFamily: textPtr(row.FontFamily), ThemeMode: textPtr(row.ThemeMode),
		LayoutStyle: textPtr(row.LayoutStyle), LogoURL: textPtr(row.LogoUrl),
		HeaderImageURL: textPtr(row.HeaderImageUrl), FooterText: textPtr(row.FooterText),
		SeoTitle: textPtr(row.SeoTitle), SeoDescription: textPtr(row.SeoDescription),
		AllowIndexing: row.AllowIndexing, SupportURL: textPtr(row.SupportUrl),
		Type: string(row.Type), UmamiWebsiteID: textPtr(row.UmamiWebsiteId),
		Navigation:  []SettingsNavItem{},
		SocialLinks: []SettingsSocialLink{},
		Articles:    []SettingsArticle{},
		Categories:  []SettingsCategory{},
	}
	if row.OwnerID != "" {
		pub.User = &SettingsOwner{
			ID: row.OwnerID, Email: textPtr(row.OwnerEmail),
			Username: textPtr(row.OwnerUsername),
			AdvancedSettingsMode: row.OwnerAdvancedSettingsMode.Bool,
		}
	}

	navRows, err := s.q.ListNavigationForPublication(ctx, publicationID)
	if err != nil {
		return nil, err
	}
	for _, n := range navRows {
		pub.Navigation = append(pub.Navigation, SettingsNavItem{
			ID: n.ID, Label: n.Label, URL: textPtr(n.Url),
			Order: n.Order, IsExternal: n.IsExternal,
		})
	}

	socialRows, err := s.q.ListSocialLinksForPublication(ctx, publicationID)
	if err != nil {
		return nil, err
	}
	for _, sl := range socialRows {
		pub.SocialLinks = append(pub.SocialLinks, SettingsSocialLink{
			ID: sl.ID, Platform: sl.Platform, URL: sl.Url, Order: sl.Order,
		})
	}

	articleRows, err := s.q.ListArticlesForSettings(ctx, publicationID)
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

	catRows, err := s.q.ListCategoriesForPublication(ctx, publicationID)
	if err != nil {
		return nil, err
	}
	for _, c := range catRows {
		pub.Categories = append(pub.Categories, SettingsCategory{
			ID: c.ID, Name: c.Name, Slug: c.Slug,
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
func (s *Service) UpdateProfile(ctx context.Context, userID, publicationID string, body map[string]any) (db.GetUserForSettingsRow, error) {
	if err := s.authorizeSettings(ctx, userID, publicationID); err != nil {
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
				fields[col] = v
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

	if len(fields) > 0 {
		if err := s.updatePublication(ctx, publicationID, fields); err != nil {
			return db.GetUserForSettingsRow{}, err
		}
	}

	if v, ok := body["onboardingText"]; ok {
		t, err := textFromAny(v)
		if err != nil {
			return db.GetUserForSettingsRow{}, err
		}
		if err := s.q.UpdateUserOnboardingText(ctx, db.UpdateUserOnboardingTextParams{
			ID: userID, OnboardingText: t,
		}); err != nil {
			return db.GetUserForSettingsRow{}, err
		}
	}

	row, err := s.q.GetUserForSettings(ctx, userID)
	if err != nil {
		return db.GetUserForSettingsRow{}, errNotFound
	}
	return row, nil
}

// updatePublication construit un UPDATE dynamique limité à un allowlist de colonnes.
func (s *Service) updatePublication(ctx context.Context, publicationID string, fields map[string]any) error {
	keys := make([]string, 0, len(fields))
	for k := range fields {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	sets := make([]string, 0, len(keys))
	args := make([]any, 0, len(keys)+1)
	args = append(args, publicationID)
	for _, k := range keys {
		sets = append(sets, fmt.Sprintf("%q = $%d", k, len(args)+1))
		args = append(args, fields[k])
	}
	query := fmt.Sprintf(
		`UPDATE "Publication" SET %s, "updatedAt" = now() WHERE id = $1`,
		strings.Join(sets, ", "),
	)
	_, err := s.pool.Exec(ctx, query, args...)
	return err
}

var reservedSubdomains = map[string]bool{
	"admin": true, "api": true, "app": true, "auth": true, "billing": true,
	"blog": true, "dashboard": true, "dev": true, "developer": true, "docs": true,
	"feed": true, "help": true, "login": true, "main": true, "media": true,
	"onboarding": true, "portal": true, "qoe": true, "root": true, "settings": true,
	"start": true, "static": true, "status": true, "store": true, "studio": true,
	"support": true, "www": true,
}

var subdomainRegex = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

// CheckSubdomain valide un sous-domaine et vérifie sa disponibilité.
func (s *Service) CheckSubdomain(ctx context.Context, subdomain string) (available bool, reason string) {
	clean := strings.ToLower(strings.TrimSpace(subdomain))
	if !subdomainRegex.MatchString(clean) {
		return false, "Le sous-domaine ne doit contenir que des lettres minuscules, chiffres et tirets."
	}
	if len(clean) < 3 || len(clean) > 30 {
		return false, "La longueur doit être comprise entre 3 et 30 caractères."
	}
	if reservedSubdomains[clean] {
		return false, "Ce nom de sous-domaine est réservé par la plateforme."
	}
	exists, err := s.q.CheckSubdomainExists(ctx, pgtype.Text{String: clean, Valid: true})
	if err != nil {
		return false, "Vérification impossible, réessayez."
	}
	if exists {
		return false, "Ce sous-domaine est déjà attribué à une autre publication."
	}
	return true, ""
}

// UpdateSubdomain change le sous-domaine de la publication active.
func (s *Service) UpdateSubdomain(ctx context.Context, userID, publicationID, subdomain string) error {
	if err := s.authorizeSettings(ctx, userID, publicationID); err != nil {
		return err
	}
	available, reason := s.CheckSubdomain(ctx, subdomain)
	if !available {
		return errors.New(reason)
	}
	return s.q.UpdatePublicationSubdomain(ctx, db.UpdatePublicationSubdomainParams{
		ID:        publicationID,
		Subdomain: pgtype.Text{String: strings.ToLower(strings.TrimSpace(subdomain)), Valid: true},
	})
}

// NavigationLink est un lien de navigation du studio.
type NavigationLink struct {
	Label string `json:"label"`
	URL   string `json:"url"`
}

// SaveNavigation remplace la liste des liens de navigation.
func (s *Service) SaveNavigation(ctx context.Context, userID, publicationID string, links []NavigationLink) error {
	if err := s.authorizeSettings(ctx, userID, publicationID); err != nil {
		return err
	}
	if err := s.q.DeleteNavigationItems(ctx, publicationID); err != nil {
		return err
	}
	for i, link := range links {
		if err := s.q.InsertNavigationItem(ctx, db.InsertNavigationItemParams{
			Label:         link.Label,
			Url:           textFromString(link.URL),
			Order:         int32(i),
			IsExternal:    strings.HasPrefix(link.URL, "http"),
			PublicationId: publicationID,
		}); err != nil {
			return err
		}
	}
	return nil
}

// SocialLink est un lien social du studio.
type SocialLink struct {
	Platform string `json:"platform"`
	URL      string `json:"url"`
}

// SaveSocial remplace la liste des liens sociaux.
func (s *Service) SaveSocial(ctx context.Context, userID, publicationID string, links []SocialLink) error {
	if err := s.authorizeSettings(ctx, userID, publicationID); err != nil {
		return err
	}
	if err := s.q.DeleteSocialLinks(ctx, publicationID); err != nil {
		return err
	}
	for i, link := range links {
		if err := s.q.InsertSocialLink(ctx, db.InsertSocialLinkParams{
			Platform:      link.Platform,
			Url:           link.URL,
			Order:         int32(i),
			PublicationId: publicationID,
		}); err != nil {
			return err
		}
	}
	return nil
}

// SubmitApiApplication enregistre une demande d'accès API (pending).
func (s *Service) SubmitApiApplication(ctx context.Context, userID, reason string) error {
	return s.q.SetApiApplication(ctx, db.SetApiApplicationParams{
		ID: userID, ApiApplicationReason: textFromString(reason),
	})
}

// scopesValides est l'allowlist des scopes de clé API (moindre privilège).
var scopesValides = map[string]bool{"READ": true, "WRITE": true, "ANALYTICS": true}

// GenerateApiKey crée une clé API qoe_live_ et retourne le token en clair.
// scopes : vide = accès complet (rétro-compatibilité), sinon filtrage strict.
func (s *Service) GenerateApiKey(ctx context.Context, userID, name string, scopes []string) (string, error) {
	status, err := s.q.GetUserApiAccessStatus(ctx, userID)
	if err != nil {
		return "", errNotFound
	}
	if status != "approved" {
		return "", errors.New("Votre demande d'accès à l'API doit être approuvée par un administrateur.")
	}

	finalScopes := make([]string, 0, len(scopes))
	seen := map[string]bool{}
	for _, s := range scopes {
		if !scopesValides[s] || seen[s] {
			continue
		}
		seen[s] = true
		finalScopes = append(finalScopes, s)
	}
	if len(scopes) > 0 && len(finalScopes) == 0 {
		return "", errors.New("Sélectionnez au moins un scope pour la clé API.")
	}
	// scopes vide = accès complet explicite (rétro-compatibilité).
	if len(finalScopes) == 0 {
		finalScopes = middleware.AllScopes
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
	return apiKey, nil
}

// RevokeApiKey révoque une clé API de l'utilisateur.
func (s *Service) RevokeApiKey(ctx context.Context, userID, id string) error {
	return s.q.DeleteApiKey(ctx, db.DeleteApiKeyParams{ID: id, UserId: toUUID(userID)})
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

// CompleteOnboarding finalise l'onboarding : rôle, publication personnelle + slug.
func (s *Service) CompleteOnboarding(ctx context.Context, userID string, in OnboardingInput) error {
	user, err := s.q.GetUserForSettings(ctx, userID)
	if err != nil {
		return errNotFound
	}

	role := "creator"
	if user.Role == "superadmin" {
		role = "superadmin"
	}
	name := in.Name
	if name == "" {
		if user.Name.Valid {
			name = user.Name.String
		} else if user.Username.Valid {
			name = user.Username.String
		} else {
			name = strings.Split(user.Email, "@")[0]
		}
	}

	if err := s.q.CompleteOnboardingUser(ctx, db.CompleteOnboardingUserParams{
		ID: userID, Role: role, Name: textFromString(name),
	}); err != nil {
		return err
	}

	pubSlug := name
	if user.Username.Valid && user.Username.String != "" {
		pubSlug = user.Username.String
	}
	pubSlug = slug.Slugify(pubSlug)
	if pubSlug == "" {
		pubSlug = "creator"
	}

	subdomain := textFromString(in.Subdomain)
	heroText := textFromString(in.HeroText)
	layoutStyle := textFromString(in.LayoutStyle)

	// Publication personnelle existante → synchronisation, sinon création.
	if user.PublicationId.Valid && user.PublicationId.String != "" {
		return s.q.UpdatePersonalPublication(ctx, db.UpdatePersonalPublicationParams{
			ID: user.PublicationId.String, Name: name, Subdomain: subdomain,
			HeroText: heroText, LayoutStyle: layoutStyle,
		})
	}

	id, err := s.q.CreatePersonalPublication(ctx, db.CreatePersonalPublicationParams{
		Name: name, Slug: pubSlug, Subdomain: subdomain, HeroText: heroText,
		LayoutStyle: layoutStyle, LogoUrl: user.LogoUrl, IsCertified: user.IsCertified,
	})
	if err != nil {
		return err
	}
	return s.q.LinkUserPublication(ctx, db.LinkUserPublicationParams{
		ID: userID, PublicationId: textFromString(id),
	})
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
	ID                        string `json:"id"`
	UserID                    string `json:"userId"`
	ProfileVisibility         string `json:"profileVisibility"`
	AllowMentions             bool   `json:"allowMentions"`
	AllowCollaborationInvites bool   `json:"allowCollaborationInvites"`
	ShowSensitiveContent      bool   `json:"showSensitiveContent"`
	AutoplayMedia             bool   `json:"autoplayMedia"`
	ReduceMotion              bool   `json:"reduceMotion"`
	HighContrast              bool   `json:"highContrast"`
	FontScale                 int32  `json:"fontScale"`
	DefaultFeed               string `json:"defaultFeed"`
	CreatedAt                 string `json:"createdAt"`
	UpdatedAt                 string `json:"updatedAt"`
}

const (
	defaultUserSettingsProfileVisibility = "PUBLIC"
	defaultUserSettingsFontScale         = 100
	defaultUserSettingsDefaultFeed       = "FOLLOWING"
)

func scanUserSettings(row pgx.Row) (UserSettings, error) {
	var s UserSettings
	var createdAt, updatedAt pgtype.Timestamp
	err := row.Scan(&s.ID, &s.UserID, &s.ProfileVisibility, &s.AllowMentions,
		&s.AllowCollaborationInvites, &s.ShowSensitiveContent, &s.AutoplayMedia,
		&s.ReduceMotion, &s.HighContrast, &s.FontScale, &s.DefaultFeed,
		&createdAt, &updatedAt)
	if err != nil {
		return s, err
	}
	s.CreatedAt = createdAt.Time.Format(time.RFC3339)
	s.UpdatedAt = updatedAt.Time.Format(time.RFC3339)
	return s, nil
}

// GetUserSettings lit les préférences du lecteur, en créant la ligne par
// défaut si absente (équivalent de l'upsert Prisma de getAccountSettingsAction).
func (s *Service) GetUserSettings(ctx context.Context, userID string) (UserSettings, error) {
	row := s.pool.QueryRow(ctx, `
		SELECT id, "userId", "profileVisibility", "allowMentions", "allowCollaborationInvites",
		       "showSensitiveContent", "autoplayMedia", "reduceMotion", "highContrast",
		       "fontScale", "defaultFeed", "createdAt", "updatedAt"
		FROM "UserSettings" WHERE "userId" = $1`, toUUID(userID))
	settings, err := scanUserSettings(row)
	if err == nil {
		return settings, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return UserSettings{}, err
	}
	if _, err := s.pool.Exec(ctx, `
		INSERT INTO "UserSettings" (id, "userId", "createdAt", "updatedAt")
		VALUES (gen_random_uuid()::text, $1, now(), now())`, toUUID(userID)); err != nil {
		return UserSettings{}, err
	}
	return s.GetUserSettings(ctx, userID)
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
		"showSensitiveContent":      func(v any) bool { _, ok := v.(bool); return ok },
		"autoplayMedia":             func(v any) bool { _, ok := v.(bool); return ok },
		"reduceMotion":              func(v any) bool { _, ok := v.(bool); return ok },
		"highContrast":              func(v any) bool { _, ok := v.(bool); return ok },
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
	cols := []string{"profileVisibility", "allowMentions", "allowCollaborationInvites",
		"showSensitiveContent", "autoplayMedia", "reduceMotion", "highContrast",
		"fontScale", "defaultFeed"}
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
	// Ligne par défaut si absente (upsert).
	_, _ = s.GetUserSettings(ctx, userID)
	query := `UPDATE "UserSettings" SET ` + strings.Join(set, ", ") + `, "updatedAt" = now() WHERE "userId" = $` + fmt.Sprint(len(args))
	if _, err := s.pool.Exec(ctx, query, args...); err != nil {
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
