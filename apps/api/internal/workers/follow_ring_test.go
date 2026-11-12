package workers

import (
	"context"
	"testing"
	"time"
)

func TestDetectMutualFollowCliques_FindsClosedBotRing(t *testing.T) {
	// Clique de 4 bots qui se suivent tous mutuellement (100 % insulaire).
	bots := []string{"b1", "b2", "b3", "b4"}
	var edges []FollowEdge
	for _, u := range bots {
		for _, v := range bots {
			if u != v {
				edges = append(edges, FollowEdge{From: u, To: v})
			}
		}
	}
	// Ajout d'utilisateurs légitimes qui suivent un créateur populaire sans réciprocité.
	edges = append(edges,
		FollowEdge{From: "legit1", To: "creator"},
		FollowEdge{From: "legit2", To: "creator"},
		FollowEdge{From: "legit3", To: "creator"},
		FollowEdge{From: "legit4", To: "creator"},
	)

	reports := DetectMutualFollowCliques(edges, 4, 0.70)
	if len(reports) != 1 {
		t.Fatalf("attendu 1 clique, obtenu %d", len(reports))
	}
	if len(reports[0].Members) != 4 {
		t.Fatalf("attendu 4 membres dans la clique, obtenu %d", len(reports[0].Members))
	}
}

func TestDetectMutualFollowCliques_IgnoresOpenCommunity(t *testing.T) {
	// 4 amis qui se suivent mutuellement MAIS suivent chacun 6 autres créateurs
	// (taux d'insularité = 3/9 = 33 % < 70 %) → communauté normale, aucun signal.
	friends := []string{"a1", "a2", "a3", "a4"}
	var edges []FollowEdge
	for _, u := range friends {
		for _, v := range friends {
			if u != v {
				edges = append(edges, FollowEdge{From: u, To: v})
			}
		}
		for _, ext := range []string{"c1", "c2", "c3", "c4", "c5", "c6"} {
			edges = append(edges, FollowEdge{From: u, To: ext})
		}
	}

	reports := DetectMutualFollowCliques(edges, 4, 0.70)
	if len(reports) != 0 {
		t.Fatalf("communauté ouverte ne doit pas déclencher de clique, obtenu %d", len(reports))
	}
}

func TestAuditRecentFollowRings_NilPoolSafe(t *testing.T) {
	n, err := AuditRecentFollowRings(context.Background(), nil, time.Now())
	if err != nil || n != 0 {
		t.Fatalf("pool nil doit retourner 0, nil — obtenu %d, %v", n, err)
	}
}
