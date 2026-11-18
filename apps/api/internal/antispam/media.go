package antispam

import (
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
)

// MaxMediaURLsPerField borne le nombre d'images d'un champ unique
// (miroir de packages/schemas MAX_IMAGES_PER_POST).
const MaxMediaURLsPerField = 8

// MediaPolicy n'accepte que les images déjà passées par le pipeline média de la
// plateforme (route /api/upload : magic bytes, modération IA, ré-encodage
// Sharp/WebP, stripping EXIF) — ou un chemin relatif interne.
//
// 📖 Pourquoi c'est ici et pas seulement côté client : `POST /v1/posts`
// acceptait n'importe quelle URL `http(s)`. Un client pouvait donc publier une
// image distante (NSFW, pixel de pistage, fichier polyglotte) sans jamais
// traverser le module de sécurité image. La règle est appliquée au moment de
// l'écriture, donc elle vaut pour tous les clients (web, mobile, API).
//
// 🎯 Fail-closed : une politique sans origine n'autorise que les chemins
// relatifs. Les origines viennent de la config (MEDIA_CDN_BASE_URL,
// SUPABASE_URL) et sont posées au démarrage, jamais par une requête.
type MediaPolicy struct {
	origins []string
}

// NewMediaPolicy construit une politique à partir d'origines (URLs ou hôtes).
// Les entrées vides ou illisibles sont ignorées ; les doublons sont fusionnés.
func NewMediaPolicy(bases ...string) MediaPolicy {
	seen := make(map[string]struct{}, len(bases))
	origins := make([]string, 0, len(bases))
	for _, base := range bases {
		base = strings.TrimSpace(base)
		if base == "" {
			continue
		}
		parsed, err := url.Parse(base)
		if err != nil {
			continue
		}
		host := strings.ToLower(parsed.Hostname())
		if host == "" && parsed.Scheme == "" && !strings.ContainsAny(base, "/ ") {
			// Hôte nu (`cdn.qoe.fi`) : forme acceptée pour les variables d'env.
			host = strings.ToLower(base)
		}
		if host == "" {
			continue
		}
		if _, dup := seen[host]; dup {
			continue
		}
		seen[host] = struct{}{}
		origins = append(origins, host)
	}
	return MediaPolicy{origins: origins}
}

// Origins retourne la liste des hôtes autorisés (copie défensive).
func (p MediaPolicy) Origins() []string {
	return append([]string(nil), p.origins...)
}

// Validate accepte une URL unique ou un tableau JSON d'URLs — c'est le format
// historique de `Post.imageUrl` pour les pensées multi-images.
func (p MediaPolicy) Validate(raw string) error {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil
	}
	if strings.HasPrefix(trimmed, "[") {
		return p.validateList(trimmed)
	}
	return p.validateOne(trimmed)
}

func (p MediaPolicy) validateList(raw string) error {
	var urls []string
	if err := json.Unmarshal([]byte(raw), &urls); err != nil {
		return rejectBadRequest(CodeUnsafeURL, "La liste d'images fournie est invalide.")
	}
	if len(urls) > MaxMediaURLsPerField {
		return rejectBadRequest(
			CodeUnsafeURL,
			fmt.Sprintf("Maximum %d images par publication.", MaxMediaURLsPerField),
		)
	}
	for _, u := range urls {
		if err := p.validateOne(strings.TrimSpace(u)); err != nil {
			return err
		}
	}
	return nil
}

func (p MediaPolicy) validateOne(raw string) error {
	for _, r := range raw {
		if r < 0x20 || r == 0x7f {
			return rejectBadRequest(CodeUnsafeURL, "L'URL contient des caractères de contrôle interdits.")
		}
	}
	if raw == "" {
		return nil
	}
	// Chemin interne (`/storage/...`) : jamais protocol-relative (`//host`).
	if strings.HasPrefix(raw, "/") && !strings.HasPrefix(raw, "//") {
		return nil
	}

	parsed, err := url.Parse(raw)
	if err != nil {
		return rejectBadRequest(CodeUnsafeURL, "L'URL fournie est invalide.")
	}
	scheme := strings.ToLower(parsed.Scheme)
	if (scheme != "http" && scheme != "https") || parsed.Host == "" {
		return rejectBadRequest(CodeUnsafeURL, "Seules les URLs http://, https:// ou les chemins relatifs sont autorisés.")
	}
	if parsed.User != nil {
		return rejectBadRequest(CodeUnsafeURL, "L'URL ne doit pas contenir d'identifiants.")
	}

	host := strings.ToLower(parsed.Hostname())
	for _, origin := range p.origins {
		if host == origin {
			return nil
		}
	}
	return rejectBadRequest(
		CodeUnscreenedMedia,
		"Cette image n'a pas été téléversée via la plateforme : le module de sécurité image (modération, ré-encodage) est obligatoire.",
	)
}
