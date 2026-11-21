package feed

import (
	"math"
	"strings"
)

// computeCircadianFit calcule le fit gaussien de la durée de lecture par rapport
// à la cible du créneau circadien courant.
func computeCircadianFit(readingTimeMinutes, targetMinutes, sigma float64) float64 {
	diff := readingTimeMinutes - targetMinutes
	return math.Exp(-(diff * diff) / (2 * sigma * sigma))
}

// blendThoughtRatio recalibre le ratio pensées circadien de base avec le
// penchant réel de lecture de l'utilisateur (getThoughtPreference). L'affinité
// est centrée sur 0.5 (neutre) : un lecteur de long-format (affinité ~0) baisse
// la part pensées, un butineur de formats courts (affinité ~1) la monte.
func blendThoughtRatio(circadianThoughtRatio, thoughtPref, k, floor, ceil float64) float64 {
	shifted := circadianThoughtRatio + k*(thoughtPref-0.5)
	if shifted < floor {
		shifted = floor
	}
	if shifted > ceil {
		shifted = ceil
	}
	return shifted
}

// pickExplorationRatio choisit le taux d'exploration selon la maturité du
// profil : un utilisateur froid (signaux < minSignals) explore davantage car
// son vecteur ne permet pas encore de personnaliser finement ; un profil
// mature explore moins pour ne pas diluer sa bulle.
func pickExplorationRatio(signals int, coldRatio, warmRatio float64, minSignals int) float64 {
	if signals < minSignals {
		return coldRatio
	}
	return warmRatio
}

// mutedOK retourne false si text contient un mot masqué.
//
// Parité stricte avec la fonction SQL `contains_muted_word`
// (migration 00079) : comparaison insensible à la casse des DEUX côtés
// (`lower(text) LIKE '%' || lower(word) || '%'`). Les mots sont stockés tels
// que saisis : ne jamais comparer à la forme brute, sinon « Politique » ne
// filtre que côté SQL. Un mot vide est ignoré (sinon il masquerait tout).
func mutedOK(text string, muted []string) bool {
	if len(muted) == 0 {
		return true
	}
	low := strings.ToLower(text)
	for _, w := range muted {
		w = strings.ToLower(strings.TrimSpace(w))
		if w != "" && strings.Contains(low, w) {
			return false
		}
	}
	return true
}

// hasPenalizedTag indique si un candidat porte au moins un tag rejeté.
func hasPenalizedTag(tags []string, penalized map[string]bool) bool {
	if len(penalized) == 0 {
		return false
	}
	for _, t := range tags {
		if penalized[t] {
			return true
		}
	}
	return false
}

// articleScores extrait la map id → score de pertinence après rerank (pour MMR).
func articleScores(as []articleCandidate) map[string]float64 {
	m := make(map[string]float64, len(as))
	for _, a := range as {
		m[a.id] = a.score
	}
	return m
}

// thoughtScores extrait la map id → score de pertinence après rerank (pour MMR).
func thoughtScores(ts []thoughtCandidate) map[string]float64 {
	m := make(map[string]float64, len(ts))
	for _, t := range ts {
		m[t.id] = t.score
	}
	return m
}

func articleIDs(as []articleCandidate) []string {
	ids := make([]string, 0, len(as))
	for _, a := range as {
		ids = append(ids, a.id)
	}
	return ids
}

func thoughtIDs(ts []thoughtCandidate) []string {
	ids := make([]string, 0, len(ts))
	for _, t := range ts {
		ids = append(ids, t.id)
	}
	return ids
}

// pickArticles réordonne les candidats dans l'ordre de sélection du MMR.
func pickArticles(as []articleCandidate, ids []string) []articleCandidate {
	byID := make(map[string]articleCandidate, len(as))
	for _, a := range as {
		byID[a.id] = a
	}
	out := make([]articleCandidate, 0, len(ids))
	for _, id := range ids {
		if a, ok := byID[id]; ok {
			out = append(out, a)
		}
	}
	return out
}

// pickThoughts réordonne les candidats dans l'ordre de sélection du MMR.
func pickThoughts(ts []thoughtCandidate, ids []string) []thoughtCandidate {
	byID := make(map[string]thoughtCandidate, len(ts))
	for _, t := range ts {
		byID[t.id] = t
	}
	out := make([]thoughtCandidate, 0, len(ids))
	for _, id := range ids {
		if t, ok := byID[id]; ok {
			out = append(out, t)
		}
	}
	return out
}

// interleaveEngine mélange articles/pensées selon le mode circadien.
func interleaveEngine(a, t []EngineItem, circadianName string) []EngineItem {
	var out []EngineItem
	aI, tI := 0, 0
	if circadianName == "MORNING_BRIEF" {
		// Matin : 1 pensée, 1 article court, 1 pensée...
		for aI < len(a) || tI < len(t) {
			if tI < len(t) {
				out = append(out, t[tI])
				tI++
			}
			if aI < len(a) {
				out = append(out, a[aI])
				aI++
			}
		}
		return out
	}
	// Jour / soir : 2 articles de fond, 1 pensée.
	for aI < len(a) || tI < len(t) {
		if aI < len(a) {
			out = append(out, a[aI])
			aI++
		}
		if aI < len(a) {
			out = append(out, a[aI])
			aI++
		}
		if tI < len(t) {
			out = append(out, t[tI])
			tI++
		}
	}
	return out
}
