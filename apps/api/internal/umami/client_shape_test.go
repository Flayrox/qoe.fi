package umami

import (
	"encoding/json"
	"testing"
)

// Umami v2 renvoie {"pageviews":{"value":N},…} ; l'ancienne API renvoyait des
// nombres plats. Les deux doivent se décoder (sinon les stats créateur sont
// silencieusement nulles).
func TestStatsUnmarshalV2Shape(t *testing.T) {
	var s Stats
	raw := `{"pageviews":{"value":120,"change":3},"visitors":{"value":30},"visits":{"value":35},"bounces":{"value":5},"totaltime":{"value":900}}`
	if err := json.Unmarshal([]byte(raw), &s); err != nil {
		t.Fatalf("v2: %v", err)
	}
	if s.Pageviews != 120 || s.Visitors != 30 || s.Totaltime != 900 {
		t.Fatalf("v2 mal décodé: %+v", s)
	}
}

func TestStatsUnmarshalFlatShape(t *testing.T) {
	var s Stats
	if err := json.Unmarshal([]byte(`{"pageviews":7,"visitors":3,"visits":4,"bounces":1,"totaltime":60}`), &s); err != nil {
		t.Fatalf("plat: %v", err)
	}
	if s.Pageviews != 7 || s.Visits != 4 {
		t.Fatalf("plat mal décodé: %+v", s)
	}
}
