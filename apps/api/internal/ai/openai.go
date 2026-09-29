package ai

// Provider OpenAI-compatible (POST {base}/chat/completions) : OpenAI,
// Mistral, llama.cpp avec serveur chat, ou tout clone d'API. Timeouts
// courts (l'IA ne bloque jamais longtemps une requête), erreurs propagées
// telles quelles (le front distingue 429/5xx du provider des nôtres).

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

type openAICompatible struct {
	key    string
	model  string
	base   string
	client *http.Client
}

func (p *openAICompatible) Name() string { return "openai-compatible:" + p.model }

func (p *openAICompatible) Generate(ctx context.Context, req Request) (string, error) {
	maxTokens := req.MaxTokens
	if maxTokens <= 0 || maxTokens > 2000 {
		maxTokens = 500
	}
	payload, err := json.Marshal(map[string]any{
		"model": p.model,
		"messages": []map[string]string{
			{"role": "system", "content": req.System},
			{"role": "user", "content": req.User},
		},
		"max_tokens":  maxTokens,
		"temperature": 0.2,
	})
	if err != nil {
		return "", err
	}
	ctxTimeout, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	httpReq, err := http.NewRequestWithContext(ctxTimeout, http.MethodPost, p.base+"/chat/completions", bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+p.key)
	client := p.client
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(httpReq)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", err
	}
	if resp.StatusCode == http.StatusTooManyRequests {
		return "", fmt.Errorf("fournisseur IA saturé (429) : %w", errProviderRateLimited)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("fournisseur IA (%d) : %s", resp.StatusCode, truncate(string(body), 300))
	}
	var parsed struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return "", err
	}
	if len(parsed.Choices) == 0 {
		return "", fmt.Errorf("fournisseur IA : réponse vide")
	}
	return parsed.Choices[0].Message.Content, nil
}

var errProviderRateLimited = errors.New("rate limited")

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
