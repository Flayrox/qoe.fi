package admin

// Le lien de retrait d'un lancement de feature est signé HMAC et ne contient
// jamais l'email. Le worker ne construit pas la signature lui-même : il demande
// au service, qui détient le secret, une URL déjà scellée. La signature et la
// racine publique sont celles du module features : deux implémentations du même
// jeton divergent à la première retouche et cassent les liens déjà envoyés.

import (
	"errors"
	"strings"

	"github.com/qoefi/api/internal/modules/features"
)

var errFeatureUnsubUnavailable = errors.New("secret de désabonnement feature absent")

func (s *Service) SetFeatureUnsubscribeSecret(secret string) {
	s.featureUnsubSecret = strings.TrimSpace(secret)
}

// FeatureUnsubscribeURL retourne le lien public de retrait pour un intérêt.
func (s *Service) FeatureUnsubscribeURL(interestID string) (string, error) {
	link, err := features.UnsubscribeLink(s.featureUnsubSecret, interestID)
	if err != nil {
		return "", errFeatureUnsubUnavailable
	}
	return link, nil
}
