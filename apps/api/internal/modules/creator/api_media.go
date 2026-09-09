package creator

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/modules/mediaassets"
	"github.com/qoefi/api/internal/response"
	"github.com/qoefi/api/internal/supastorage"
)

// maxMediaBytes borne la taille des uploads (10 Mo — couvertures/corps).
const maxMediaBytes = 10 << 20

// allowedMediaTypes est l'allowlist MIME des images acceptées (ext → nom).
var allowedMediaTypes = map[string]string{
	"image/jpeg": "jpg",
	"image/png":  "png",
	"image/gif":  "gif",
	"image/webp": "webp",
	"image/avif": "avif",
}

// WithMediaUpload injecte le client de stockage + le registre d'assets
// (upload d'images créateur). Nil-safe : sans eux, POST /v1/creator/media
// répond 503 explicite plutôt que de planter.
func (h *Handler) WithMediaUpload(storage *supastorage.Client, assets *mediaassets.Service) *Handler {
	h.mediaStorage = storage
	h.mediaAssets = assets
	return h
}

// apiMediaUpload — POST /v1/creator/media (scope WRITE) : upload une image
// (multipart champ `file` ou body brut) vers Supabase Storage, l'enregistre
// dans la médiathèque (dédoublonnage SHA-256) et retourne l'URL publique.
// Réponse : 201 {id, url, sha256, storagePath, mimeType, sizeBytes, targetType}.
func (h *Handler) apiMediaUpload(w http.ResponseWriter, r *http.Request) {
	if h.mediaStorage == nil || h.mediaAssets == nil {
		response.Error(w, http.StatusServiceUnavailable, "Upload d'images non configuré")
		return
	}
	userID, _ := middleware.UserID(r.Context())
	if userID == "" {
		response.Unauthorized(w, "Authentification requise")
		return
	}

	// Lecture du fichier : multipart (champ `file`) ou body brut (curl --data-binary).
	var (
		data        []byte
		contentType string
		err         error
	)
	headerCT := strings.TrimSpace(strings.Split(r.Header.Get("Content-Type"), ";")[0])
	if strings.HasPrefix(headerCT, "multipart/form-data") {
		if err := r.ParseMultipartForm(maxMediaBytes); err != nil {
			response.BadRequest(w, "Formulaire invalide ou fichier trop volumineux (max 10 Mo)")
			return
		}
		file, header, ferr := r.FormFile("file")
		if ferr != nil {
			response.BadRequest(w, "Champ `file` manquant")
			return
		}
		defer file.Close()
		data, err = io.ReadAll(io.LimitReader(file, maxMediaBytes+1))
		if err != nil {
			response.BadRequest(w, "Lecture du fichier impossible")
			return
		}
		contentType = strings.TrimSpace(strings.Split(header.Header.Get("Content-Type"), ";")[0])
		if _, ok := allowedMediaTypes[contentType]; !ok {
			contentType = http.DetectContentType(data)
		}
	} else {
		data, err = io.ReadAll(io.LimitReader(r.Body, maxMediaBytes+1))
		if err != nil {
			response.BadRequest(w, "Lecture du fichier impossible")
			return
		}
		contentType = headerCT
	}

	if len(data) == 0 {
		response.BadRequest(w, "Fichier vide")
		return
	}
	if len(data) > maxMediaBytes {
		response.BadRequest(w, "Fichier trop volumineux (max 10 Mo)")
		return
	}
	ext, ok := allowedMediaTypes[contentType]
	if !ok {
		response.BadRequest(w, "Type de fichier non supporté (jpeg, png, gif, webp, avif)")
		return
	}

	// Chemin serveur, jamais client : creator/{userID}/{timestamp}-{hash}.{ext}.
	sum := sha256.Sum256(data)
	hexSum := hex.EncodeToString(sum[:])
	path := fmt.Sprintf("creator/%s/%d-%s.%s", userID, time.Now().UnixMilli(), hexSum[:12], ext)

	ctx := r.Context()
	url, err := h.mediaStorage.Upload(ctx, "articles-media", path, contentType, bytes.NewReader(data))
	if err != nil {
		log.Printf("[creator] media upload: %v", err)
		response.Error(w, http.StatusBadGateway, "Échec de l'upload vers le stockage")
		return
	}

	asset, err := h.mediaAssets.RegisterAsset(ctx, userID, mediaassets.RegisterInput{
		Sha256:      hexSum,
		Url:         url,
		StoragePath: path,
		Bucket:      "articles-media",
		MimeType:    contentType,
		SizeBytes:   int32(len(data)),
		TargetType:  "ARTICLE_COVER",
	})
	if err != nil {
		log.Printf("[creator] media register: %v", err)
		response.Internal(w)
		return
	}

	response.Created(w, map[string]any{
		"id":          asset.ID,
		"url":         url,
		"sha256":      hexSum,
		"storagePath": path,
		"mimeType":    contentType,
		"sizeBytes":   len(data),
		"targetType":  "ARTICLE_COVER",
	})
}
