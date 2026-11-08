package notifications

import (
	"encoding/json"
	"reflect"
	"testing"

	db "github.com/qoefi/api/internal/database"
)

func TestNotificationFromRowKeepsSenderType(t *testing.T) {
	// Un sender est toujours une personne : la ligne SQL ne transporte plus
	// aucune identité média, et le mapping force PERSONAL.
	member := notificationFromRow(&db.GetNotificationsRow{})
	if got := member.Senders[0].Type; got != "PERSONAL" {
		t.Fatalf("sender type = %q, attendu PERSONAL", got)
	}
}

func TestMarkReadIDs(t *testing.T) {
	tests := []struct {
		name string
		ids  []string
		want []string
	}{
		{name: "nil → nil (tout marquer lu)", ids: nil, want: nil},
		{name: "vide → nil (tout marquer lu)", ids: []string{}, want: nil},
		{name: "un seul id → inchangé", ids: []string{"n-1"}, want: []string{"n-1"}},
		{name: "plusieurs ids → inchangés", ids: []string{"n-1", "n-2"}, want: []string{"n-1", "n-2"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := markReadIDs(tt.ids); !reflect.DeepEqual(got, tt.want) {
				t.Errorf("markReadIDs(%v) = %v, want %v", tt.ids, got, tt.want)
			}
		})
	}
}

func TestSameNotificationKindSeparatesFollowRequest(t *testing.T) {
	follow := json.RawMessage(`{"kind":"FOLLOW"}`)
	requestA := json.RawMessage(`{"kind":"FOLLOW_REQUEST","requestId":"fr-a"}`)
	requestB := json.RawMessage(`{"kind":"FOLLOW_REQUEST","requestId":"fr-b"}`)

	if !sameNotificationKind(follow, follow) {
		t.Fatal("deux follows classiques doivent rester groupables")
	}
	if sameNotificationKind(follow, requestA) {
		t.Fatal("une demande de follow ne doit pas être groupée avec un follow accepté")
	}
	if !sameNotificationKind(requestA, requestB) {
		t.Fatal("deux demandes de follow partagent le même kind")
	}
	if !sameNotificationKind(nil, nil) {
		t.Fatal("deux notifications sans metadata doivent rester groupables")
	}
}

func TestTypeFilter(t *testing.T) {
	tests := []struct {
		filter string
		want   []string
	}{
		{
			filter: "mentions",
			want:   []string{"MENTION"},
		},
		{
			filter: "replies",
			want:   []string{"REPLY", "COMMENT"},
		},
		{
			filter: "likes",
			want:   []string{"LIKE"},
		},
		{
			filter: "collaborations",
			want: []string{
				"ARTICLE_CONTRIBUTOR_INVITED",
				"ARTICLE_CONTRIBUTOR_ACCEPTED",
				"ARTICLE_CONTRIBUTOR_DECLINED",
				"ARTICLE_CONTRIBUTOR_REMOVED",
				"MEDIA_INVITE",
				"MEDIA_MEMBER_JOINED",
				"MEDIA_ARTICLE_SUBMITTED",
				"MEDIA_ARTICLE_APPROVED",
				"MEDIA_ARTICLE_REJECTED",
				"MEDIA_ARTICLE_PUBLISHED",
			},
		},
		{
			filter: "all",
			want:   nil,
		},
		{
			filter: "unknown",
			want:   nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.filter, func(t *testing.T) {
			got := typeFilter(tt.filter)
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("typeFilter(%q) = %v, want %v", tt.filter, got, tt.want)
			}
		})
	}
}
