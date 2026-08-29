package feed

import (
	"context"
	"testing"
)

func TestActivityLast7Days(t *testing.T) {
	ctx := context.Background()
	readerID, err := seedEngine(ctx, poolTest)
	if err != nil {
		t.Fatalf("seed engine: %v", err)
	}

	// Un bookmark aujourd'hui + un highlight → deux entrées d'activité.
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Bookmark" (id, "readerId", "articleId")
		 VALUES (gen_random_uuid()::text, $1::uuid, 'eng_art_a')`, readerID); err != nil {
		t.Fatalf("bookmark: %v", err)
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "Highlight" (id, text, "readerId", "articleId")
		 VALUES (gen_random_uuid()::text, 'passage', $1::uuid, 'eng_art_b')`, readerID); err != nil {
		t.Fatalf("highlight: %v", err)
	}

	svc := newTestService()
	data := svc.activityLast7Days(ctx, readerID)
	if len(data) != 7 {
		t.Fatalf("data = %d éléments, attendu 7", len(data))
	}
	total := 0
	for _, n := range data {
		total += n
	}
	if total < 2 {
		t.Fatalf("activité = %v (total %d), attendu ≥2 (bookmark + highlight)", data, total)
	}
}