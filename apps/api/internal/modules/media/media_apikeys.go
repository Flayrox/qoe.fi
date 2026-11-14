package media

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/qoefi/api/internal/apiaccess"
	"github.com/qoefi/api/internal/auditlog"
	db "github.com/qoefi/api/internal/database"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/permissions"
)

// MediaApiKeyItem représente les métadonnées publiques d'une clé API média.
type MediaApiKeyItem struct {
	ID                string   `json:"id"`
	Name              string   `json:"name"`
	KeyPrefix         string   `json:"keyPrefix"`
	Scopes            []string `json:"scopes"`
	CreatedAt         string   `json:"createdAt"`
	LastUsedAt        *string  `json:"lastUsedAt,omitempty"`
	CreatedByUserID   *string  `json:"createdByUserId,omitempty"`
	CreatedByName     *string  `json:"createdByName,omitempty"`
	CreatedByUsername *string  `json:"createdByUsername,omitempty"`
}

// MediaApiKeyCreated est retourné lors de la création d'une clé.
type MediaApiKeyCreated struct {
	MediaApiKeyItem
	Secret string `json:"secret"`
}

// MediaApiKeyRotated est retourné lors de la rotation d'une clé.
type MediaApiKeyRotated struct {
	MediaApiKeyItem
	Secret string `json:"secret"`
}

// ListApiKeys liste les clés API d'un média (exige api_keys:manage).
func (s *Service) ListApiKeys(ctx context.Context, userID, mediaID string) ([]MediaApiKeyItem, error) {
	if _, err := s.authorizeMedia(ctx, mediaID, userID, permissions.PermManageApiKeys); err != nil {
		return nil, err
	}
	rows, err := s.q.ListMediaApiKeys(ctx, mediaID)
	if err != nil {
		return nil, err
	}
	items := make([]MediaApiKeyItem, 0, len(rows))
	for _, r := range rows {
		item := MediaApiKeyItem{
			ID:        r.ID,
			Name:      r.Name,
			KeyPrefix: r.KeyPrefix,
			Scopes:    r.Scopes,
			CreatedAt: r.CreatedAt.Time.Format(time.RFC3339),
		}
		if r.LastUsedAt.Valid {
			v := r.LastUsedAt.Time.Format(time.RFC3339)
			item.LastUsedAt = &v
		}
		if r.CreatedByUserID != "" {
			uid := r.CreatedByUserID
			item.CreatedByUserID = &uid
		}
		if r.CreatedByName.Valid && r.CreatedByName.String != "" {
			name := r.CreatedByName.String
			item.CreatedByName = &name
		}
		if r.CreatedByUsername.Valid && r.CreatedByUsername.String != "" {
			uname := r.CreatedByUsername.String
			item.CreatedByUsername = &uname
		}
		items = append(items, item)
	}
	return items, nil
}

func (s *Service) allowedMediaScopes(ctx context.Context, member *db.GetMediaMemberByIDRow) ([]string, error) {
	enabledModules, err := apiaccess.LoadEnabled(ctx, s.pool)
	if err != nil {
		return nil, err
	}
	platformScopes := apiaccess.ScopesForGrants(enabledModules)

	memPerms := &permissions.MediaMember{
		Role:        member.Role,
		Permissions: member.Permissions,
		Status:      member.Status,
	}

	canRead := true
	canWrite := permissions.CanMedia(memPerms, permissions.PermCreateArticles) ||
		permissions.CanMedia(memPerms, permissions.PermEditAny) ||
		permissions.CanMedia(memPerms, permissions.PermPublishAny) ||
		member.Role == "owner"
	canAnalytics := permissions.CanMedia(memPerms, permissions.PermViewAnalytics) || member.Role == "owner"

	var allowed []string
	for _, sc := range platformScopes {
		switch sc {
		case middleware.ScopeRead:
			if canRead {
				allowed = append(allowed, sc)
			}
		case middleware.ScopeWrite:
			if canWrite {
				allowed = append(allowed, sc)
			}
		case middleware.ScopeAnalytics:
			if canAnalytics {
				allowed = append(allowed, sc)
			}
		}
	}
	return allowed, nil
}

// CreateApiKey génère une nouvelle clé API pour le média.
func (s *Service) CreateApiKey(ctx context.Context, userID, mediaID, name string, requestedScopes []string) (*MediaApiKeyCreated, error) {
	member, err := s.authorizeMedia(ctx, mediaID, userID, permissions.PermManageApiKeys)
	if err != nil {
		return nil, err
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, errors.New("Le nom de la clé est requis")
	}
	if len(name) > 100 {
		return nil, errors.New("Le nom de la clé est trop long (100 caractères maximum)")
	}

	count, err := s.q.CountMediaApiKeys(ctx, mediaID)
	if err != nil {
		return nil, err
	}
	if count >= MaxActiveMediaApiKeys {
		return nil, errors.New("Limite de clés API actives atteinte pour ce média")
	}

	mediaWithPub, err := s.q.GetMediaWithPublisher(ctx, mediaID)
	if err != nil {
		return nil, errNotFound
	}

	allowed, err := s.allowedMediaScopes(ctx, member)
	if err != nil {
		return nil, err
	}

	var finalScopes []string
	if len(requestedScopes) == 0 {
		finalScopes = allowed
	} else {
		seen := map[string]bool{}
		for _, sc := range requestedScopes {
			if !middleware.HasScope(allowed, sc) {
				return nil, ErrInvalidScopes
			}
			if !seen[sc] {
				seen[sc] = true
				finalScopes = append(finalScopes, sc)
			}
		}
	}
	if len(finalScopes) == 0 {
		return nil, ErrInvalidScopes
	}

	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return nil, err
	}
	secret := "qoe_live_" + hex.EncodeToString(tokenBytes)
	hashed := sha256.Sum256([]byte(secret))
	keyHash := hex.EncodeToString(hashed[:])
	keyPrefix := secret[:16]
	keyID := "ak_" + hex.EncodeToString(tokenBytes[:8])

	if err := s.q.InsertMediaApiKey(ctx, db.InsertMediaApiKeyParams{
		ID:              keyID,
		Name:            name,
		KeyPrefix:       keyPrefix,
		KeyHash:         keyHash,
		Scopes:          finalScopes,
		PublisherId:   textFromString(mediaWithPub.PublisherID),
		CreatedByUserId: toUUID(userID),
	}); err != nil {
		return nil, err
	}

	s.audit(ctx, mediaID, userID, "api_key.created", map[string]any{
		"apiKeyId": keyID, "name": name, "scopes": finalScopes,
	})
	auditlog.Write(ctx, s.q, s.flags, userID, "media.api_key.created", "api_key", keyID,
		map[string]any{"mediaId": mediaID, "name": name, "scopes": finalScopes})

	nowStr := time.Now().UTC().Format(time.RFC3339)
	return &MediaApiKeyCreated{
		MediaApiKeyItem: MediaApiKeyItem{
			ID:              keyID,
			Name:            name,
			KeyPrefix:       keyPrefix,
			Scopes:          finalScopes,
			CreatedAt:       nowStr,
			CreatedByUserID: &userID,
		},
		Secret: secret,
	}, nil
}

// UpdateApiKeyName renomme une clé API du média.
func (s *Service) UpdateApiKeyName(ctx context.Context, userID, mediaID, keyID, name string) error {
	if _, err := s.authorizeMedia(ctx, mediaID, userID, permissions.PermManageApiKeys); err != nil {
		return err
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return errors.New("Le nom de la clé est requis")
	}
	if len(name) > 100 {
		return errors.New("Le nom de la clé est trop long (100 caractères maximum)")
	}
	rows, err := s.q.UpdateMediaApiKeyName(ctx, db.UpdateMediaApiKeyNameParams{
		KeyID:   keyID,
		MediaID: mediaID,
		Name:    name,
	})
	if err != nil {
		return err
	}
	if rows == 0 {
		return errNotFound
	}
	s.audit(ctx, mediaID, userID, "api_key.updated", map[string]any{
		"apiKeyId": keyID, "name": name,
	})
	auditlog.Write(ctx, s.q, s.flags, userID, "media.api_key.updated", "api_key", keyID,
		map[string]any{"mediaId": mediaID, "name": name})
	return nil
}

// RotateApiKey génère un nouveau secret pour une clé existante et invalide l'ancien.
func (s *Service) RotateApiKey(ctx context.Context, userID, mediaID, keyID string) (*MediaApiKeyRotated, error) {
	if _, err := s.authorizeMedia(ctx, mediaID, userID, permissions.PermManageApiKeys); err != nil {
		return nil, err
	}
	existing, err := s.q.GetMediaApiKeyByID(ctx, db.GetMediaApiKeyByIDParams{
		KeyID:   keyID,
		MediaID: mediaID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errNotFound
		}
		return nil, err
	}

	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return nil, err
	}
	secret := "qoe_live_" + hex.EncodeToString(tokenBytes)
	hashed := sha256.Sum256([]byte(secret))
	keyHash := hex.EncodeToString(hashed[:])
	keyPrefix := secret[:16]

	rows, err := s.q.UpdateMediaApiKeySecret(ctx, db.UpdateMediaApiKeySecretParams{
		KeyID:     keyID,
		MediaID:   mediaID,
		KeyHash:   keyHash,
		KeyPrefix: keyPrefix,
	})
	if err != nil {
		return nil, err
	}
	if rows == 0 {
		return nil, errNotFound
	}

	s.audit(ctx, mediaID, userID, "api_key.rotated", map[string]any{
		"apiKeyId": keyID,
	})
	auditlog.Write(ctx, s.q, s.flags, userID, "media.api_key.rotated", "api_key", keyID,
		map[string]any{"mediaId": mediaID})

	res := &MediaApiKeyRotated{
		MediaApiKeyItem: MediaApiKeyItem{
			ID:        existing.ID,
			Name:      existing.Name,
			KeyPrefix: keyPrefix,
			Scopes:    existing.Scopes,
			CreatedAt: existing.CreatedAt.Time.Format(time.RFC3339),
		},
		Secret: secret,
	}
	if existing.LastUsedAt.Valid {
		v := existing.LastUsedAt.Time.Format(time.RFC3339)
		res.LastUsedAt = &v
	}
	if existing.CreatedByUserID != "" {
		uid := existing.CreatedByUserID
		res.CreatedByUserID = &uid
	}
	return res, nil
}

// RevokeApiKey supprime/révoque une clé API du média.
func (s *Service) RevokeApiKey(ctx context.Context, userID, mediaID, keyID string) error {
	if _, err := s.authorizeMedia(ctx, mediaID, userID, permissions.PermManageApiKeys); err != nil {
		return err
	}
	rows, err := s.q.DeleteMediaApiKey(ctx, db.DeleteMediaApiKeyParams{
		KeyID:   keyID,
		MediaID: mediaID,
	})
	if err != nil {
		return err
	}
	if rows == 0 {
		return errNotFound
	}
	s.audit(ctx, mediaID, userID, "api_key.revoked", map[string]any{
		"apiKeyId": keyID,
	})
	auditlog.Write(ctx, s.q, s.flags, userID, "media.api_key.revoked", "api_key", keyID,
		map[string]any{"mediaId": mediaID})
	return nil
}
