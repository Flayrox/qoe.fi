package users

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"
)

type goTrueClient struct {
	baseURL string
	secret  string
	http    *http.Client
}

func newGoTrueClient(baseURL, serviceRoleKey string) *goTrueClient {
	return &goTrueClient{
		baseURL: strings.TrimSuffix(baseURL, "/"),
		secret:  serviceRoleKey,
		http:    &http.Client{Timeout: 8 * time.Second},
	}
}

func (c *goTrueClient) request(ctx context.Context, userID, method, path string, payload map[string]any) (map[string]any, error) {
	_ = userID
	if c.baseURL == "" || c.secret == "" {
		return nil, errors.New("fournisseur d'identité non configuré")
	}
	var body *bytes.Reader
	if payload == nil {
		body = bytes.NewReader(nil)
	} else {
		raw, err := json.Marshal(payload)
		if err != nil {
			return nil, err
		}
		body = bytes.NewReader(raw)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("apikey", c.secret)
	req.Header.Set("Authorization", "Bearer "+c.secret)
	res, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	var out map[string]any
	_ = json.NewDecoder(res.Body).Decode(&out)
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, errors.New(identityErrorMessage(res.StatusCode, out))
	}
	return out, nil
}

func (c *goTrueClient) requestWithAuthorization(ctx context.Context, userID, authorization, method, path string, payload map[string]any) (map[string]any, error) {
	_ = userID
	if strings.TrimSpace(authorization) == "" {
		return nil, errors.New("session d'identité manquante")
	}
	var body *bytes.Reader
	if payload == nil {
		body = bytes.NewReader(nil)
	} else {
		raw, err := json.Marshal(payload)
		if err != nil {
			return nil, err
		}
		body = bytes.NewReader(raw)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("apikey", c.secret)
	req.Header.Set("Authorization", authorization)
	res, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	var out map[string]any
	_ = json.NewDecoder(res.Body).Decode(&out)
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, errors.New(identityErrorMessage(res.StatusCode, out))
	}
	return out, nil
}

// identityErrorMessage extrait le message exploitable d'une réponse d'erreur du
// fournisseur d'identité. Sans cela, l'utilisateur ne voyait qu'un code de
// statut (par exemple « statut 422 ») au lieu de la raison réelle — nom de
// facteur déjà pris, code expiré, facteur déjà vérifié…
func identityErrorMessage(status int, out map[string]any) string {
	message := ""
	for _, key := range []string{"msg", "message", "error_description", "error"} {
		if value, ok := out[key].(string); ok && strings.TrimSpace(value) != "" {
			message = strings.TrimSpace(value)
			break
		}
	}
	if message == "" {
		return fmt.Sprintf("fournisseur d'identité: statut %d", status)
	}
	return fmt.Sprintf("fournisseur d'identité: %s", message)
}

// getUser lit un utilisateur via l'API admin GoTrue (service role) : adresse
// actuelle et `email_confirmed_at`. Utilisé pour ne migrer des abonnements
// vers une nouvelle adresse qu'une fois celle-ci confirmée (fiche 01 §4).
func (c *goTrueClient) getUser(ctx context.Context, userID string) (map[string]any, error) {
	return c.request(ctx, userID, http.MethodGet, "/auth/v1/admin/users/"+userID, nil)
}

func (c *goTrueClient) verifyPassword(ctx context.Context, email, password string) error {
	if c.baseURL == "" || c.secret == "" {
		return errors.New("fournisseur d'identité non configuré")
	}
	body, err := json.Marshal(map[string]string{"email": email, "password": password})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/auth/v1/token?grant_type=password", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("apikey", c.secret)
	res, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return errors.New("réauthentification refusée")
	}
	return nil
}

func (c *goTrueClient) updateUser(ctx context.Context, userID string, payload map[string]any) error {
	if c.baseURL == "" || c.secret == "" {
		return errors.New("fournisseur d'identité non configuré")
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, c.baseURL+"/auth/v1/admin/users/"+userID, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("apikey", c.secret)
	req.Header.Set("Authorization", "Bearer "+c.secret)
	res, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("fournisseur d'identité: statut %d", res.StatusCode)
	}
	return nil
}
