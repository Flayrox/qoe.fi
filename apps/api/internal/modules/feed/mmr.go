package feed

import "math"

// dupSim transforme une similarité brute en pénalité de redondance : 0 sous
// le seuil de quasi-duplicat (aucune pénalité), 1 à similarité parfaite.
//
// threshold est le seuil de « quasi-duplicat » : deux items dont la similarité
// cosinus est sous ce seuil (ex. deux pensées du même milieu, sim 0.6-0.8) ne
// se pénalisent PAS — ils restent ensemble dans la page. Au-dessus (deux
// vraies copies, sim 0.9+), la pénalité monte linéairement jusqu'à pleine à
// sim 1.0. C'est la variante « soft duplicate tax » du MMR : elle enlève la
// redondance sans jamais étaler la page hors du milieu de l'utilisateur
// (mesuré avec recsys-eval : le MMR classique faisait chuter la pureté du
// feed, ex. foot 62 % → 42 %). Le seuil est pilotable via SystemConfig
// (feed.mmr_dup_threshold).
func dupSim(sim, threshold float64) float64 {
	if sim <= threshold {
		return 0
	}
	return (sim - threshold) / (1 - threshold)
}

// mmrSelect applique la sélection par Maximal Marginal Relevance
// (Carbonell & Goldstein, 1998) — la technique de diversification sémantique
// utilisée par Elastic et Netflix dans leurs moteurs de recommandation.
//
// Le principe : on part de la liste des candidats déjà triés par score de
// pertinence, et on construit la page en retenant à chaque itération l'item
// qui maximise
//
//	λ·relevance(i) − (1−λ)·max_{j ∈ sélection} cosine(i, j)
//
// Autrement dit : un candidat très pertinent mais quasi identique à un item
// déjà retenu (même sujet, même auteur, même angle) perd des points ; un
// candidat un peu moins pertinent mais sémantiquement différent gagne sa
// place. C'est le remplaçant du plafond par-auteur, qui laissait passer deux
// pensées quasi identiques écrites par deux auteurs différents.
//	// `lambda` contrôle l'arbitrage : 1.0 = pertinence pure (pas de diversité),
	// 0.0 = diversité pure. Le défaut du moteur est 0.7 (pertinence dominante),
	// et la similarité passe par dupSim : sous `dupThreshold`, deux items ne se
	// pénalisent pas — seules les quasi-copies sont écartées.
	//
	// Les embeddings manquants (map absente ou vecteur vide) sont traités comme
	// orthogonaux (similarité 0) : la sélection retombe alors sur l'ordre de
	// pertinence pur — un repli sûr, jamais de blocage du feed.
	//
	// Retourne les ids retenus dans l'ordre de sélection (≤ maxItems), le premier
	// étant l'item le plus pertinent (aucun item n'est encore sélectionné, la
	// pénalité de redondance est nulle).
func mmrSelect(ids []string, scores map[string]float64, embs map[string][]float32, maxItems int, lambda, dupThreshold float64) []string {
	if maxItems <= 0 || len(ids) == 0 {
		return nil
	}
	if maxItems > len(ids) {
		maxItems = len(ids)
	}
	selected := make([]string, 0, maxItems)
	remaining := append([]string(nil), ids...)
	for len(selected) < maxItems && len(remaining) > 0 {
		bestIdx, bestScore := -1, math.Inf(-1)
		for i, id := range remaining {
			// Pertinence marginale = pertinence de l'item, pénalisée par sa
			// ressemblance maximale avec les items déjà retenus dans la page.
			marginal := scores[id]
			if lambda < 1 {
				var maxDup float64 // pénalité de redondance max face à la sélection
				for _, s := range selected {
					if d := dupSim(cosine(embs[id], embs[s]), dupThreshold); d > maxDup {
						maxDup = d
					}
				}
				marginal = lambda*marginal + (1-lambda)*(1-maxDup)
			}
			if marginal > bestScore {
				bestScore, bestIdx = marginal, i
			}
		}
		if bestIdx < 0 {
			break
		}
		selected = append(selected, remaining[bestIdx])
		remaining = append(remaining[:bestIdx], remaining[bestIdx+1:]...)
	}
	return selected
}

// cosine calcule la similarité cosinus entre deux vecteurs d'embeddings.
// Deux vecteurs absents, de longueurs différentes ou nuls → 0 : on ne connaît
// aucune ressemblance, donc aucune pénalité de redondance (comportement sûr
// pour le MMR, qui retombe sur la pertinence pure).
func cosine(a, b []float32) float64 {
	if len(a) == 0 || len(b) == 0 || len(a) != len(b) {
		return 0
	}
	var dot, na, nb float64
	for i := range a {
		dot += float64(a[i]) * float64(b[i])
		na += float64(a[i]) * float64(a[i])
		nb += float64(b[i]) * float64(b[i])
	}
	if na == 0 || nb == 0 {
		return 0
	}
	return dot / (math.Sqrt(na) * math.Sqrt(nb))
}
