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
