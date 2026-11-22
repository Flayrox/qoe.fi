// Package mediaassets — registre des MediaAsset (médiathèque / upload).
// Migration de packages/db/src/repositories/media.ts → registerMediaAsset :
// dédoublonnage CAS par SHA-256, réactivation des assets purgés, création
// DRAFT_ORPHAN avec TTL 3 jours. Les autres fonctions du repository (reconcile,
// purge worker…) restent hors périmètre tant qu'aucun appelant ne les consomme.
//
// Frontière avec l'upload : le sniffing du contenu (magic bytes), le
// ré-encodage et le calcul de dimensions vivent dans le chemin d'upload
// (`netguard.SniffImageMIME`, handler créateur) — ce module ne re-sniffe rien.
// En revanche il est le **propriétaire du registre** : il refuse tout ce qui
// pourrait empoisonner une ligne (MIME actif, chemin de stockage hors bucket,
// URL non servie par la plateforme, taille incohérente), parce que c'est cette
// ligne qui pilote ensuite la suppression de l'objet dans le bucket.
package mediaassets

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/antispam"
	db "github.com/qoefi/api/internal/database"
)

// ValidationError distingue un refus client (400) d'une panne (500).
type ValidationError struct{ Msg string }

func (e ValidationError) Error() string { return e.Msg }

func invalid(format string, args ...any) error {
	return ValidationError{Msg: fmt.Sprintf(format, args...)}
}

// ErrThrottled et ErrQuotaExceeded : refus temporaires (429/413), pas des
// pannes. Les handlers les mappent explicitement.
var (
	ErrThrottled     = errors.New("trop d'uploads")
	ErrQuotaExceeded = errors.New("quota de stockage dépassé")
)

// validTargetTypes est l'allowlist des targetType MediaAsset (parité enum Prisma).
var validTargetTypes = map[string]bool{
	"ARTICLE_COVER": true, "ARTICLE_BODY": true, "THOUGHT_ATTACHMENT": true,
	"USER_AVATAR": true, "USER_BANNER": true, "PUBLISHER_LOGO": true,
	"PUBLISHER_BANNER": true, "SHARED": true,
}

// allowedImageMimes : seules les images ré-encodables sont enregistrables.
// `image/svg+xml` est volontairement exclu (contenu actif : un SVG servi inline
// exécute du script). Le type déclaré doit correspondre à ce que le chemin
// d'upload a sniffé ; le registre ne peut pas re-sniffer un objet déjà poussé.
var allowedImageMimes = map[string]bool{
	"image/jpeg": true, "image/png": true, "image/gif": true,
	"image/webp": true, "image/avif": true,
}

const (
	// defaultQuotaBytes borne le volume stocké par utilisateur (défaut 512 Mo,
	// surchargeable via SetQuotaBytes — reflète MEDIA_QUOTA_BYTES).
	defaultQuotaBytes = int64(512 << 20)

	// defaultUploadsPerHour borne les nouveaux uploads par utilisateur et par
	// heure (anti-flood : coût Sharp + modération + storage — reflète
	// MEDIA_UPLOADS_PER_HOUR).
	defaultUploadsPerHour = int64(100)

	// maxUploadBytes est la borne dure d'un objet du registre (12 Mo : la plus
	// grande entrée acceptée par le moteur média, packages/supabase
	// MAX_UPLOAD_BYTES ; la sortie ré-encodée reste sous cette borne). Une
	// taille négative ou nulle contournait le quota (somme négative) ; une
	// taille énorme le saturait sans objet réel.
	maxUploadBytes = 12 << 20

	// maxDimension borne largeur/hauteur déclarées (pixels).
	maxDimension = 20000

	// maxBlurhashLen borne le placeholder (chaîne courte par construction).
	maxBlurhashLen = 100

	// maxSafetyScoresLen borne le JSON de modération (quelques scores).
	maxSafetyScoresLen = 4096

	// maxStoragePathLen borne la clé d'objet (chemins CDN réels < 200).
	maxStoragePathLen = 512

	// maxAssetURLLen borne l'URL publique enregistrée.
	maxAssetURLLen = 2048

	// defaultBucket est le seul bucket que ce registre écrit/purge : un bucket
	// client-provided permettait de faire supprimer des objets d'un autre
	// espace (traversée de bucket via le worker de purge).
	defaultBucket = "articles-media"
)

// uploadThrottleWindow est la fenêtre glissante du throttle d'uploads.
const uploadThrottleWindow = time.Hour

// defaultPurgeBatch limite le nombre d'assets purgés par passage du worker.
const defaultPurgeBatch = 200

// maxPurgeBatch borne une demande de purge explicite.
const maxPurgeBatch = 500

// storageDeleteTimeout borne la suppression d'un objet (un storage lent ne
// bloque pas le passage du worker au-delà).
const storageDeleteTimeout = 30 * time.Second

// sha256Re : hash hexadécimal minuscule de 64 caractères (forme réelle d'un
// SHA-256 ; les fixtures historiques en clair masquaient l'absence de contrôle).
var sha256Re = regexp.MustCompile(`^[a-f0-9]{64}$`)

// storagePathRe : clé d'objet relative, sans segment `.`/`..`, sans slash
// initial ni antislash, sans caractère de contrôle.
var storagePathRe = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._/-]*$`)

type Service struct {
	pool *pgxpool.Pool
	q    *db.Queries
	// quotaBytes borne le volume non purgé par utilisateur (0 = pas de limite).
	quotaBytes int64
	// uploadsPerHour borne les nouveaux uploads par heure (0 = pas de limite).
	uploadsPerHour int64
	// mediaPolicy valide l'origine des URLs enregistrées (fail-closed : sans
	// origine configurée, aucune URL absolue n'est acceptée).
	mediaPolicy antispam.MediaPolicy
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool, q: db.New(pool), quotaBytes: defaultQuotaBytes, uploadsPerHour: defaultUploadsPerHour}
}

// SetQuotaBytes surcharge la limite de stockage par utilisateur (0 = illimité).
func (s *Service) SetQuotaBytes(n int64) *Service {
	s.quotaBytes = n
	return s
}

// SetUploadsPerHour surcharge le throttle d'uploads par heure (0 = illimité).
func (s *Service) SetUploadsPerHour(n int64) *Service {
	s.uploadsPerHour = n
	return s
}

// SetMediaPolicy fixe les origines média autorisées pour `url`
// (MEDIA_CDN_BASE_URL, SUPABASE_URL posées au démarrage, jamais par requête).
func (s *Service) SetMediaPolicy(p antispam.MediaPolicy) *Service {
	s.mediaPolicy = p
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

// normalize valide et normalise la charge utile ; toute anomalie devient une
// ValidationError (400 côté handler), jamais une écriture partielle.
func (s *Service) normalize(in RegisterInput) (RegisterInput, error) {
	in.Sha256 = strings.ToLower(strings.TrimSpace(in.Sha256))
	in.Url = strings.TrimSpace(in.Url)
	in.StoragePath = strings.TrimSpace(in.StoragePath)
	in.MimeType = strings.ToLower(strings.TrimSpace(in.MimeType))
	in.Bucket = strings.TrimSpace(in.Bucket)

	if !sha256Re.MatchString(in.Sha256) {
		return in, invalid("sha256 invalide (64 caractères hexadécimaux attendus)")
	}
	if in.Url == "" {
		return in, invalid("url requise")
	}
	if len(in.Url) > maxAssetURLLen {
		return in, invalid("url trop longue (maximum %d caractères)", maxAssetURLLen)
	}
	if err := s.mediaPolicy.Validate(in.Url); err != nil {
		return in, invalid("%s", err.Error())
	}
	if in.StoragePath == "" {
		return in, invalid("storagePath requis")
	}
	if len(in.StoragePath) > maxStoragePathLen {
		return in, invalid("storagePath trop long (maximum %d caractères)", maxStoragePathLen)
	}
	if !safeStoragePath(in.StoragePath) {
		return in, invalid("storagePath invalide")
	}
	if in.Bucket == "" {
		in.Bucket = defaultBucket
	}
	if in.Bucket != defaultBucket {
		return in, invalid("bucket invalide")
	}
	if !allowedImageMimes[in.MimeType] {
		return in, invalid("mimeType non supporté (jpeg, png, gif, webp, avif)")
	}
	if in.SizeBytes <= 0 {
		return in, invalid("sizeBytes doit être positif")
	}
	if int64(in.SizeBytes) > maxUploadBytes {
		return in, invalid("fichier trop volumineux (maximum %d octets)", maxUploadBytes)
	}
	if err := validateDimension("width", in.Width); err != nil {
		return in, err
	}
	if err := validateDimension("height", in.Height); err != nil {
		return in, err
	}
	if (in.Width == nil) != (in.Height == nil) {
		return in, invalid("width et height doivent être fournis ensemble")
	}
	if in.Blurhash != nil {
		bh := strings.TrimSpace(*in.Blurhash)
		if bh == "" {
			in.Blurhash = nil
		} else if utf8.RuneCountInString(bh) > maxBlurhashLen || strings.ContainsRune(bh, '\x00') {
			return in, invalid("blurhash invalide")
		} else {
			in.Blurhash = &bh
		}
	}
	if len(in.TargetType) == 0 {
		in.TargetType = "SHARED"
	}
	if !validTargetTypes[in.TargetType] {
		return in, invalid("targetType invalide")
	}
	if len(in.SafetyScores) > maxSafetyScoresLen || (len(in.SafetyScores) > 0 && !json.Valid(in.SafetyScores)) {
		return in, invalid("safetyScores invalide")
	}
	return in, nil
}

func validateDimension(name string, v *int32) error {
	if v == nil {
		return nil
	}
	if *v <= 0 || *v > maxDimension {
		return invalid("%s hors bornes (1..%d)", name, maxDimension)
	}
	return nil
}

// RegisterAsset enregistre un MediaAsset sous statut DRAFT_ORPHAN (TTL 3 jours).
// Si le fichier existe déjà **pour ce propriétaire** (dédoublonnage SHA-256),
// réutilise la référence ; un asset PURGED / SOFT_DELETED est réactivé avec une
// nouvelle fenêtre de purge. Le propriétaire est TOUJOURS l'utilisateur
// authentifié (jamais client-provided).
//
// Le throttle et le quota sont vérifiés puis consommés dans la **même
// transaction** que l'insertion, sous un verrou consultatif par propriétaire :
// deux uploads concurrents ne peuvent plus dépasser ensemble la limite.
func (s *Service) RegisterAsset(ctx context.Context, ownerID string, in RegisterInput) (db.MediaAsset, error) {
	if strings.TrimSpace(ownerID) == "" {
		return db.MediaAsset{}, invalid("propriétaire requis")
	}
	in, err := s.normalize(in)
	if err != nil {
		return db.MediaAsset{}, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return db.MediaAsset{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, ownerID); err != nil {
		return db.MediaAsset{}, err
	}
	q := s.q.WithTx(tx)

	existing, err := q.GetMediaAssetBySha256(ctx, db.GetMediaAssetBySha256Params{
		OwnerID: ownerID,
		Sha256:  in.Sha256,
	})
	if err == nil {
		// Réactivation d'un asset purgé/supprimé (nouvelle fenêtre de 3 jours).
		if existing.Status == "PURGED" || existing.Status == "SOFT_DELETED" {
			reactivated, rerr := q.ReactivateMediaAsset(ctx, existing.ID)
			if rerr != nil {
				return db.MediaAsset{}, rerr
			}
			if cerr := tx.Commit(ctx); cerr != nil {
				return db.MediaAsset{}, cerr
			}
			return reactivated, nil
		}
		if cerr := tx.Commit(ctx); cerr != nil {
			return db.MediaAsset{}, cerr
		}
		return existing, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return db.MediaAsset{}, err
	}

	// Throttle anti-flood : les doublons CAS ne créent aucune ligne donc ne
	// consomment rien — seuls les nouveaux uploads comptent.
	if s.uploadsPerHour > 0 {
		// Seuil en UTC : MediaAsset."createdAt" est écrit par CURRENT_TIMESTAMP
		// (horloge base en UTC) — un seuil en heure locale comptait zéro ligne.
		recent, uerr := q.CountRecentUploads(ctx, db.CountRecentUploadsParams{
			OwnerId:   ownerID,
			CreatedAt: pgtype.Timestamp{Time: time.Now().UTC().Add(-uploadThrottleWindow), Valid: true},
		})
		if uerr != nil {
			return db.MediaAsset{}, uerr
		}
		if recent >= s.uploadsPerHour {
			return db.MediaAsset{}, fmt.Errorf("%w (%d/heure maximum, réessayez plus tard)",
				ErrThrottled, s.uploadsPerHour)
		}
	}

	// Quota de stockage par utilisateur (anti-saturation) : le volume non
	// purgé + le nouvel objet ne doit pas dépasser la limite.
	if s.quotaBytes > 0 {
		usage, uerr := q.OwnerMediaUsage(ctx, ownerID)
		if uerr != nil {
			return db.MediaAsset{}, uerr
		}
		if usage.TotalBytes+int64(in.SizeBytes) > s.quotaBytes {
			return db.MediaAsset{}, fmt.Errorf("%w (%d octets utilisés, limite %d)",
				ErrQuotaExceeded, usage.TotalBytes, s.quotaBytes)
		}
	}

	var safety []byte
	if len(in.SafetyScores) > 0 {
		safety = in.SafetyScores
	}

	created, err := q.CreateMediaAsset(ctx, db.CreateMediaAssetParams{
		Sha256:       in.Sha256,
		Url:          in.Url,
		StoragePath:  in.StoragePath,
		Bucket:       in.Bucket,
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
	if err != nil {
		return db.MediaAsset{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return db.MediaAsset{}, err
	}
	return created, nil
}

// GetBySha256 retrouve un asset **du propriétaire** par son hash (pré-contrôle
// CAS avant upload : un doublon existant est réutilisé sans pousser un nouvel
// objet au storage). Un hash appartenant à un autre compte n'est jamais rendu.
func (s *Service) GetBySha256(ctx context.Context, ownerID, sha string) (db.MediaAsset, error) {
	if strings.TrimSpace(ownerID) == "" {
		return db.MediaAsset{}, invalid("propriétaire requis")
	}
	return s.q.GetMediaAssetBySha256(ctx, db.GetMediaAssetBySha256Params{
		OwnerID: ownerID,
		Sha256:  strings.ToLower(strings.TrimSpace(sha)),
	})
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
	// Échéance écrite par la base en UTC : une échéance en heure locale
	// décalait la purge de l'offset du serveur.
	detached, err := s.q.SoftDeleteDetachedMediaAssets(ctx, db.SoftDeleteDetachedMediaAssetsParams{
		Column1:    referenced,
		PurgeDueAt: pgtype.Timestamp{Time: time.Now().UTC().Add(softDeleteGrace), Valid: true},
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
//
// Un échec storage sur un objet n'interrompt plus le passage (un seul objet
// cassé bloquait la purge de tous les suivants) : l'erreur est journalisée,
// la ligne reste purgeable et le premier échec est remonté au worker.
func (s *Service) PurgeExpired(ctx context.Context, deleter StorageDeleter, limit int) (int, error) {
	if deleter == nil {
		// Sans deleter, marquer PURGED laisserait l'objet dans le bucket pour
		// toujours (fuite de stockage silencieuse).
		return 0, errors.New("deleter de stockage requis")
	}
	if limit <= 0 {
		limit = defaultPurgeBatch
	}
	if limit > maxPurgeBatch {
		limit = maxPurgeBatch
	}
	assets, err := s.q.ListPurgeableMediaAssets(ctx, int32(limit))
	if err != nil {
		return 0, err
	}
	purged := 0
	var firstErr error
	for _, a := range assets {
		if a.Bucket != defaultBucket || !safeStoragePath(a.StoragePath) {
			// Ligne héritée/empoisonnée : ne jamais piloter une suppression
			// storage avec un bucket ou un chemin arbitraire.
			log.Printf("[mediaassets] purge ignorée (bucket/chemin invalide) id=%s bucket=%q path=%q",
				a.ID, a.Bucket, a.StoragePath)
			if firstErr == nil {
				firstErr = fmt.Errorf("asset %s : bucket ou chemin de stockage invalide", a.ID)
			}
			continue
		}
		// Dédoublonnage CAS : plusieurs propriétaires peuvent référencer le même
		// objet. Supprimer l'objet sur la purge d'une seule ligne casserait les
		// assets des autres — on ne le supprime qu'à la dernière référence.
		live, lerr := s.q.CountOtherLiveMediaAssetsByStoragePath(ctx,
			db.CountOtherLiveMediaAssetsByStoragePathParams{
				Bucket:      a.Bucket,
				StoragePath: a.StoragePath,
				ID:          a.ID,
			})
		if lerr != nil {
			log.Printf("[mediaassets] purge refcount échouée id=%s: %v", a.ID, lerr)
			if firstErr == nil {
				firstErr = lerr
			}
			continue
		}
		if live == 0 {
			dctx, cancel := context.WithTimeout(ctx, storageDeleteTimeout)
			derr := deleter.Delete(dctx, a.Bucket, a.StoragePath)
			cancel()
			if derr != nil {
				log.Printf("[mediaassets] purge storage échouée id=%s: %v", a.ID, derr)
				if firstErr == nil {
					firstErr = derr
				}
				continue
			}
		}
		if err := s.q.MarkMediaAssetPurged(ctx, a.ID); err != nil {
			log.Printf("[mediaassets] purge DB échouée id=%s: %v", a.ID, err)
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		purged++
	}
	return purged, firstErr
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

// safeStoragePath : clé d'objet relative sûre (pas de `..`, pas de slash
// initial, pas d'antislash, pas de caractère de contrôle).
func safeStoragePath(p string) bool {
	if p == "" || len(p) > maxStoragePathLen || strings.ContainsAny(p, "\\\x00") {
		return false
	}
	if strings.HasPrefix(p, "/") || !storagePathRe.MatchString(p) {
		return false
	}
	for _, seg := range strings.Split(p, "/") {
		if seg == "" || seg == "." || seg == ".." {
			return false
		}
	}
	return true
}

// ListOptions borne la lecture de la bibliothèque personnelle.
type ListOptions struct {
	TargetType string
	Query      string
	Limit      int32
	Offset     int32
}

// AssetListItem est la vue allégée utilisée par le sélecteur d'images du
// Studio : pas de chemins storage ni de scores de modération côté client.
type AssetListItem struct {
	ID         string  `json:"id"`
	Url        string  `json:"url"`
	MimeType   string  `json:"mimeType"`
	Width      *int32  `json:"width,omitempty"`
	Height     *int32  `json:"height,omitempty"`
	SizeBytes  int32   `json:"sizeBytes"`
	Blurhash   *string `json:"blurhash,omitempty"`
	Status     string  `json:"status"`
	TargetType string  `json:"targetType"`
	CreatedAt  string  `json:"createdAt"`
}

const (
	defaultListLimit = int32(24)
	maxListLimit     = int32(60)
	maxListQuery     = 100
	// maxListOffset borne la pagination profonde (le client suivant lit une
	// bibliothèque, pas un export) : un offset arbitraire forçait Postgres à
	// parcourir toute la table pour rien.
	maxListOffset = int32(10000)
)

// ListByOwner retourne les assets non purgés de l'utilisateur. Le propriétaire
// vient toujours du JWT ; aucun ownerId client n'est accepté.
func (s *Service) ListByOwner(ctx context.Context, ownerID string, opts ListOptions) ([]AssetListItem, error) {
	if ownerID == "" {
		return nil, invalid("propriétaire requis")
	}
	if opts.Limit <= 0 {
		opts.Limit = defaultListLimit
	}
	if opts.Limit > maxListLimit {
		opts.Limit = maxListLimit
	}
	if opts.Offset < 0 {
		opts.Offset = 0
	}
	if opts.Offset > maxListOffset {
		opts.Offset = maxListOffset
	}
	if opts.TargetType != "" && !validTargetTypes[opts.TargetType] {
		return nil, invalid("targetType invalide")
	}
	q := escapeLike(strings.TrimSpace(opts.Query))
	if utf8.RuneCountInString(q) > maxListQuery {
		// Troncature par runes : couper par octets produisait un UTF-8
		// invalide que Postgres refusait ensuite.
		q = string([]rune(q)[:maxListQuery])
	}

	rows, err := s.q.ListMediaAssetsByOwner(ctx, db.ListMediaAssetsByOwnerParams{
		OwnerId:    ownerID,
		TargetType: opts.TargetType,
		Q:          q,
		PageOffset: opts.Offset,
		PageSize:   opts.Limit,
	})
	if err != nil {
		return nil, err
	}

	items := make([]AssetListItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, AssetListItem{
			ID:         row.ID,
			Url:        row.Url,
			MimeType:   row.MimeType,
			Width:      int4Value(row.Width),
			Height:     int4Value(row.Height),
			SizeBytes:  row.SizeBytes,
			Blurhash:   textValue(row.Blurhash),
			Status:     string(row.Status),
			TargetType: string(row.TargetType),
			CreatedAt:  row.CreatedAt.Time.Format(time.RFC3339),
		})
	}
	return items, nil
}

// escapeLike neutralise les jokers ILIKE d'une recherche utilisateur (la
// requête utilise ESCAPE '\') : chercher « 100 % » ne doit pas ramener tout.
func escapeLike(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		switch r {
		case '\\', '%', '_':
			b.WriteByte('\\')
		}
		b.WriteRune(r)
	}
	return b.String()
}

func int4Value(v pgtype.Int4) *int32 {
	if !v.Valid {
		return nil
	}
	out := v.Int32
	return &out
}

func textValue(v pgtype.Text) *string {
	if !v.Valid {
		return nil
	}
	out := v.String
	return &out
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
