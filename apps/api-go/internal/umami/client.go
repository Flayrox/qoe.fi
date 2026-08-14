// Package umami — client minimal de l'API Umami pour le proxy /v1/analytics/stats.
package umami

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
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
	apiURL  string
	apiKey  string
	httpCli *http.Client
}

func NewClient(apiURL, apiKey string) *Client {
	return &Client{
		apiURL:  apiURL,
		apiKey:  apiKey,
		httpCli: &http.Client{Timeout: 10 * time.Second},
	}
}

// WebsiteStats interroge /websites/{id}/stats?startAt&endAt.
func (c *Client) WebsiteStats(ctx context.Context, websiteID string, startAt, endAt int64) (Stats, error) {
	if c == nil || websiteID == "" || c.apiKey == "" {
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
	if c == nil || websiteID == "" || c.apiKey == "" {
		return []PageMetric{}, nil
	}
	url := fmt.Sprintf("%s/websites/%s/metrics?type=url&startAt=%d&endAt=%d&limit=%d", c.apiURL, websiteID, startAt, endAt, limit)
	var out []PageMetric
	if err := c.get(ctx, url, &out); err != nil {
		return []PageMetric{}, err
	}
	return out, nil
}

func (c *Client) get(ctx context.Context, url string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
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
