package media

import (
	"errors"
	"fmt"
	"log"
	"net/http"

	"github.com/qoefi/api/internal/response"
)

// ValidationError signale une entrée refusée (400) avec un message destiné au
// client. Sans ce type, le handler ne peut pas distinguer un refus métier d'une
// panne et répondait 400 avec le texte du driver à toute erreur interne.
type ValidationError struct {
	Message string
}

func (e *ValidationError) Error() string { return e.Message }

// invalid construit une ValidationError.
func invalid(format string, args ...any) error {
	if len(args) == 0 {
		return &ValidationError{Message: format}
	}
	return &ValidationError{Message: fmt.Sprintf(format, args...)}
}

// PolicyError est un refus explicite (403) dont le message est public : rôle
// réservé, transfert de propriété indisponible…
type PolicyError struct {
	Message string
}

func (e *PolicyError) Error() string { return e.Message }

func policy(format string, args ...any) error {
	if len(args) == 0 {
		return &PolicyError{Message: format}
	}
	return &PolicyError{Message: fmt.Sprintf(format, args...)}
}

// errUnauthenticated : handler atteint sans identité dans le contexte.
var errUnauthenticated = errors.New("authentification requise")

// logServerError trace une erreur interne côté serveur uniquement.
func logServerError(err error) { log.Printf("[media] %v", err) }

// writeErr traduit une erreur du service en réponse HTTP : refus explicite en
// 403, introuvable en 404, entrée refusée en 400, conflit en 409, et **toute
// autre erreur en 500** (détail uniquement dans les logs). Avant, le `default`
// répondait 400 avec `err.Error()` : une panne de base s'affichait comme une
// erreur de formulaire et exposait le message du driver.
func writeErr(w http.ResponseWriter, err error) {
	var invalidErr *ValidationError
	var policyErr *PolicyError
	switch {
	case errors.Is(err, ErrInvalidScopes):
		response.Error(w, http.StatusUnprocessableEntity, "scopes invalides")
	case errors.Is(err, errForbidden):
		response.Forbidden(w, "Permission insuffisante")
	case errors.Is(err, errNotFound):
		response.NotFound(w, "Ressource introuvable")
	case errors.Is(err, errAlreadyMember):
		response.Error(w, http.StatusConflict, "Déjà membre actif de ce média")
	case errors.Is(err, errUnauthenticated):
		response.Unauthorized(w, "Authentification requise")
	case errors.As(err, &invalidErr):
		response.BadRequest(w, invalidErr.Message)
	case errors.As(err, &policyErr):
		response.Forbidden(w, policyErr.Message)
	default:
		logServerError(err)
		response.Internal(w)
	}
}
