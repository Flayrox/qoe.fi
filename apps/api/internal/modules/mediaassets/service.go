// Package mediaassets — registre des MediaAsset (médiathèque / upload).
// Migration de packages/db/src/repositories/media.ts → registerMediaAsset :
// dédoublonnage CAS par SHA-256, réactivation des assets purgés, création
// DRAFT_ORPHAN avec TTL 3 jours. Les autres fonctions du repository (reconcile,
// purge worker…) restent hors périmètre tant qu'aucun appelant ne les consomme.
package mediaassets

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api/internal/database"
)

var errNotFound = errors.New("introuvable")

// validTargetTypes est l'allowlist des targetType MediaAsset (parité enum Prisma).
var validTargetTypes = map[string]bool{
	"ARTICLE_COVER": true, "ARTICLE_BODY": true, "THOUGHT_ATTACHMENT": true,
	"USER_AVATAR": true, "USER_BANNER": true, "PUBLICATION_LOGO": true,
	"PUBLICATION_BANNER": true, "SHARED": true,
}

type Service struct {
	pool *pgxpool.Pool
	q    *db.Queries
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool, q: db.New(pool)}
}

// RegisterInput est la charge utile d'enregistrement d'un asset uploadé.
type RegisterInput struct {
	Sha256       string          `json:"sha256"`
	Url          string          `json:"url"`
	StoragePath  string          `json:"storagePath"`
	Bucket       string          `json:"bucket"`
	MimeType     string          `json:"mimeType"`
	Width        *int32          `json:"width"`
	Height       *int32          `json:"height"`
	SizeBytes    int32           `json:"sizeBytes"`
	Blurhash     *string         `json:"blurhash"`
	TargetType   string          `json:"targetType"`
	IsNsfw       bool            `json:"isNsfw"`
	IsSensitive  bool            `json:"isSensitive"`
	SafetyScores json.RawMessage `json:"safetyScores"`
}

// RegisterAsset enregistre un MediaAsset sous statut DRAFT_ORPHAN (TTL 3 jours).
// Si le fichier existe déjà (dédoublonnage SHA-256), réutilise la référence ;
// un asset PURGED / SOFT_DELETED est réactivé avec une nouvelle fenêtre de purge.
// Le propriétaire est TOUJOURS l'utilisateur authentifié (jamais client-provided).
func (s *Service) RegisterAsset(ctx context.Context, ownerID string, in RegisterInput) (db.MediaAsset, error) {
	if in.Sha256 == "" || in.Url == "" || in.StoragePath == "" {
		return db.MediaAsset{}, errors.New("sha256, url et storagePath requis")
	}
	if in.TargetType == "" {
		in.TargetType = "SHARED"
	}
	if !validTargetTypes[in.TargetType] {
		return db.MediaAsset{}, errors.New("targetType invalide")
	}
	bucket := in.Bucket
	if bucket == "" {
		bucket = "articles-media"
	}

	existing, err := s.q.GetMediaAssetBySha256(ctx, in.Sha256)
	if err == nil {
		// Réactivation d'un asset purgé/supprimé (nouvelle fenêtre de 3 jours).
		if existing.Status == "PURGED" || existing.Status == "SOFT_DELETED" {
			reactivated, err := s.q.ReactivateMediaAsset(ctx, existing.ID)
			if err != nil {
				return db.MediaAsset{}, err
			}
			return reactivated, nil
		}
		return existing, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return db.MediaAsset{}, err
	}

	var safety []byte
	if len(in.SafetyScores) > 0 {
		safety = in.SafetyScores
	}

	return s.q.CreateMediaAsset(ctx, db.CreateMediaAssetParams{
		Sha256:       in.Sha256,
		Url:          in.Url,
		StoragePath:  in.StoragePath,
		Bucket:       bucket,
		MimeType:     in.MimeType,
		Width:        int4Ptr(in.Width),
		Height:       int4Ptr(in.Height),
		SizeBytes:    in.SizeBytes,
		Blurhash:     textPtr(in.Blurhash),
		IsNsfw:       in.IsNsfw,
		IsSensitive:  in.IsSensitive,
		SafetyScores: safety,
		OwnerId:      ownerID,
		TargetType:   db.MediaAssetTargetType(in.TargetType),
	})
}

// AssetDTO est la réponse publique d'un enregistrement : l'asset complet, pour
// que le client puisse relire les métadonnées (url, blurhash, status…).
type AssetDTO struct {
	ID         string `json:"id"`
	Sha256     string `json:"sha256"`
	Url        string `json:"url"`
	Status     string `json:"status"`
	TargetType string `json:"targetType"`
	CreatedAt  string `json:"createdAt"`
}

func toDTO(a db.MediaAsset) AssetDTO {
	return AssetDTO{
		ID:         a.ID,
		Sha256:     a.Sha256,
		Url:        a.Url,
		Status:     string(a.Status),
		TargetType: string(a.TargetType),
		CreatedAt:  a.CreatedAt.Time.Format(time.RFC3339),
	}
}

func int4Ptr(v *int32) pgtype.Int4 {
	if v == nil {
		return pgtype.Int4{}
	}
	return pgtype.Int4{Int32: *v, Valid: true}
}

func textPtr(v *string) pgtype.Text {
	if v == nil {
		return pgtype.Text{}
	}
	return pgtype.Text{String: *v, Valid: true}
}
