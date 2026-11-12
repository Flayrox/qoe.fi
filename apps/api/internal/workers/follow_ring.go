package workers

import (
	"context"
	"sort"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/abuse"
)

// FollowEdge représente un abonnement récent orienté (follower → suivi) entre comptes.
type FollowEdge struct {
	From string
	To   string
}

// FollowRingReport décrit une composante fermée suspecte de follows mutuels.
type FollowRingReport struct {
	Members     []string
	MutualEdges map[string]int
}

// DetectMutualFollowCliques identifie les groupes fermés d'abonnements mutuels :
// composantes connexes d'arêtes réciproques (u ↔ v) de taille >= minGroupSize
// dont au moins minMutualRatio des follows sortants récents restent à
// l'intérieur de la clique. Pur et déterministe.
func DetectMutualFollowCliques(edges []FollowEdge, minGroupSize int, minMutualRatio float64) []FollowRingReport {
	if minGroupSize < 3 || len(edges) == 0 {
		return nil
	}

	directed := make(map[string]map[string]bool)
	for _, e := range edges {
		if e.From == "" || e.To == "" || e.From == e.To {
			continue
		}
		if directed[e.From] == nil {
			directed[e.From] = make(map[string]bool)
		}
		directed[e.From][e.To] = true
	}

	// Construit le graphe non orienté des paires mutuelles u ↔ v.
	mutualAdj := make(map[string]map[string]bool)
	for u, out := range directed {
		for v := range out {
			if directed[v][u] {
				if mutualAdj[u] == nil {
					mutualAdj[u] = make(map[string]bool)
				}
				mutualAdj[u][v] = true
			}
		}
	}

	visited := make(map[string]bool, len(mutualAdj))
	var reports []FollowRingReport

	// Parcours ordonné pour un résultat 100 % déterministe.
	nodes := make([]string, 0, len(mutualAdj))
	for u := range mutualAdj {
		nodes = append(nodes, u)
	}
	sort.Strings(nodes)

	for _, start := range nodes {
		if visited[start] {
			continue
		}
		queue := []string{start}
		visited[start] = true
		compSet := make(map[string]bool)
		var comp []string

		for len(queue) > 0 {
			cur := queue[0]
			queue = queue[1:]
			compSet[cur] = true
			comp = append(comp, cur)
			for nxt := range mutualAdj[cur] {
				if !visited[nxt] {
					visited[nxt] = true
					queue = append(queue, nxt)
				}
			}
		}

		if len(comp) < minGroupSize {
			continue
		}

		// Mesure l'insularité : proportion d'abonnements sortants récents qui
		// restent à l'intérieur de la clique plutôt que vers le reste de la plateforme.
		totalOut := 0
		internalOut := 0
		mutualCount := make(map[string]int, len(comp))
		for _, m := range comp {
			for target := range directed[m] {
				totalOut++
				if compSet[target] {
					internalOut++
				}
			}
			for peer := range mutualAdj[m] {
				if compSet[peer] {
					mutualCount[m]++
				}
			}
		}
		if totalOut == 0 || float64(internalOut)/float64(totalOut) < minMutualRatio {
			continue
		}
		sort.Strings(comp)
		reports = append(reports, FollowRingReport{
			Members:     comp,
			MutualEdges: mutualCount,
		})
	}
	return reports
}

// AuditRecentFollowRings analyse la fenêtre des dernières 24 h d'abonnements
// pour remonter les cliques fermées de follow-farming vers internal/abuse
// (PolicyV3 → limit_distribution + file de modération apps/admin).
func AuditRecentFollowRings(ctx context.Context, pool *pgxpool.Pool, now time.Time) (int, error) {
	if pool == nil {
		return 0, nil
	}
	now = now.UTC()
	since := now.Add(-24 * time.Hour)

	rows, err := pool.Query(ctx, `
		SELECT f."readerId"::text, u.id::text
		FROM "Follows" f
		JOIN "User" u ON u."publisherId" = f."publisherId"
		JOIN "User" r ON r.id = f."readerId"
		WHERE f."createdAt" >= $1
		  AND f."readerId" <> u.id
		  AND NOT COALESCE(u."isShadowbanned", false)
		  AND NOT COALESCE(u."isSuspended", false)
		  AND NOT COALESCE(r."isShadowbanned", false)
		  AND NOT COALESCE(r."isSuspended", false)
		ORDER BY f."createdAt" DESC
		LIMIT 5000`, since)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	var edges []FollowEdge
	for rows.Next() {
		var from, to string
		if err := rows.Scan(&from, &to); err != nil {
			return 0, err
		}
		edges = append(edges, FollowEdge{From: from, To: to})
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}

	reports := DetectMutualFollowCliques(edges, 4, 0.70)
	if len(reports) == 0 {
		return 0, nil
	}

	flagged := 0
	var signals []abuse.Signal
	for _, rep := range reports {
		for _, memberID := range rep.Members {
			// Déduplication douce : ne pas ré-émettre si une décision ouverte ou
			// un signal récent (< 6 h) existe déjà pour ce compte.
			var recent bool
			_ = pool.QueryRow(ctx, `
				SELECT EXISTS (
					SELECT 1 FROM "AbuseSignal"
					WHERE type = $1 AND "subjectType" = $2 AND "subjectId" = $3
					  AND "observedAt" >= $4
				)`, abuse.SignalFollowRing, abuse.SubjectUser, memberID, now.Add(-6*time.Hour)).Scan(&recent)
			if recent {
				continue
			}

			n := rep.MutualEdges[memberID]
			if n < 3 {
				n = 3
			}
			for i := 0; i < n; i++ {
				signals = append(signals, abuse.Signal{
					Type:        abuse.SignalFollowRing,
					SubjectType: abuse.SubjectUser,
					SubjectID:   memberID,
					Source:      abuse.SourceWorkerFollowRing,
					Confidence:  abuse.ConfidenceObserved,
					Retention:   abuse.CoordinatedSignalRetention,
				})
			}
			flagged++
		}
	}
	if len(signals) > 0 {
		_ = abuse.Observe(ctx, pool, now, signals...)
	}
	return flagged, nil
}
