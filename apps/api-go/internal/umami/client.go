// Package umami — client de l'API Umami pour le proxy /v1/analytics/stats.
// Supporte :
//   - Umami self-hosted v2 : POST /api/auth/login (username/password) → token Bearer (caché).
//   - Umami Cloud : API key statique (Bearer).
package umami

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"
)

// Stats est la métrique globale d'un website (miroir de UmamiStats côté TS).
type Stats struct {
	Pageviews int `json:"pageviews"`
	Visitors  int `json:"visitors"`
	Visits    int `json:"visits"`
	Bounces   int `json:"bounces"`
	Totaltime int `json:"totaltime"`
}

// PageMetric est un point (url/plateforme/référant → vues).
type PageMetric struct {
	X string `json:"x"`
	Y int    `json:"y"`
}

type Client struct {
	apiURL string
	apiKey string
	user   string
	pass   string

	httpCli *http.Client

	mu        sync.Mutex
	token     string
	tokenTime time.Time
}

// NewClient crée un client. Si user/pass sont fournis, il s'authentifie par
// login self-hosted (token mis en cache ~4h) ; sinon il utilise apiKey en Bearer.
func NewClient(apiURL, apiKey, user, pass string) *Client {
	return &Client{
		apiURL:  apiURL,
		apiKey:  apiKey,
		user:    user,
		pass:    pass,
		httpCli: &http.Client{Timeout: 10 * time.Second},
	}
}

// WebsiteStats interroge /websites/{id}/stats?startAt&endAt.
func (c *Client) WebsiteStats(ctx context.Context, websiteID string, startAt, endAt int64) (Stats, error) {
	if c == nil || websiteID == "" {
		return Stats{}, nil
	}
	url := fmt.Sprintf("%s/websites/%s/stats?startAt=%d&endAt=%d", c.apiURL, websiteID, startAt, endAt)
	var out Stats
	if err := c.get(ctx, url, &out); err != nil {
		return Stats{}, err
	}
	return out, nil
}

// TopPages interroge /websites/{id}/metrics?type=url&startAt&endAt&limit.
func (c *Client) TopPages(ctx context.Context, websiteID string, startAt, endAt int64, limit int) ([]PageMetric, error) {
	if c == nil || websiteID == "" {
		return []PageMetric{}, nil
	}
	url := fmt.Sprintf("%s/websites/%s/metrics?type=url&startAt=%d&endAt=%d&limit=%d", c.apiURL, websiteID, startAt, endAt, limit)
	var out []PageMetric
	if err := c.get(ctx, url, &out); err != nil {
		return []PageMetric{}, err
	}
	return out, nil
}

// bearerToken retourne le token à utiliser : API key (cloud) si présente,
// sinon login self-hosted (cache 4h).
func (c *Client) bearerToken(ctx context.Context) (string, error) {
	if c.apiKey != "" {
		return c.apiKey, nil
	}
	if c.user == "" || c.pass == "" {
		return "", nil
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	if c.token != "" && time.Since(c.tokenTime) < 4*time.Hour {
		return c.token, nil
	}

	body, _ := json.Marshal(map[string]string{"username": c.user, "password": c.pass})
	resp, err := c.httpCli.Post(c.apiURL+"/auth/login", "application/json", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("umami login status %d", resp.StatusCode)
	}

	var out struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", err
	}
	c.token = out.Token
	c.tokenTime = time.Now()
	return c.token, nil
}

func (c *Client) get(ctx context.Context, url string, out any) error {
	token, err := c.bearerToken(ctx)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpCli.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("umami status %d", resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}
