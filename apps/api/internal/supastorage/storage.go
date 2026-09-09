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
