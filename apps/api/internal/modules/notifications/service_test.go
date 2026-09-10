package notifications

import (
	"reflect"
	"testing"
)

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
