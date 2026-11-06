package admin

// Le lien de retrait d'un lancement de feature est signé HMAC et ne contient
// jamais l'email. Le worker ne construit pas la signature lui-même : il demande
// au service, qui détient le secret, une URL déjà scellée.

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"
	"os"
	"strings"
)

var errFeatureUnsubUnavailable = errors.New("secret de désabonnement feature absent")

func (s *Service) SetFeatureUnsubscribeSecret(secret string) {
	s.featureUnsubSecret = strings.TrimSpace(secret)
}

// FeatureUnsubscribeURL retourne le lien public de retrait pour un intérêt.
func (s *Service) FeatureUnsubscribeURL(interestID string) (string, error) {
	if s.featureUnsubSecret == "" || strings.TrimSpace(interestID) == "" {
		return "", errFeatureUnsubUnavailable
	}
	mac := hmac.New(sha256.New, []byte(s.featureUnsubSecret))
	mac.Write([]byte(interestID))
	token := base64.RawURLEncoding.EncodeToString([]byte(interestID)) + "." + hex.EncodeToString(mac.Sum(nil))
	base := strings.TrimSpace(os.Getenv("QOE_CONFIRM_BASE_URL"))
	if base == "" {
		base = "https://api.qoe.fi"
	}
	return fmt.Sprintf("%s/v1/features/unsubscribe?token=%s", strings.TrimRight(base, "/"), url.QueryEscape(token)), nil
}
