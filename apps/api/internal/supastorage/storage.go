// Package supastorage — client minimal Supabase Storage (REST) pour les
// uploads serveur (images de couverture, corps d'articles…). Le bucket doit
// être public pour que l'URL retournée soit directement serviable.
package supastorage

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Client pousse des fichiers dans un bucket Supabase Storage.
type Client struct {
	baseURL string // origine Supabase, ex. https://xxxx.supabase.co
	secret  string // service_role (jamais exposé)
	http    *http.Client
}

// New construit un client. baseURL ou secret vide → Upload échoue avec une
// erreur explicite (stockage non configuré), jamais un panic.
func New(baseURL, serviceRoleKey string) *Client {
	return &Client{
		baseURL: strings.TrimSuffix(baseURL, "/"),
		secret:  serviceRoleKey,
		http:    &http.Client{Timeout: 60 * time.Second},
	}
}

// Upload pousse `body` (contentType) dans bucket/path et retourne l'URL
// publique du fichier (bucket public requis). Path est fournie par l'appelant
// (jamais client-provided) : préfixer par l'id de l'utilisateur.
func (c *Client) Upload(ctx context.Context, bucket, path, contentType string, body io.Reader) (string, error) {
	if c.baseURL == "" || c.secret == "" {
		return "", errors.New("stockage d'images non configuré (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)")
	}
	url := c.baseURL + "/storage/v1/object/" + bucket + "/" + path
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, body)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", contentType)
	req.Header.Set("Authorization", "Bearer "+c.secret)
	req.Header.Set("apikey", c.secret)
	req.Header.Set("x-upsert", "false")

	res, err := c.http.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		raw, _ := io.ReadAll(io.LimitReader(res.Body, 512))
		return "", fmt.Errorf("stockage: statut %d: %s", res.StatusCode, strings.TrimSpace(string(raw)))
	}
	return c.baseURL + "/storage/v1/object/public/" + bucket + "/" + path, nil
}

// Delete supprime `path` du bucket (API Supabase : DELETE /object/{bucket}
// avec {"prefixes": [...]}). Une réponse 404 (déjà supprimé) n'est pas une
// erreur : la purge reste idempotente.
func (c *Client) Delete(ctx context.Context, bucket, path string) error {
	if c.baseURL == "" || c.secret == "" {
		return errors.New("stockage d'images non configuré (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)")
	}
	url := c.baseURL + "/storage/v1/object/" + bucket
	body := strings.NewReader(`{"prefixes":["` + escapeJSON(path) + `"]}`)
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, url, body)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.secret)
	req.Header.Set("apikey", c.secret)

	res, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusNotFound {
		return nil
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		raw, _ := io.ReadAll(io.LimitReader(res.Body, 512))
		return fmt.Errorf("stockage: suppression statut %d: %s", res.StatusCode, strings.TrimSpace(string(raw)))
	}
	return nil
}

// PublicURL construit l'URL publique d'un objet (bucket public), réécrite
// vers le CDN si cdnBase est fourni (ex: https://cdn.qoe.fi).
func (c *Client) PublicURL(bucket, path, cdnBase string) string {
	raw := c.baseURL + "/storage/v1/object/public/" + bucket + "/" + path
	base := strings.TrimSuffix(strings.TrimSpace(cdnBase), "/")
	if base == "" || c.baseURL == "" {
		return raw
	}
	return base + "/storage/v1/object/public/" + bucket + "/" + path
}

// escapeJSON échappe un chemin pour l'injecter dans un littéral JSON
// (les paths générés côté serveur ne contiennent ni guillemets ni
// backslashes, mais on verrouille par construction).
func escapeJSON(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	return strings.ReplaceAll(s, `"`, `\"`)
}
