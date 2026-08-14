// Package articles — module articles + troncature paywall (zero-leak).
package articles

import "strings"

// Visibilités (miroir de l'enum ContentVisibility).
const (
	VisPublic          = "PUBLIC"
	VisMembersOnly     = "MEMBERS_ONLY"
	VisPaidSubscribers = "PAID_SUBSCRIBERS"
	VisTierSpecific    = "TIER_SPECIFIC"
)

// UserEntitlements décrit les droits du lecteur (miroir TS).
type UserEntitlements struct {
	IsMember         bool
	IsPaidSubscriber bool
	TierID           *string
}

// PaywallMeta décrit la coupure appliquée.
type PaywallMeta struct {
	Visibility            string  `json:"visibility"`
	TeaserParagraphsCount int     `json:"teaserParagraphsCount"`
	RequiredTierID        *string `json:"requiredTierId"`
	TotalLengthBytes      int     `json:"totalLengthBytes"`
	PreviewLengthBytes    int     `json:"previewLengthBytes"`
}

// PaywallCutResult est le résultat de la troncature.
type PaywallCutResult struct {
	Content       string       `json:"content"`
	IsTruncated   bool         `json:"isTruncated"`
	AccessGranted bool         `json:"accessGranted"`
	PaywallMeta   *PaywallMeta `json:"paywallMeta"`
}

// Marqueurs de coupure des différents éditeurs (Ghost, Lexical, TipTap…).
var paywallMarkers = []string{
	"<!--members-only-->",
	"<!--paywall-->",
	"<!--kg-gated-block:begin-->",
	"<!--qoe-paywall-->",
	`data-node-type="paywall"`,
	`data-node-type="paywall-divider"`,
	`data-type="paywall-divider"`,
	`class="qoe-paywall-divider"`,
	`class="paywall-divider"`,
}

// CheckContentAccess vérifie si les droits du lecteur suffisent.
func CheckContentAccess(visibility string, e UserEntitlements, requiredTierID *string) bool {
	switch visibility {
	case VisPublic, "":
		return true
	case VisMembersOnly:
		return e.IsMember || e.IsPaidSubscriber
	case VisPaidSubscribers:
		return e.IsPaidSubscriber
	case VisTierSpecific:
		if !e.IsPaidSubscriber {
			return false
		}
		if requiredTierID == nil {
			return true
		}
		return e.TierID != nil && *e.TierID == *requiredTierID
	}
	return true
}

// SliceContentAtPaywall applique la troncature (miroir TS) : jamais de contenu
// payant au-delà du marqueur transmis au lecteur non autorisé.
func SliceContentAtPaywall(rawContent string, e UserEntitlements, visibility string, requiredTierID *string) PaywallCutResult {
	totalBytes := len(rawContent)
	access := CheckContentAccess(visibility, e, requiredTierID)

	if access || rawContent == "" {
		return PaywallCutResult{Content: rawContent, AccessGranted: true}
	}

	// Cherche le premier marqueur.
	paywallIndex := -1
	for _, marker := range paywallMarkers {
		if idx := strings.Index(rawContent, marker); idx != -1 && (paywallIndex == -1 || idx < paywallIndex) {
			paywallIndex = idx
		}
	}

	var preview string
	teaserCount := 0

	if paywallIndex != -1 {
		preview = strings.TrimSpace(rawContent[:paywallIndex])
		teaserCount = strings.Count(preview, "</p>")
		if teaserCount == 0 {
			teaserCount = 1
		}
	} else {
		// Fallback : 2 premiers paragraphes, sinon 1, sinon 500 chars.
		closings := paragraphIndexes(rawContent)
		if len(closings) >= 2 {
			preview = strings.TrimSpace(rawContent[:closings[1]+4])
			teaserCount = 2
		} else if len(closings) == 1 {
			preview = strings.TrimSpace(rawContent[:closings[0]+4])
			teaserCount = 1
		} else {
			cut := len(rawContent)
			if cut > 500 {
				cut = 500
			}
			preview = strings.TrimSpace(rawContent[:cut])
			teaserCount = 1
		}
	}

	return PaywallCutResult{
		Content:       preview,
		IsTruncated:   true,
		AccessGranted: false,
		PaywallMeta: &PaywallMeta{
			Visibility:            visibility,
			TeaserParagraphsCount: teaserCount,
			RequiredTierID:        requiredTierID,
			TotalLengthBytes:      totalBytes,
			PreviewLengthBytes:    len(preview),
		},
	}
}

// paragraphIndexes retourne les positions des fermetures </p>.
func paragraphIndexes(s string) []int {
	var out []int
	offset := 0
	for {
		idx := strings.Index(s[offset:], "</p>")
		if idx == -1 {
			return out
		}
		abs := offset + idx
		out = append(out, abs)
		offset = abs + 4
	}
}
