package posts

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
)

// newTestRouter monte le Handler sur un routeur chi et force l'utilisateur
// connecté via un middleware qui injecte UserIDKey. `userID=""` simule un accès
// non authentifié (routes publiques).
func newTestRouter(t *testing.T, userID string) *chi.Mux {
	t.Helper()
	r := chi.NewRouter()
	h := NewHandler(newTestService())
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			ctx := req.Context()
			if userID != "" {
				ctx = context.WithValue(ctx, middleware.UserIDKey, userID)
			}
			next.ServeHTTP(w, req.WithContext(ctx))
		})
	})
	h.Register(r)
	return r
}

func doJSON(t *testing.T, r *chi.Mux, method, path string, body string) *httptest.ResponseRecorder {
	t.Helper()
	var buf *bytes.Buffer
	if body == "" {
		buf = bytes.NewBuffer(nil)
	} else {
		buf = bytes.NewBufferString(body)
	}
	req := httptest.NewRequest(method, path, buf)
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	return rr
}

func TestHandlers_CreateGetDelete(t *testing.T) {
	fx := seedPosts(t)
	r := newTestRouter(t, fx.AuthorID)

	// create (JSON valide).
	rr := doJSON(t, r, "POST", "/v1/posts", `{"content":"Pensée HTTP","tags":["http"]}`)
	if rr.Code != http.StatusCreated {
		t.Fatalf("create code = %d, attendu 201", rr.Code)
	}
	var created struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(rr.Body).Decode(&created); err != nil {
		t.Fatalf("decode create: %v (%s)", err, rr.Body.String())
	}
	id := created.ID
	if id == "" {
		t.Fatalf("create: id manquant: %s", rr.Body.String())
	}

	// create JSON invalide.
	if rr := doJSON(t, r, "POST", "/v1/posts", `{`); rr.Code != http.StatusBadRequest {
		t.Fatalf("create json invalide code = %d", rr.Code)
	}

	// get (succès puis introuvable).
	if rr := doJSON(t, r, "GET", "/v1/posts/"+id, ""); rr.Code != http.StatusOK {
		t.Fatalf("get id code = %d", rr.Code)
	}
	if rr := doJSON(t, r, "GET", "/v1/posts/introuvable", ""); rr.Code != http.StatusNotFound {
		t.Fatalf("get introuvable code = %d, attendu 404", rr.Code)
	}

	// delete (succès puis double delete → non trouvé).
	if rr := doJSON(t, r, "DELETE", "/v1/posts/"+id, ""); rr.Code != http.StatusOK {
		t.Fatalf("delete code = %d", rr.Code)
	}
	// un autre utilisateur (bob) ne peut pas supprimer la pensée d'Alice.
	rb := newTestRouter(t, fx.ViewerID)
	// Un non-auteur ne peut pas supprimer la pensée d'Alice (soft-delete → 404).
	if rr := doJSON(t, rb, "DELETE", "/v1/posts/"+fx.PostID, ""); rr.Code == http.StatusOK {
		t.Fatal("delete par un non-auteur ne doit pas réussir")
	}
}

func TestHandlers_LikeRepostBookmarkPin(t *testing.T) {
	fx := seedPosts(t)
	r := newTestRouter(t, fx.ViewerID)

	if rr := doJSON(t, r, "POST", "/v1/posts/"+fx.PostID+"/like", ""); rr.Code != http.StatusOK {
		t.Fatalf("like code = %d", rr.Code)
	}
	if rr := doJSON(t, r, "POST", "/v1/posts/"+fx.PostID+"/repost", ""); rr.Code != http.StatusOK {
		t.Fatalf("repost code = %d", rr.Code)
	}
	// Les signets visent des articles, pas des pensées.
	if rr := doJSON(t, r, "POST", "/v1/posts/"+fx.ArticleID+"/bookmark", ""); rr.Code != http.StatusOK {
		t.Fatalf("bookmark code = %d, body=%s", rr.Code, rr.Body.String())
	}
	// pin est réservé à l'auteur.
	ra := newTestRouter(t, fx.AuthorID)
	if rr := doJSON(t, ra, "POST", "/v1/posts/"+fx.PostID+"/pin", ""); rr.Code != http.StatusOK {
		t.Fatalf("pin auteur code = %d", rr.Code)
	}
	// Pin par non-auteur → refuse.
	if rr := doJSON(t, r, "POST", "/v1/posts/"+fx.PostID+"/pin", ""); rr.Code != http.StatusBadRequest {
		t.Fatalf("pin non-auteur code = %d, attendu 400", rr.Code)
	}

	// listes d'engagement.
	if rr := doJSON(t, r, "GET", "/v1/posts/"+fx.PostID+"/likes?limit=10", ""); rr.Code != http.StatusOK {
		t.Fatalf("likes code = %d", rr.Code)
	}
	if rr := doJSON(t, r, "GET", "/v1/posts/"+fx.PostID+"/reposts", ""); rr.Code != http.StatusOK {
		t.Fatalf("reposts code = %d", rr.Code)
	}
	if rr := doJSON(t, r, "GET", "/v1/posts/"+fx.PostID+"/quotes", ""); rr.Code != http.StatusOK {
		t.Fatalf("quotes code = %d", rr.Code)
	}
}

func TestHandlers_ReplyAndThread(t *testing.T) {
	fx := seedPosts(t)
	r := newTestRouter(t, fx.ViewerID)

	rr := doJSON(t, r, "POST", "/v1/posts/"+fx.PostID+"/reply", `{"content":"Réponse via HTTP"}`)
	if rr.Code != http.StatusCreated {
		t.Fatalf("reply code = %d, attendu 201", rr.Code)
	}
	// Réponse JSON vide → 400.
	if rr := doJSON(t, r, "POST", "/v1/posts/"+fx.PostID+"/reply", `{`); rr.Code != http.StatusBadRequest {
		t.Fatalf("reply badjson code = %d", rr.Code)
	}
}

func TestHandlers_BlockMuteReportHide(t *testing.T) {
	fx := seedPosts(t)
	r := newTestRouter(t, fx.ViewerID)

	if rr := doJSON(t, r, "POST", "/v1/users/"+fx.AuthorID+"/block", ""); rr.Code != http.StatusOK {
		t.Fatalf("block code = %d", rr.Code)
	}
	if rr := doJSON(t, r, "POST", "/v1/users/"+fx.AuthorID+"/mute", ""); rr.Code != http.StatusOK {
		t.Fatalf("mute code = %d", rr.Code)
	}
	if rr := doJSON(t, r, "POST", "/v1/reports", `{"targetId":"`+fx.PostID+`","targetType":"post","reason":"spam"}`); rr.Code != http.StatusOK {
		t.Fatalf("report code = %d", rr.Code)
	}
	// hide (réservé à l'auteur du post parent).
	ra := newTestRouter(t, fx.AuthorID)
	if rr := doJSON(t, ra, "POST", "/v1/posts/"+fx.Post2ID+"/hide", ""); rr.Code != http.StatusBadRequest {
		t.Fatalf("hide non-auteur code = %d, attendu 400", rr.Code)
	}

	// messages context non authentifié.
	ru := newTestRouter(t, "")
	if rr := doJSON(t, ru, "GET", "/v1/posts/drafts", ""); rr.Code != http.StatusUnauthorized {
		t.Fatalf("drafts sans auth code = %d, attendu 401", rr.Code)
	}
	if rr := doJSON(t, ru, "GET", "/v1/posts/"+fx.PostID+"/can-reply", ""); rr.Code != http.StatusOK {
		t.Fatalf("can-reply code = %d", rr.Code)
	}
}

func TestHandlers_PollVote(t *testing.T) {
	fx := seedPosts(t)
	r := newTestRouter(t, fx.ViewerID)

	rr := doJSON(t, r, "POST", "/v1/posts", `{"content":"Sondage via HTTP","poll":{"options":["Oui","Non"],"durationHours":24}}`)
	if rr.Code != http.StatusCreated {
		t.Fatalf("create sondage code = %d, body=%s", rr.Code, rr.Body.String())
	}
	var created struct {
		ID   string `json:"id"`
		Poll *Poll  `json:"poll"`
	}
	if err := json.NewDecoder(rr.Body).Decode(&created); err != nil {
		t.Fatalf("decode sondage: %v", err)
	}
	if created.ID == "" || created.Poll == nil || len(created.Poll.Options) < 1 {
		t.Fatalf("sondage invalide: %+v", created)
	}
	opt := created.Poll.Options[0].ID

	// vote (optionId vide → 400).
	if rr := doJSON(t, r, "POST", "/v1/posts/"+created.ID+"/poll/vote", `{"optionId":""}`); rr.Code != http.StatusBadRequest {
		t.Fatalf("vote sans optionId code = %d", rr.Code)
	}
	// vote valide.
	if rr := doJSON(t, r, "POST", "/v1/posts/"+created.ID+"/poll/vote", `{"optionId":"`+opt+`"}`); rr.Code != http.StatusOK {
		t.Fatalf("vote code = %d, body=%s", rr.Code, rr.Body.String())
	}
	// unvote.
	if rr := doJSON(t, r, "POST", "/v1/posts/"+created.ID+"/poll/unvote", ""); rr.Code != http.StatusOK {
		t.Fatalf("unvote code = %d, body=%s", rr.Code, rr.Body.String())
	}
}

func TestHandlers_Drafts(t *testing.T) {
	fx := seedPosts(t)
	r := newTestRouter(t, fx.AuthorID)

	if rr := doJSON(t, r, "POST", "/v1/posts", `{"content":"brouillon via HTTP","isDraft":true}`); rr.Code != http.StatusCreated {
		t.Fatalf("create draft code = %d", rr.Code)
	}
	rr := doJSON(t, r, "GET", "/v1/posts/drafts?limit=5", "")
	if rr.Code != http.StatusOK {
		t.Fatalf("drafts code = %d", rr.Code)
	}
}