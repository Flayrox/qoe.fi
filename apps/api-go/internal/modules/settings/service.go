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

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api-go/internal/database"
	"github.com/qoefi/api-go/internal/permissions"
)

var (
	errForbidden = errors.New("accès refusé")
	errNotFound  = errors.New("introuvable")
)

// Service porte les opérations de settings du créateur.
type Service struct {
	pool *pgxpool.Pool
	q    *db.Queries
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

// GenerateApiKey crée une clé API qoe_live_ et retourne le token en clair.
func (s *Service) GenerateApiKey(ctx context.Context, userID, name string) (string, error) {
	status, err := s.q.GetUserApiAccessStatus(ctx, userID)
	if err != nil {
		return "", errNotFound
	}
	if status != "approved" {
		return "", errors.New("Votre demande d'accès à l'API doit être approuvée par un administrateur.")
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
		Name: name, KeyPrefix: "qoe_live", KeyHash: keyHash, UserId: toUUID(userID),
	}); err != nil {
		return "", err
	}
	return apiKey, nil
}

// RevokeApiKey révoque une clé API de l'utilisateur.
func (s *Service) RevokeApiKey(ctx context.Context, userID, id string) error {
	return s.q.DeleteApiKey(ctx, db.DeleteApiKeyParams{ID: id, UserId: toUUID(userID)})
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

	slug := name
	if user.Username.Valid && user.Username.String != "" {
		slug = user.Username.String
	}
	slug = slugify(slug)
	if slug == "" {
		slug = "creator"
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
		Name: name, Slug: slug, Subdomain: subdomain, HeroText: heroText,
		LayoutStyle: layoutStyle, LogoUrl: user.LogoUrl, IsCertified: user.IsCertified,
	})
	if err != nil {
		return err
	}
	return s.q.LinkUserPublication(ctx, db.LinkUserPublicationParams{
		ID: userID, PublicationId: textFromString(id),
	})
}

// slugify reproduit @qoe/utils slugify pour les slugs de publication.
func slugify(input string) string {
	lower := strings.ToLower(strings.TrimSpace(input))
	var b strings.Builder
	lastDash := false
	for _, r := range lower {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			lastDash = false
		default:
			if !lastDash && b.Len() > 0 {
				b.WriteByte('-')
				lastDash = true
			}
		}
	}
	return strings.Trim(b.String(), "-")
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
