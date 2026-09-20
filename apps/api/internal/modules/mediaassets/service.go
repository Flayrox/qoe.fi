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
	"fmt"
	"regexp"
	"sort"
	"strings"
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

// defaultQuotaBytes borne le volume stocké par utilisateur (défaut 512 Mo,
// surchargeable via SetQuotaBytes — reflète MEDIA_QUOTA_BYTES).
const defaultQuotaBytes = int64(512 << 20)

// defaultPurgeBatch limite le nombre d'assets purgés par passage du worker.
const defaultPurgeBatch = 200

type Service struct {
	pool *pgxpool.Pool
	q    *db.Queries
	// quotaBytes borne le volume non purgé par utilisateur (0 = pas de limite).
	quotaBytes int64
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool, q: db.New(pool), quotaBytes: defaultQuotaBytes}
}

// SetQuotaBytes surcharge la limite de stockage par utilisateur (0 = illimité).
func (s *Service) SetQuotaBytes(n int64) *Service {
	s.quotaBytes = n
	return s
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

	// Quota de stockage par utilisateur (anti-saturation) : le volume non
	// purgé + le nouvel objet ne doit pas dépasser la limite.
	if s.quotaBytes > 0 {
		usage, uerr := s.q.OwnerMediaUsage(ctx, ownerID)
		if uerr != nil {
			return db.MediaAsset{}, uerr
		}
		if usage.TotalBytes+int64(in.SizeBytes) > s.quotaBytes {
			return db.MediaAsset{}, fmt.Errorf(
				"quota de stockage dépassé (%d octets utilisés, limite %d)",
				usage.TotalBytes, s.quotaBytes)
		}
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

// GetBySha256 retrouve un asset par son hash (pré-contrôle CAS avant upload :
// un doublon existant est réutilisé sans pousser un nouvel objet au storage).
func (s *Service) GetBySha256(ctx context.Context, sha string) (db.MediaAsset, error) {
	return s.q.GetMediaAssetBySha256(ctx, sha)
}

// AttachByURLs marque ATTACHED les assets correspondant aux URLs
// définitivement enregistrées côté métier (attachedToID = id de la ligne
// métier lorsqu'il est unique, sinon ""). Les assets PURGED sont ignorés
// (objet déjà supprimé du storage — réactivation CAS au prochain upload).
func (s *Service) AttachByURLs(ctx context.Context, attachedToID string, urls []string) (int64, error) {
	urls = normalizeAssetURLs(urls)
	if len(urls) == 0 {
		return 0, nil
	}
	ids, err := s.q.AttachMediaAssetsByUrls(ctx, db.AttachMediaAssetsByUrlsParams{
		Column1: attachedToID,
		Column2: urls,
	})
	if err != nil {
		return 0, err
	}
	return int64(len(ids)), nil
}

// Reconcile aligne le registre sur les URLs réellement référencées :
// attache les orphelins devenus utilisés, détache (grâce soft-delete) les
// assets qui ne sont plus référencés nulle part (image remplacée ou ligne
// métier supprimée). Retourne (attachés, détachés).
func (s *Service) Reconcile(ctx context.Context, referenced []string, softDeleteGrace time.Duration) (int64, int64, error) {
	referenced = normalizeAssetURLs(referenced)
	attached, err := s.AttachByURLs(ctx, "", referenced)
	if err != nil {
		return 0, 0, err
	}
	if softDeleteGrace <= 0 {
		softDeleteGrace = 7 * 24 * time.Hour
	}
	detached, err := s.q.SoftDeleteDetachedMediaAssets(ctx, db.SoftDeleteDetachedMediaAssetsParams{
		Column1:    referenced,
		PurgeDueAt: pgtype.Timestamp{Time: time.Now().Add(softDeleteGrace), Valid: true},
	})
	if err != nil {
		return attached, 0, err
	}
	return attached, int64(len(detached)), nil
}

// StorageDeleter supprime un objet du bucket (implémenté par supastorage.Client).
type StorageDeleter interface {
	Delete(ctx context.Context, bucket, path string) error
}

// PurgeExpired supprime définitivement les assets arrivés à échéance
// (orphelins jamais attachés + détachés au-delà de la grâce) : objet
// storage d'abord, ligne DB (PURGED) ensuite. La suppression storage est
// idempotente (404 ignoré) : un objet déjà absent n'empêche pas la purge DB.
func (s *Service) PurgeExpired(ctx context.Context, deleter StorageDeleter, limit int) (int, error) {
	if limit <= 0 {
		limit = defaultPurgeBatch
	}
	assets, err := s.q.ListPurgeableMediaAssets(ctx, int32(limit))
	if err != nil {
		return 0, err
	}
	purged := 0
	for _, a := range assets {
		if deleter != nil {
			if derr := deleter.Delete(ctx, a.Bucket, a.StoragePath); derr != nil {
				return purged, derr
			}
		}
		if err := s.q.MarkMediaAssetPurged(ctx, a.ID); err != nil {
			return purged, err
		}
		purged++
	}
	return purged, nil
}

// imgSrcRe extrait les URLs des balises <img> du HTML des articles.
var imgSrcRe = regexp.MustCompile(`(?i)<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']`)

// maxReconcileURLs borne la taille du set de réconciliation (requêtes ANY).
const maxReconcileURLs = 5000

// ExtractImageURLs extrait les URLs d'images http(s) d'un contenu HTML
// (corps d'article), dédupliquées et triées.
func ExtractImageURLs(html string) []string {
	if html == "" {
		return nil
	}
	seen := map[string]struct{}{}
	for _, m := range imgSrcRe.FindAllStringSubmatch(html, -1) {
		u := strings.TrimSpace(m[1])
		if u == "" {
			continue
		}
		lower := strings.ToLower(u)
		if !strings.HasPrefix(lower, "http://") && !strings.HasPrefix(lower, "https://") {
			continue
		}
		seen[u] = struct{}{}
	}
	out := make([]string, 0, len(seen))
	for u := range seen {
		out = append(out, u)
	}
	sort.Strings(out)
	return out
}

// normalizeAssetURLs nettoie un set d'URLs d'assets (trim, http(s) uniquement,
// dédupliquées, bornées) pour les requêtes ANY.
func normalizeAssetURLs(urls []string) []string {
	seen := map[string]struct{}{}
	for _, u := range urls {
		u = strings.TrimSpace(u)
		if u == "" {
			continue
		}
		lower := strings.ToLower(u)
		if !strings.HasPrefix(lower, "http://") && !strings.HasPrefix(lower, "https://") {
			continue
		}
		seen[u] = struct{}{}
		if len(seen) >= maxReconcileURLs {
			break
		}
	}
	out := make([]string, 0, len(seen))
	for u := range seen {
		out = append(out, u)
	}
	sort.Strings(out)
	return out
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
