// Traduction d'article — outil créateur (aperçu, premier lot).
//
// Aucune persistance : on rend un texte traduit que le créateur relit. Le
// stockage de versions traduites (et l'hreflang) demandera une migration.
package ai

import (
	"context"
	"strings"

	goai "github.com/qoefi/api/internal/ai"
)

// TargetLanguages : vocabulaire fermé (pas de code libre envoyé au modèle).
var TargetLanguages = map[string]string{
	"en": "anglais",
	"fr": "français",
	"es": "espagnol",
	"de": "allemand",
	"it": "italien",
	"pt": "portugais",
}

// NormalizeTarget renvoie le code de langue accepté ("" = inconnu).
func NormalizeTarget(target string) string {
	code := strings.ToLower(strings.TrimSpace(target))
	if _, ok := TargetLanguages[code]; ok {
		return code
	}
	return ""
}

// Translate traduit un texte vers la langue cible. Le provider est injecté :
// sans provider, ErrNoProvider (503 explicite côté route).
func (s *Service) Translate(ctx context.Context, text, target string) (string, error) {
	if s == nil || s.ac == nil {
		return "", goai.ErrNoProvider
	}
	language := TargetLanguages[target]
	if language == "" {
		return "", goai.ErrNoProvider
	}

	system := "Tu es un traducteur professionnel. Traduis le texte fourni en " + language +
		". Conserve le sens, le ton et la structure (titres, paragraphes, listes, liens). " +
		"Ne commente pas, n'ajoute rien : réponds uniquement avec la traduction. " +
		"Si le texte contient du HTML, renvoie du HTML de même structure."
	return s.ac.Generate(ctx, goai.Request{
		System:    system,
		User:      text,
		MaxTokens: 4000,
	})
}
