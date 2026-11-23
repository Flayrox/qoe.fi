package settings

import (
	"context"

	"github.com/jackc/pgx/v5"
)

// PublisherSettingsPatch est la mise à jour partielle de la page settings.
// Les clés absentes restent inchangées (PATCH, jamais PUT) : omettre
// `navigation` ne supprime pas la navigation.
type PublisherSettingsPatch struct {
	PublisherID string            `json:"publisherId"`
	Profile     map[string]any    `json:"profile"`
	Subdomain   *string           `json:"subdomain"`
	Navigation  *[]NavigationLink `json:"navigation"`
	SocialLinks *[]SocialLink     `json:"socialLinks"`
}

// UpdatePublisherSettings applique profil, sous-domaine, navigation et réseaux
// sociaux dans **une** transaction, puis renvoie l'état canonique relu en base.
//
// Avant, la page settings enchaînait quatre appels HTTP indépendants : un échec
// au troisième laissait les deux premiers acquis, et le client reconstruisait
// péniblement un état qu'il croyait enregistré. Ici, tout ou rien, et la
// réponse est la lecture de ce que la base contient réellement — compteur
// d'abonnés compris.
func (s *Service) UpdatePublisherSettings(ctx context.Context, userID string, in PublisherSettingsPatch) (*SettingsPublisher, error) {
	if err := s.authorizeSettings(ctx, userID, in.PublisherID); err != nil {
		return nil, errForbidden
	}

	// Toute la validation passe avant l'ouverture de la transaction : une
	// erreur de saisie ne doit jamais écrire quoi que ce soit.
	fields, onboarding, err := buildProfileFields(in.Profile)
	if err != nil {
		return nil, err
	}
	if onboarding != nil {
		// Le texte d'onboarding appartient au compte, pas à la publication :
		// il garde son endpoint dédié plutôt que de créer deux vérités.
		return nil, invalid("onboardingText n'est pas modifiable depuis la page settings")
	}
	if len(fields) == 0 && in.Subdomain == nil && in.Navigation == nil && in.SocialLinks == nil {
		return nil, invalid("Aucun champ à mettre à jour")
	}

	var cleanSubdomain string
	if in.Subdomain != nil {
		cleanSubdomain, err = normalizeSubdomainInput(*in.Subdomain)
		if err != nil {
			return nil, err
		}
		if cleanSubdomain != "" {
			if err := s.assertSubdomainAllowed(ctx, cleanSubdomain); err != nil {
				return nil, err
			}
		}
	}

	var navigation []NavigationLink
	if in.Navigation != nil {
		// Copie : la validation normalise les libellés en place et l'appelant
		// garde son payload intact.
		navigation = append([]NavigationLink(nil), (*in.Navigation)...)
		if err := validateNavigationLinks(navigation); err != nil {
			return nil, err
		}
	}

	var socialLinks []SocialLink
	if in.SocialLinks != nil {
		socialLinks = append([]SocialLink(nil), (*in.SocialLinks)...)
		if err := validateSocialLinks(socialLinks); err != nil {
			return nil, err
		}
	}

	var out *SettingsPublisher
	err = s.withTx(ctx, func(tx pgx.Tx) error {
		q := s.qtx(tx)
		if len(fields) > 0 {
			if err := s.updatePublisherTx(ctx, tx, in.PublisherID, fields); err != nil {
				return err
			}
		}
		if in.Subdomain != nil {
			if err := writeSubdomainTx(ctx, q, in.PublisherID, cleanSubdomain); err != nil {
				return err
			}
		}
		if in.Navigation != nil {
			if err := replaceNavigationTx(ctx, q, in.PublisherID, navigation); err != nil {
				return err
			}
		}
		if in.SocialLinks != nil {
			if err := replaceSocialTx(ctx, q, in.PublisherID, socialLinks); err != nil {
				return err
			}
		}
		// Relecture dans la transaction : la réponse décrit l'état validé, pas
		// la requête reçue. Un `ROLLBACK` ne peut donc jamais renvoyer un état
		// qui n'existe pas.
		canonical, err := s.readPublisherSettings(ctx, q, in.PublisherID)
		if err != nil {
			return err
		}
		out = canonical
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}
