package creator

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
)

func TestCreator_RecommendationsLifecycle(t *testing.T) {
	ctx := context.Background()
	alicePubID, aliceID, bobPubID, _ := seedFollows(t)
	r := newFullRouter()

	// 1. Liste initiale vide
	wList := authedRequest(r, http.MethodGet, fmt.Sprintf("/v1/creator/recommendations?publicationId=%s", alicePubID), aliceID, "")
	if wList.Code != http.StatusOK {
		t.Fatalf("list recommendations = %d %s, want 200", wList.Code, wList.Body.String())
	}
	var listResp struct {
		Items []apiRecommendationItem `json:"items"`
	}
	if err := json.NewDecoder(wList.Body).Decode(&listResp); err != nil {
		t.Fatalf("decode list: %v", err)
	}
	if len(listResp.Items) != 0 {
		t.Fatalf("expected 0 items, got %d", len(listResp.Items))
	}

	// 2. Tentative d'auto-recommandation (interdite)
	selfBody := fmt.Sprintf(`{"publicationId":"%s","recommendedId":"%s"}`, alicePubID, alicePubID)
	wSelf := authedRequest(r, http.MethodPost, "/v1/creator/recommendations", aliceID, selfBody)
	if wSelf.Code != http.StatusBadRequest {
		t.Fatalf("self recommendation = %d, want 400", wSelf.Code)
	}

	// 3. Ajout d'une recommandation valide (Alice recommande Bob)
	addBody := fmt.Sprintf(`{"publicationId":"%s","recommendedId":"%s","description":"Lecture vivement conseillée"}`, alicePubID, bobPubID)
	wAdd := authedRequest(r, http.MethodPost, "/v1/creator/recommendations", aliceID, addBody)
	if wAdd.Code != http.StatusOK {
		t.Fatalf("add recommendation = %d %s, want 200", wAdd.Code, wAdd.Body.String())
	}

	// 4. Liste mise à jour (1 recommandation)
	wList2 := authedRequest(r, http.MethodGet, fmt.Sprintf("/v1/creator/recommendations?publicationId=%s", alicePubID), aliceID, "")
	if wList2.Code != http.StatusOK {
		t.Fatalf("list recommendations after add = %d", wList2.Code)
	}
	var listResp2 struct {
		Items []apiRecommendationItem `json:"items"`
	}
	_ = json.NewDecoder(wList2.Body).Decode(&listResp2)
	if len(listResp2.Items) != 1 || listResp2.Items[0].PublicationID != bobPubID {
		t.Fatalf("expected 1 item with id %s, got %+v", bobPubID, listResp2.Items)
	}

	// 5. Suppression de la recommandation
	wDel := authedRequest(r, http.MethodDelete, fmt.Sprintf("/v1/creator/recommendations/%s?publicationId=%s", bobPubID, alicePubID), aliceID, "")
	if wDel.Code != http.StatusOK {
		t.Fatalf("delete recommendation = %d %s, want 200", wDel.Code, wDel.Body.String())
	}

	// 6. Liste finale vide
	wList3 := authedRequest(r, http.MethodGet, fmt.Sprintf("/v1/creator/recommendations?publicationId=%s", alicePubID), aliceID, "")
	var listResp3 struct {
		Items []apiRecommendationItem `json:"items"`
	}
	_ = json.NewDecoder(wList3.Body).Decode(&listResp3)
	if len(listResp3.Items) != 0 {
		t.Fatalf("expected 0 items after deletion, got %d", len(listResp3.Items))
	}
	_ = ctx
}
