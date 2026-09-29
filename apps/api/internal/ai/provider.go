// Package ai — IA de lecture (fiche Plus P1 : résumé, explication).
//
// Doctrine (même que les e-mails) : provider PLUGGABLE, jamais en dur.
// Sans provider configuré → 503 explicite (jamais un faux résumé, jamais
// une erreur silencieuse). Quotas mensuels transparents AVANT l'appel
// (l'utilisateur sait où il en est) + plafond global anti-facture.
// Le résumé s'affiche TOUJOURS comme IA avec lien au texte original
// (fiche : pas de confusion avec l'éditorial).
package ai

import (
	"context"
	"errors"
	"os"
	"strings"
)

// ErrNoProvider : aucun provider IA configuré (503 côté route — honnête,
// pas de dégradation inventée).
var ErrNoProvider = errors.New("IA indisponible (aucun fournisseur configuré)")

// Request est une demande de génération (résumé ou explication).
type Request struct {
	// System guide le ton (concis, fidèle, sans invention).
	System string
	// User est le contenu (article ou extrait + contexte éventuel).
	User string
	// MaxTokens borne le coût par appel.
	MaxTokens int
}

// Provider génère du texte. Implémentations : Disabled (défaut, 503),
// OpenAICompatible (API type OpenAI /v1/chat/completions — à brancher avec
// une clé quand elle existera, cf. NewProvider).
type Provider interface {
	Generate(ctx context.Context, req Request) (string, error)
	Name() string
}

type disabledProvider struct{}

func (disabledProvider) Generate(context.Context, Request) (string, error) {
	return "", ErrNoProvider
}
func (disabledProvider) Name() string { return "disabled" }

// NewProvider construit le provider depuis l'environnement :
//   - AI_PROVIDER vide/absent → Disabled (503 explicite) ;
//   - AI_PROVIDER=openai-compatible + AI_API_KEY (+ AI_MODEL, AI_BASE_URL
//     optionnels) → OpenAICompatible.
//
// Même pattern que EMAIL_PROVIDER (absent = repli propre, jamais de panne).
func NewProvider() Provider {
	kind := strings.ToLower(strings.TrimSpace(os.Getenv("AI_PROVIDER")))
	if kind == "" || kind == "disabled" {
		return disabledProvider{}
	}
	key := strings.TrimSpace(os.Getenv("AI_API_KEY"))
	if key == "" {
		return disabledProvider{}
	}
	model := strings.TrimSpace(os.Getenv("AI_MODEL"))
	if model == "" {
		model = "gpt-4o-mini"
	}
	base := strings.TrimSpace(os.Getenv("AI_BASE_URL"))
	if base == "" {
		base = "https://api.openai.com/v1"
	}
	return &openAICompatible{key: key, model: model, base: strings.TrimSuffix(base, "/")}
}
