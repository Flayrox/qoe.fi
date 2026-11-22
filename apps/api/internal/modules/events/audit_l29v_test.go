package events

import (
	"net/http"
	"strings"
	"testing"
)

// TestAuditL29V_QueueOutageIsNotAnnouncedAsQueued : sans client asynq (Redis
// non configuré), l'endpoint interne répondait « queued: true » alors que
// rien n'était mis en file — l'appelant croyait l'événement parti.
func TestAuditL29V_QueueOutageIsNotAnnouncedAsQueued(t *testing.T) {
	r := newRouter("s3cret")

	for _, tc := range []struct{ path, body string }{
		{"/internal/events/article-published", `{"articleId":"a1","publisherId":"p1"}`},
		{"/internal/events/subscriber-created", `{"email":"a@b.c","publisherId":"p1"}`},
	} {
		w := post(r, tc.path, "s3cret", tc.body)
		if w.Code != http.StatusServiceUnavailable {
			t.Fatalf("%s sans file → %d (%s), attendu 503",
				tc.path, w.Code, strings.TrimSpace(w.Body.String()))
		}
		if strings.Contains(w.Body.String(), `"queued":true`) {
			t.Fatalf("%s sans file annonce queued:true : %s", tc.path, w.Body.String())
		}
	}
}
