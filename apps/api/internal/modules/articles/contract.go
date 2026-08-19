// Package articles — contrat API créateurs (parité Hono, zero-leak paywall).
//
// Ce fichier définit la forme de sortie du CONTRAT CRÉATEURS (voir
// docs/openapi/creators-api.yaml) : l'enveloppe `{data, pagination}` et les
// items `contentHtml` tronqués, tels que servis historiquement par l'API Hono
// (apps/api) — verrouillés par golden tests (contract_test.go).
package articles

import "strconv"

// CreatorCategory est la catégorie embarquée dans un item créateur.
type CreatorCategory struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Slug        string  `json:"slug"`
	Description *string `json:"description"`
}

// CreatorItem est un article du contrat créateurs : contenu tronqué
// (`contentHtml`), jamais de contenu payant au-delà du marqueur (zéro-fuite).
type CreatorItem struct {
	ID          string           `json:"id"`
	Title       string           `json:"title"`
	Slug        string           `json:"slug"`
	ContentHTML string           `json:"contentHtml"`
	IsTruncated bool             `json:"isTruncated"`
	Visibility  string           `json:"visibility"`
	ReadingTime int              `json:"readingTime"`
	IsPremium   bool             `json:"isPremium"`
	CreatedAt   string           `json:"createdAt"`
	UpdatedAt   string           `json:"updatedAt"`
	Category    *CreatorCategory `json:"category"`
	PaywallMeta *PaywallMeta     `json:"paywallMeta"`
}

// Pagination est l'enveloppe de pagination du contrat (page 1-based).
type Pagination struct {
	Total int `json:"total"`
	Page  int `json:"page"`
	Limit int `json:"limit"`
	Pages int `json:"pages"`
}

// CreatorListResponse est l'enveloppe de liste du contrat créateurs
// (`{ data: [...], pagination: {...} }`).
type CreatorListResponse struct {
	Data       []CreatorItem `json:"data"`
	Pagination Pagination    `json:"pagination"`
}

// ToCreatorItem convertit une réponse interne en item du contrat créateurs.
// Le contenu est utilisé tel quel — il doit déjà être tronqué par
// SliceContentAtPaywall (zéro-fuite), jamais servi brut.
func ToCreatorItem(a ArticleResponse, cat *CreatorCategory) CreatorItem {
	return CreatorItem{
		ID:          a.ID,
		Title:       a.Title,
		Slug:        a.Slug,
		ContentHTML: a.Content,
		IsTruncated: a.IsTruncated,
		Visibility:  a.Visibility,
		ReadingTime: a.ReadingTime,
		IsPremium:   a.IsPremium,
		CreatedAt:   a.CreatedAt,
		UpdatedAt:   a.UpdatedAt,
		Category:    cat,
		PaywallMeta: a.PaywallMeta,
	}
}

// ToCreatorList construit l'enveloppe paginée du contrat créateurs.
func ToCreatorList(items []CreatorItem, total, page, limit int) CreatorListResponse {
	pages := 0
	if limit > 0 {
		pages = (total + limit - 1) / limit
	}
	return CreatorListResponse{
		Data:       items,
		Pagination: Pagination{Total: total, Page: page, Limit: limit, Pages: pages},
	}
}

// PageToOffset convertit la pagination Hono (page 1-based, défaut 1) en
// offset 0-based pour les requêtes Go.
func PageToOffset(page, limit int) int {
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = 1
	}
	return (page - 1) * limit
}

// ParsePageLimit parse les paramètres de pagination du contrat créateurs :
// `page` 1-based (défaut 1), `limit` borné à [1, 100] (défaut 10 — Hono).
func ParsePageLimit(pageStr, limitStr string) (page, limit int) {
	page = 1
	if v, err := strconv.Atoi(pageStr); err == nil && v > 0 {
		page = v
	}
	limit = 10
	if v, err := strconv.Atoi(limitStr); err == nil && v > 0 {
		limit = v
	}
	if limit > 100 {
		limit = 100
	}
	return page, limit
}
