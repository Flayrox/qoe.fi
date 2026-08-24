package highlights

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/testutil"
)

// Tests HTTP : les handlers réels (routage, parsing, contrats JSON).

func newHTTPRouter() http.Handler {
	r := chi.NewRouter()
	h := NewHandler(newTestService())
	h.RegisterPublic(r)
	h.RegisterProtected(r)
	return r
}

func doReq(r http.Handler, method, path, userID, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if userID != "" {
		ctx := context.WithValue(req.Context(), middleware.UserIDKey, userID)
		req = req.WithContext(ctx)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestHTTP_ListPublicAndCreateFlow(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	r := newHTTPRouter()

	// Lecture publique sans session : liste vide mais 200.
	w := doReq(r, http.MethodGet, "/v1/articles/"+fx.ArticleID+"/highlights", "", "")
	if w.Code != http.StatusOK {
		t.Fatalf("list public = %d %s", w.Code, w.Body.String())
	}
	// Contrat : tableau brut des surlignages publics.
	var initial []map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &initial); err != nil || len(initial) != 0 {
		t.Fatalf("liste initiale attendue vide : %s (%v)", w.Body.String(), err)
	}

	// Création authentifiée.
	w = doReq(r, http.MethodPost, "/v1/articles/"+fx.ArticleID+"/highlights",
		fx.AuthorID, `{"text":"Passage clé","isPublic":true}`)
	if w.Code != http.StatusOK && w.Code != http.StatusCreated {
		t.Fatalf("create = %d %s", w.Code, w.Body.String())
	}
	// Contrat : le surlignage créé est renvoyé au niveau racine (201).
	var created map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
		t.Fatalf("json: %v (%s)", err, w.Body.String())
	}
	hlID, _ := created["id"].(string)
	if hlID == "" {
		t.Fatalf("id absent : %s", w.Body.String())
	}

	// La liste publique contient maintenant le surlignage.
	w = doReq(r, http.MethodGet, "/v1/articles/"+fx.ArticleID+"/highlights", "", "")
	if !strings.Contains(w.Body.String(), "Passage clé") {
		t.Fatalf("surlignage absent de la liste publique : %s", w.Body.String())
	}

	// Sans session : création refusée.
	w = doReq(r, http.MethodPost, "/v1/articles/"+fx.ArticleID+"/highlights",
		"", `{"text":"anon"}`)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("create anonyme = %d, attendu 401", w.Code)
	}
}

func TestHTTP_UpdateDeleteToggleUpvote(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := newTestService()
	h0, err := svc.Create(context.Background(), fx.ArticleID, fx.AuthorID, "Texte", strPtr("note"), true)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	r := newHTTPRouter()

	// Update partiel (visibilité privée).
	w := doReq(r, http.MethodPatch, "/v1/highlights/"+h0.ID,
		fx.AuthorID, `{"isPublic":false}`)
	if w.Code != http.StatusOK {
		t.Fatalf("update = %d %s", w.Code, w.Body.String())
	}

	// Toggle upvote par le viewer.
	w = doReq(r, http.MethodPost, "/v1/highlights/"+h0.ID+"/upvote", fx.ViewerID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("upvote = %d %s", w.Code, w.Body.String())
	}

	// Suppression par un tiers : ok:false (0 ligne affectée).
	w = doReq(r, http.MethodDelete, "/v1/highlights/"+h0.ID, fx.ViewerID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("delete autrui = %d %s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), `"success":false`) {
		t.Fatalf("contrat success attendu false : %s", w.Body.String())
	}

	// Suppression par le propriétaire : ok:true.
	w = doReq(r, http.MethodDelete, "/v1/highlights/"+h0.ID, fx.AuthorID, "")
	if !strings.Contains(w.Body.String(), `"success":true`) {
		t.Fatalf("contrat success attendu true : %s", w.Body.String())
	}
}

func TestHTTP_CommentsRoutes(t *testing.T) {
	fx, err := testutil.SeedPosts(context.Background(), poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	svc := newTestService()
	h0, err := svc.Create(context.Background(), fx.ArticleID, fx.AuthorID, "À annoter", nil, true)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	r := newHTTPRouter()

	// Liste vide puis création.
	w := doReq(r, http.MethodGet, "/v1/highlights/"+h0.ID+"/comments", fx.ViewerID, "")
	// Contrat : tableau brut.
	var empty []map[string]any
	if w.Code != http.StatusOK || json.Unmarshal(w.Body.Bytes(), &empty) != nil || len(empty) != 0 {
		t.Fatalf("list comments initiale = %d %s", w.Code, w.Body.String())
	}

	w = doReq(r, http.MethodPost, "/v1/highlights/"+h0.ID+"/comments",
		fx.ViewerID, `{"content":"Très juste"}`)
	if w.Code != http.StatusOK && w.Code != http.StatusCreated {
		t.Fatalf("create comment = %d %s", w.Code, w.Body.String())
	}
	// Contrat : commentaire au niveau racine, statut 201.
	var created map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil || created["id"] == nil {
		t.Fatalf("comment id absent : %s (%v)", w.Body.String(), err)
	}
	commentID, _ := created["id"].(string)

	// Delete avec le mauvais auteur → deleted:false.
	w = doReq(r, http.MethodDelete,
		"/v1/highlights/comments/"+commentID, fx.AuthorID, "")
	if !strings.Contains(w.Body.String(), `"success":false`) {
		t.Fatalf("delete autrui doit refléter l'échec : %s", w.Body.String())
	}
}
