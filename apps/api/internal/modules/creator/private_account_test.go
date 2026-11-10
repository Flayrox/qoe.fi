package creator

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
)

// TestPrivateAccount_FollowRequestThenAccept couvre le parcours complet :
//  1. un follow vers un compte PRIVATE crée une demande, pas un follow ;
//  2. le profil anonyme est verrouillé ;
//  3. le propriétaire retrouve la demande dans sa boîte de réception ;
//  4. l'acceptation crée le follow réel ;
//  5. le demandeur voit alors le contenu.
func TestBlock_HidesProfileBothWays(t *testing.T) {
	_, aliceUserID, _, bobUserID := seedFollows(t)
	ctx := context.Background()

	// Alice bloque Bob. Les deux profils doivent devenir invisibles l'un pour
	// l'autre, même si Bob n'a jamais bloqué Alice.
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "BlockedUser" (id, "creatorId", "readerId") VALUES ('block_test', $1, $2)`,
		aliceUserID, bobUserID); err != nil {
		t.Fatalf("seed block: %v", err)
	}

	r := newFullRouter()
	for _, tc := range []struct {
		name, path, viewer string
	}{
		{"bloqué vers bloqueur", "/v1/users/alice", bobUserID},
		{"bloqueur vers bloqué", "/v1/users/bob", aliceUserID},
	} {
		t.Run(tc.name, func(t *testing.T) {
			w := authedRequest(r, http.MethodGet, tc.path, tc.viewer, "")
			if w.Code != http.StatusNotFound {
				t.Fatalf("status = %d body=%s, attendu 404", w.Code, w.Body.String())
			}
		})
	}
}

func TestPrivateAccount_FollowRequestThenAccept(t *testing.T) {
	alicePubID, aliceUserID, _, bobUserID := seedFollows(t)
	ctx := context.Background()

	// Le seed crée bob→alice ; on repart d'un compte privé sans abonné.
	if _, err := poolTest.Exec(ctx,
		`DELETE FROM "Follows" WHERE "readerId" = $1 AND "publisherId" = $2`,
		bobUserID, alicePubID); err != nil {
		t.Fatalf("delete seed follow: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`DELETE FROM "UserSettings" WHERE "userId" = $1`, aliceUserID); err != nil {
		t.Fatalf("reset settings: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "UserSettings" (id, "userId", "profileVisibility", "updatedAt")
		 VALUES (gen_random_uuid()::text, $1, 'PRIVATE', now())`, aliceUserID); err != nil {
		t.Fatalf("seed private settings: %v", err)
	}

	r := newFullRouter()

	// 1) Follow → demande en attente.
	w := authedRequest(r, http.MethodPost, "/v1/users/"+alicePubID+"/follow", bobUserID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("follow status = %d body=%s", w.Code, w.Body.String())
	}
	var followRes struct {
		Data struct {
			Following bool `json:"following"`
			Requested bool `json:"requested"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &followRes); err != nil {
		t.Fatalf("follow json: %v (%s)", err, w.Body.String())
	}
	if followRes.Data.Following || !followRes.Data.Requested {
		t.Fatalf("follow = %+v, attendu following=false requested=true", followRes.Data)
	}

	// 1b) La notification de demande porte le requestId de la demande pending,
	// pour que l'UI puisse l'accepter/refuser sans repasser par les réglages.
	var notifRequestID, pendingRequestID string
	if err := poolTest.QueryRow(ctx, `
		SELECT metadata->>'requestId' FROM "Notification"
		WHERE "recipientId" = $1 AND "senderId" = $2 AND type = 'FOLLOW'
		  AND metadata->>'kind' = 'FOLLOW_REQUEST'
		ORDER BY "createdAt" DESC LIMIT 1`, aliceUserID, bobUserID).Scan(&notifRequestID); err != nil {
		t.Fatalf("notification requestId: %v", err)
	}
	if err := poolTest.QueryRow(ctx, `
		SELECT id FROM "FollowRequest"
		WHERE "requesterId" = $1 AND "publisherId" = $2 AND status = 'PENDING'`,
		bobUserID, alicePubID).Scan(&pendingRequestID); err != nil {
		t.Fatalf("pending follow request: %v", err)
	}
	if notifRequestID == "" || notifRequestID != pendingRequestID {
		t.Fatalf("notification requestId = %q, demande pending = %q", notifRequestID, pendingRequestID)
	}

	// 2) Profil anonyme : privé, contenu masqué.
	w = authedRequest(r, http.MethodGet, "/v1/users/alice", "", "")
	if w.Code != http.StatusOK {
		t.Fatalf("profile status = %d body=%s", w.Code, w.Body.String())
	}
	var profile struct {
		Data struct {
			IsPrivate         bool   `json:"isPrivate"`
			CanViewContent    bool   `json:"canViewContent"`
			ProfileVisibility string `json:"profileVisibility"`
			FollowRequested   bool   `json:"followRequested"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &profile); err != nil {
		t.Fatalf("profile json: %v (%s)", err, w.Body.String())
	}
	if !profile.Data.IsPrivate || profile.Data.CanViewContent || profile.Data.ProfileVisibility != "PRIVATE" {
		t.Fatalf("profil privé mal exposé: %+v", profile.Data)
	}

	// 3) La boîte de réception d'Alice contient la demande de Bob.
	w = authedRequest(r, http.MethodGet, "/v1/me/follow-requests", aliceUserID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("follow requests status = %d body=%s", w.Code, w.Body.String())
	}
	var list struct {
		Items []struct {
			RequestID string `json:"requestId"`
			ID        string `json:"id"`
		} `json:"items"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &list); err != nil {
		t.Fatalf("follow requests json: %v (%s)", err, w.Body.String())
	}
	if len(list.Items) != 1 {
		t.Fatalf("demandes = %d, attendu 1 (%s)", len(list.Items), w.Body.String())
	}
	if list.Items[0].ID != bobUserID {
		t.Fatalf("demandeur = %q, attendu %q", list.Items[0].ID, bobUserID)
	}

	// 4) Acceptation → follow réel.
	w = authedRequest(r, http.MethodPost,
		"/v1/me/follow-requests/"+list.Items[0].RequestID+"/accept", aliceUserID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("accept status = %d body=%s", w.Code, w.Body.String())
	}
	var exists bool
	if err := poolTest.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM "Follows" WHERE "readerId" = $1 AND "publisherId" = $2)`,
		bobUserID, alicePubID).Scan(&exists); err != nil {
		t.Fatalf("verify follow: %v", err)
	}
	if !exists {
		t.Fatal("follow absent après acceptation")
	}

	// 5) Bob (abonné) voit le contenu.
	w = authedRequest(r, http.MethodGet, "/v1/users/alice", bobUserID, "")
	var after struct {
		Data struct {
			IsFollowing     bool `json:"isFollowing"`
			CanViewContent  bool `json:"canViewContent"`
			FollowRequested bool `json:"followRequested"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &after); err != nil {
		t.Fatalf("profile after json: %v (%s)", err, w.Body.String())
	}
	if !after.Data.IsFollowing || !after.Data.CanViewContent || after.Data.FollowRequested {
		t.Fatalf("profil après acceptation: %+v", after.Data)
	}
}
