package billing

import (
	"errors"
	"fmt"
	"strings"
)

// ErrPriceMismatch : le tarif Stripe ne débite pas ce que la formule affiche.
var ErrPriceMismatch = errors.New("tarif Stripe incohérent")

// ErrPriceUnverified : impossible de relire le tarif (absent, clé refusée,
// réseau). On refuse d'enregistrer plutôt que de faire confiance à l'ID saisi.
var ErrPriceUnverified = errors.New("tarif Stripe non vérifiable")

// plateformeCurrency : devise unique de la plateforme (les formules n'ont pas
// de colonne devise, tout est affiché en euros).
const platformCurrency = "eur"

// TierPriceCheck décrit ce qu'un tarif Stripe doit respecter pour une formule.
type TierPriceCheck struct {
	Cents    int
	Interval string // "month" | "year"
}

// ValidatePrice vérifie qu'un tarif Stripe débite EXACTEMENT le montant
// affiché, dans la bonne devise, à la bonne cadence et qu'il est encore
// actif. C'est la garde qui empêche d'afficher 5 € et d'en débiter 50.
func ValidatePrice(p Price, check TierPriceCheck) error {
	if strings.TrimSpace(p.ID) == "" {
		return fmt.Errorf("%w : tarif sans identifiant", ErrPriceMismatch)
	}
	if !p.Active {
		return fmt.Errorf("%w : tarif archivé", ErrPriceMismatch)
	}
	if !strings.EqualFold(p.Currency, platformCurrency) {
		return fmt.Errorf("%w : devise %q, attendu %s", ErrPriceMismatch, p.Currency, platformCurrency)
	}
	if check.Cents <= 0 {
		return fmt.Errorf("%w : montant affiché invalide", ErrPriceMismatch)
	}
	if p.UnitAmount == nil || *p.UnitAmount != check.Cents {
		got := "null"
		if p.UnitAmount != nil {
			got = fmt.Sprintf("%d", *p.UnitAmount)
		}
		return fmt.Errorf("%w : le tarif débite %s centimes, la formule affiche %d",
			ErrPriceMismatch, got, check.Cents)
	}
	if p.Recurring == nil {
		return fmt.Errorf("%w : tarif non récurrent", ErrPriceMismatch)
	}
	if p.Recurring.Interval != check.Interval {
		return fmt.Errorf("%w : cadence %q, attendu %q",
			ErrPriceMismatch, p.Recurring.Interval, check.Interval)
	}
	if p.Recurring.IntervalCount > 1 {
		return fmt.Errorf("%w : un tarif tous les %d %s n'est pas mensuel/annuel",
			ErrPriceMismatch, p.Recurring.IntervalCount, check.Interval)
	}
	return nil
}
