package support

// =====================================================================
// 🧪 Tests HTTP & service du module support (sans Docker requis)
// =====================================================================
// Simule internalsupport.DB en mémoire afin de couvrir toutes les routes
// publiques (articles, dépôt public avec coupe-feu/budget/invité) et
// protégées (liste, ouverture, détail, messages, mapping d'erreurs).
// =====================================================================

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/qoefi/api/internal/middleware"
	internalsupport "github.com/qoefi/api/internal/support"
	"github.com/redis/go-redis/v9"
)

// ─── Double mémoire de internalsupport.DB ──────────────────────────────

type memRow struct {
	vals []any
	err  error
}

func (r memRow) Scan(dest ...any) error {
	if r.err != nil {
		return r.err
	}
	return assignValues(r.vals, dest...)
}

type memRows struct {
	rows [][]any
	idx  int
	err  error
}

func (r *memRows) Close()                                       {}
func (r *memRows) Err() error                                   { return r.err }
func (r *memRows) CommandTag() pgconn.CommandTag                { return pgconn.CommandTag{} }
func (r *memRows) FieldDescriptions() []pgconn.FieldDescription { return nil }
func (r *memRows) Values() ([]any, error)                       { return nil, nil }
func (r *memRows) RawValues() [][]byte                          { return nil }
func (r *memRows) Conn() *pgx.Conn                              { return nil }

func (r *memRows) Next() bool {
	if r.idx >= len(r.rows) {
		return false
	}
	r.idx++
	return true
}

func (r *memRows) Scan(dest ...any) error {
	return assignValues(r.rows[r.idx-1], dest...)
}

func assignValues(vals []any, dest ...any) error {
	if len(vals) != len(dest) {
		return fmt.Errorf("assignValues: %d valeurs pour %d destinations", len(vals), len(dest))
	}
	for i, d := range dest {
		v := vals[i]
		switch dst := d.(type) {
		case *string:
			*dst = v.(string)
		case **string:
			if v == nil {
				*dst = nil
			} else if p, ok := v.(*string); ok {
				*dst = p
			} else {
				s := v.(string)
				*dst = &s
			}
		case *bool:
			*dst = v.(bool)
		case *int:
			*dst = v.(int)
		case *time.Time:
			*dst = v.(time.Time)
		case **time.Time:
			if v == nil {
				*dst = nil
			} else if p, ok := v.(*time.Time); ok {
				*dst = p
			} else {
				t := v.(time.Time)
				*dst = &t
			}
		default:
			return fmt.Errorf("assignValues: type destination non géré %T", d)
		}
	}
	return nil
}

type storedTicket struct {
	id          string
	kind        string
	subject     string
	openedBy    string
	status      string
	assignee    *string
	relatedType string
	relatedID   string
	staffNote   string
	closedBy    *string
	closedAt    *time.Time
	createdAt   time.Time
	messages    []storedTicketMsg
}

type storedTicketMsg struct {
	id        string
	authorID  string
	body      string
	createdAt time.Time
}

type storedArticle struct {
	id        string
	slug      string
	titleFr   string
	titleEn   string
	bodyFr    string
	bodyEn    string
	position  int
	published bool
	createdAt time.Time
	updatedAt time.Time
}

type fakeSupportDB struct {
	killPublic bool
	budgets    map[string]int
	tickets    map[string]*storedTicket
	order      []string
	articles   []storedArticle
	nextSeq    int
	queryErr   error
}

func newFakeSupportDB() *fakeSupportDB {
	return &fakeSupportDB{
		budgets: map[string]int{},
		tickets: map[string]*storedTicket{},
	}
}

func (f *fakeSupportDB) Exec(_ context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	if strings.Contains(sql, `INSERT INTO "SupportMessage"`) {
		ticketID := args[0].(string)
		authorID := args[1].(string)
		body := args[2].(string)
		now := args[3].(time.Time)
		tk, ok := f.tickets[ticketID]
		if !ok {
			return pgconn.CommandTag{}, pgx.ErrNoRows
		}
		f.nextSeq++
		tk.messages = append(tk.messages, storedTicketMsg{
			id:        fmt.Sprintf("msg-%d", f.nextSeq),
			authorID:  authorID,
			body:      body,
			createdAt: now,
		})
	}
	return pgconn.CommandTag{}, nil
}

func (f *fakeSupportDB) Query(_ context.Context, sql string, args ...any) (pgx.Rows, error) {
	if f.queryErr != nil {
		return nil, f.queryErr
	}
	if strings.Contains(sql, `FROM "SupportArticle"`) {
		var rows [][]any
		for _, a := range f.articles {
			if a.published {
				rows = append(rows, []any{
					a.id, a.slug, a.titleFr, a.titleEn, a.bodyFr, a.bodyEn,
					a.position, a.published, a.createdAt, a.updatedAt,
				})
			}
		}
		return &memRows{rows: rows}, nil
	}
	if strings.Contains(sql, `FROM "SupportMessage"`) {
		ticketID := args[0].(string)
		tk, ok := f.tickets[ticketID]
		if !ok {
			return &memRows{}, nil
		}
		var rows [][]any
		for _, m := range tk.messages {
			rows = append(rows, []any{m.id, m.authorID, m.body, m.createdAt})
		}
		return &memRows{rows: rows}, nil
	}
	if strings.Contains(sql, `FROM "SupportTicket" WHERE "openedBy"`) {
		uid := args[0].(string)
		var matched []*storedTicket
		for _, id := range f.order {
			if tk := f.tickets[id]; tk != nil && tk.openedBy == uid {
				matched = append(matched, tk)
			}
		}
		total := len(matched)
		var rows [][]any
		for _, tk := range matched {
			rows = append(rows, []any{
				tk.id, tk.kind, tk.subject, tk.openedBy, tk.status, tk.assignee,
				tk.relatedType, tk.relatedID, tk.staffNote, tk.closedBy, tk.closedAt, tk.createdAt, total,
			})
		}
		return &memRows{rows: rows}, nil
	}
	return &memRows{}, nil
}

func (f *fakeSupportDB) QueryRow(_ context.Context, sql string, args ...any) pgx.Row {
	if strings.Contains(sql, `FROM "feature_flags"`) {
		if !f.killPublic {
			return memRow{err: pgx.ErrNoRows}
		}
		return memRow{vals: []any{true}}
	}
	if strings.Contains(sql, `INSERT INTO "CapabilityBudget"`) {
		scopeType := args[0].(string)
		scopeID := args[1].(string)
		action := args[2].(string)
		capVal := args[4].(int)
		nVal := args[5].(int)
		key := scopeType + "|" + scopeID + "|" + action
		cur := f.budgets[key]
		if cur+nVal > capVal {
			return memRow{err: pgx.ErrNoRows}
		}
		f.budgets[key] = cur + nVal
		return memRow{vals: []any{true}}
	}
	if strings.Contains(sql, `INSERT INTO "SupportTicket"`) {
		kind := args[0].(string)
		subject := args[1].(string)
		openedBy := args[2].(string)
		relatedType := args[3].(string)
		relatedID := args[4].(string)
		now := args[5].(time.Time)

		for _, tk := range f.tickets {
			if tk.openedBy == openedBy && tk.kind == kind && tk.status != internalsupport.StatusClosed {
				return memRow{err: &pgconn.PgError{Code: "23505"}}
			}
		}
		f.nextSeq++
		id := fmt.Sprintf("ticket-%d", f.nextSeq)
		f.tickets[id] = &storedTicket{
			id:          id,
			kind:        kind,
			subject:     subject,
			openedBy:    openedBy,
			status:      internalsupport.StatusOpen,
			relatedType: relatedType,
			relatedID:   relatedID,
			createdAt:   now,
		}
		f.order = append(f.order, id)
		return memRow{vals: []any{id}}
	}
	if strings.Contains(sql, `FROM "SupportTicket" WHERE "id"`) {
		id := args[0].(string)
		tk, ok := f.tickets[id]
		if !ok {
			return memRow{err: pgx.ErrNoRows}
		}
		return memRow{vals: []any{
			tk.id, tk.kind, tk.subject, tk.openedBy, tk.status, tk.assignee,
			tk.relatedType, tk.relatedID, tk.staffNote, tk.closedBy, tk.closedAt, tk.createdAt,
		}}
	}
	return memRow{err: pgx.ErrNoRows}
}

// ─── Helpers HTTP ──────────────────────────────────────────────────────

func newSupportRouter(h *Handler, userID string) *chi.Mux {
	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			if userID != "" {
				req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, userID))
			}
			next.ServeHTTP(w, req)
		})
	})
	h.RegisterPublic(r)
	h.RegisterProtected(r)
	return r
}

func doSupportReq(r *chi.Mux, method, path, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

// ─── Tests ─────────────────────────────────────────────────────────────

func TestSupport_NilPool_NoPanic(t *testing.T) {
	svc := NewService(nil)
	r := newSupportRouter(NewHandler(svc), "u-nil")

	wArt := doSupportReq(r, http.MethodGet, "/v1/support/articles", "")
	if wArt.Code != http.StatusOK {
		t.Fatalf("GET /v1/support/articles nil pool = %d, attendu 200 (%s)", wArt.Code, wArt.Body.String())
	}
	if !strings.Contains(wArt.Body.String(), `"items":[]`) {
		t.Fatalf("attendu items:[], obtenu %s", wArt.Body.String())
	}

	wList := doSupportReq(r, http.MethodGet, "/v1/support/tickets", "")
	if wList.Code != http.StatusOK {
		t.Fatalf("GET /v1/support/tickets nil pool = %d, attendu 200 (%s)", wList.Code, wList.Body.String())
	}
	var resp struct {
		Items []internalsupport.Ticket `json:"items"`
		Total int                      `json:"total"`
	}
	if err := json.Unmarshal(wList.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal tickets: %v", err)
	}
	if resp.Total != 0 || len(resp.Items) != 0 {
		t.Fatalf("attendu items=[], total=0, obtenu %+v", resp)
	}
}

func TestSupport_SetPublicRateLimit(t *testing.T) {
	h := NewHandler(NewServiceWithDB(newFakeSupportDB()))

	// Cas no-op : rc=nil / max<=0.
	h.SetPublicRateLimit(nil, time.Minute, 0)
	r1 := chi.NewRouter()
	h.RegisterPublic(r1)
	if w := doSupportReq(r1, http.MethodGet, "/v1/support/articles", ""); w.Code != http.StatusOK {
		t.Fatalf("articles sans limiter = %d, attendu 200", w.Code)
	}

	// Cas avec client Redis non joignable : RegisterPublic doit envelopper sans paniquer.
	rc := redis.NewClient(&redis.Options{Addr: "127.0.0.1:0"})
	defer func() { _ = rc.Close() }()
	h.SetPublicRateLimit(rc, time.Minute, 5)
	r2 := chi.NewRouter()
	h.RegisterPublic(r2)
	if w := doSupportReq(r2, http.MethodGet, "/v1/support/articles", ""); w.Code != http.StatusOK {
		t.Fatalf("articles avec limiter = %d, attendu 200", w.Code)
	}
}

func TestSupport_ListArticles(t *testing.T) {
	db := newFakeSupportDB()
	now := time.Now().UTC()
	db.articles = []storedArticle{
		{
			id: "art-1", slug: "compte-perdu", titleFr: "Compte perdu", titleEn: "Lost account",
			bodyFr: "Texte FR", bodyEn: "Text EN", position: 1, published: true, createdAt: now, updatedAt: now,
		},
		{
			id: "art-draft", slug: "brouillon", titleFr: "Brouillon", titleEn: "Draft",
			bodyFr: "x", bodyEn: "x", position: 2, published: false, createdAt: now, updatedAt: now,
		},
	}
	r := newSupportRouter(NewHandler(NewServiceWithDB(db)), "")

	w := doSupportReq(r, http.MethodGet, "/v1/support/articles", "")
	if w.Code != http.StatusOK {
		t.Fatalf("GET /v1/support/articles = %d, attendu 200 (%s)", w.Code, w.Body.String())
	}
	var resp struct {
		Items []internalsupport.Article `json:"items"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal articles: %v", err)
	}
	if len(resp.Items) != 1 || resp.Items[0].Slug != "compte-perdu" {
		t.Fatalf("attendu 1 article publié, obtenu %+v", resp.Items)
	}

	// Cas liste vide (items nil en Go → [] en JSON).
	db.articles = nil
	wEmpty := doSupportReq(r, http.MethodGet, "/v1/support/articles", "")
	if wEmpty.Code != http.StatusOK || !strings.Contains(wEmpty.Body.String(), `"items":[]`) {
		t.Fatalf("liste vide attendue, obtenu %d %s", wEmpty.Code, wEmpty.Body.String())
	}

	// Cas erreur DB → 500.
	db.queryErr = errors.New("db down")
	if wErr := doSupportReq(r, http.MethodGet, "/v1/support/articles", ""); wErr.Code != http.StatusInternalServerError {
		t.Fatalf("err DB articles = %d, attendu 500", wErr.Code)
	}
}

func TestSupport_OpenPublic(t *testing.T) {
	db := newFakeSupportDB()
	h := NewHandler(NewServiceWithDB(db))
	rAnon := newSupportRouter(h, "")

	// JSON invalide → 400.
	if w := doSupportReq(rAnon, http.MethodPost, "/v1/support/public/tickets", "{"); w.Code != http.StatusBadRequest {
		t.Fatalf("JSON invalide = %d, attendu 400", w.Code)
	}

	// Coupe-feu engagé → 503 + Retry-After: 300.
	db.killPublic = true
	wKill := doSupportReq(rAnon, http.MethodPost, "/v1/support/public/tickets",
		`{"email":"alice@test.dev","kind":"account_lost","subject":"Accès perdu","message":"Aidez-moi"}`)
	if wKill.Code != http.StatusServiceUnavailable || wKill.Header().Get("Retry-After") != "300" {
		t.Fatalf("coupe-feu = %d Retry-After=%q, attendu 503 / 300", wKill.Code, wKill.Header().Get("Retry-After"))
	}
	db.killPublic = false

	// E-mail invalide → 400.
	if w := doSupportReq(rAnon, http.MethodPost, "/v1/support/public/tickets",
		`{"email":"invalide","kind":"account_lost","subject":"Accès perdu","message":"Aidez-moi"}`); w.Code != http.StatusBadRequest {
		t.Fatalf("email invalide = %d, attendu 400", w.Code)
	}
	// Kind invalide → 400.
	if w := doSupportReq(rAnon, http.MethodPost, "/v1/support/public/tickets",
		`{"email":"alice@test.dev","kind":"inconnu","subject":"Accès perdu","message":"Aidez-moi"}`); w.Code != http.StatusBadRequest {
		t.Fatalf("kind invalide = %d, attendu 400", w.Code)
	}

	// Budget journalier épuisé (cap = 3) → 429 + Retry-After: 86400.
	db.budgets["email_day|bob@test.dev|"+internalsupport.ActionSupportPublic] = internalsupport.PublicCapPerEmailDay
	wCap := doSupportReq(rAnon, http.MethodPost, "/v1/support/public/tickets",
		`{"email":"bob@test.dev","kind":"account_lost","subject":"Accès perdu","message":"Aidez-moi"}`)
	if wCap.Code != http.StatusTooManyRequests || wCap.Header().Get("Retry-After") != "86400" {
		t.Fatalf("budget épuisé = %d Retry-After=%q, attendu 429 / 86400", wCap.Code, wCap.Header().Get("Retry-After"))
	}

	// Succès invité avec name renseigné → 200 {success:true, id:...}.
	wGuest := doSupportReq(rAnon, http.MethodPost, "/v1/support/public/tickets",
		`{"name":"Alice","email":"alice@test.dev","kind":"account_lost","subject":"Accès perdu","message":"Mon compte est bloqué"}`)
	if wGuest.Code != http.StatusOK {
		t.Fatalf("succès invité = %d, attendu 200 (%s)", wGuest.Code, wGuest.Body.String())
	}
	var resGuest struct {
		Success bool   `json:"success"`
		ID      string `json:"id"`
	}
	if err := json.Unmarshal(wGuest.Body.Bytes(), &resGuest); err != nil || !resGuest.Success || resGuest.ID == "" {
		t.Fatalf("réponse invité inattendue: %s (err=%v)", wGuest.Body.String(), err)
	}

	// Succès utilisateur connecté → 200 et rattaché au compte.
	rAuth := newSupportRouter(h, "u-auth")
	wAuth := doSupportReq(rAuth, http.MethodPost, "/v1/support/public/tickets",
		`{"email":"uauth@test.dev","kind":"delivery","subject":"E-mail non reçu","message":"Aucun lien magique reçu."}`)
	if wAuth.Code != http.StatusOK {
		t.Fatalf("succès auth = %d, attendu 200 (%s)", wAuth.Code, wAuth.Body.String())
	}
	var resAuth struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(wAuth.Body.Bytes(), &resAuth)
	if tk := db.tickets[resAuth.ID]; tk == nil || tk.openedBy != "u-auth" {
		t.Fatalf("ticket doit être rattaché à u-auth, obtenu %+v", tk)
	}
}

func TestSupport_Unauthenticated(t *testing.T) {
	r := newSupportRouter(NewHandler(NewServiceWithDB(newFakeSupportDB())), "")
	routes := [][2]string{
		{http.MethodGet, "/v1/support/tickets"},
		{http.MethodPost, "/v1/support/tickets"},
		{http.MethodGet, "/v1/support/tickets/t1"},
		{http.MethodPost, "/v1/support/tickets/t1/messages"},
	}
	for _, rt := range routes {
		w := doSupportReq(r, rt[0], rt[1], `{}`)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("%s %s anonyme = %d, attendu 401", rt[0], rt[1], w.Code)
		}
	}
}

func TestSupport_ProtectedCycle(t *testing.T) {
	db := newFakeSupportDB()
	h := NewHandler(NewServiceWithDB(db))
	r := newSupportRouter(h, "u1")

	// POST /v1/support/tickets validations & erreurs.
	if w := doSupportReq(r, http.MethodPost, "/v1/support/tickets", "{"); w.Code != http.StatusBadRequest {
		t.Fatalf("JSON invalide = %d, attendu 400", w.Code)
	}
	if w := doSupportReq(r, http.MethodPost, "/v1/support/tickets", `{"kind":"","subject":"Sujet valide"}`); w.Code != http.StatusBadRequest {
		t.Fatalf("kind vide = %d, attendu 400", w.Code)
	}
	if w := doSupportReq(r, http.MethodPost, "/v1/support/tickets", `{"kind":"inconnu","subject":"Sujet valide","message":"Bonjour"}`); w.Code != http.StatusBadRequest {
		t.Fatalf("kind inconnu = %d, attendu 400", w.Code)
	}

	// Ouverture valide → 200.
	wOpen := doSupportReq(r, http.MethodPost, "/v1/support/tickets",
		`{"kind":"api_access","subject":"Clé API manquante","message":"Besoin d'aide sur l'API."}`)
	if wOpen.Code != http.StatusOK {
		t.Fatalf("ouverture = %d, attendu 200 (%s)", wOpen.Code, wOpen.Body.String())
	}
	var opened internalsupport.Ticket
	if err := json.Unmarshal(wOpen.Body.Bytes(), &opened); err != nil {
		t.Fatalf("unmarshal open: %v", err)
	}

	// Doublon (même kind ouvert) → 409.
	if wDup := doSupportReq(r, http.MethodPost, "/v1/support/tickets",
		`{"kind":"api_access","subject":"Doublon API","message":"Encore"}`); wDup.Code != http.StatusConflict {
		t.Fatalf("doublon = %d, attendu 409 (%s)", wDup.Code, wDup.Body.String())
	}

	// GET /v1/support/tickets?offset=-3 → 200 (1 dossier).
	wList := doSupportReq(r, http.MethodGet, "/v1/support/tickets?offset=-3", "")
	if wList.Code != http.StatusOK {
		t.Fatalf("list = %d, attendu 200", wList.Code)
	}
	var listed struct {
		Items []internalsupport.Ticket `json:"items"`
		Total int                      `json:"total"`
	}
	_ = json.Unmarshal(wList.Body.Bytes(), &listed)
	if listed.Total != 1 || len(listed.Items) != 1 {
		t.Fatalf("attendu 1 ticket, obtenu %+v", listed)
	}

	// Dossier d'autrui + inconnu → 404 (zéro fuite).
	closedAt := time.Now().UTC()
	closedBy := "staff-1"
	db.tickets["t-other"] = &storedTicket{
		id: "t-other", kind: internalsupport.KindOther, subject: "Autrui", openedBy: "u2",
		status: internalsupport.StatusOpen, createdAt: closedAt,
	}
	db.tickets["t-closed"] = &storedTicket{
		id: "t-closed", kind: internalsupport.KindOther, subject: "Clos", openedBy: "u1",
		status: internalsupport.StatusClosed, closedBy: &closedBy, closedAt: &closedAt, createdAt: closedAt,
	}

	if w := doSupportReq(r, http.MethodGet, "/v1/support/tickets/inconnu", ""); w.Code != http.StatusNotFound {
		t.Fatalf("inconnu = %d, attendu 404", w.Code)
	}
	if w := doSupportReq(r, http.MethodGet, "/v1/support/tickets/t-other", ""); w.Code != http.StatusNotFound {
		t.Fatalf("autrui = %d, attendu 404", w.Code)
	}
	if w := doSupportReq(r, http.MethodGet, "/v1/support/tickets/"+opened.ID, ""); w.Code != http.StatusOK {
		t.Fatalf("détail propre = %d, attendu 200", w.Code)
	}

	// Messages : JSON invalide (400), body vide (400), dossier clos (410), ajout valide (200).
	if w := doSupportReq(r, http.MethodPost, "/v1/support/tickets/"+opened.ID+"/messages", "{"); w.Code != http.StatusBadRequest {
		t.Fatalf("msg JSON invalide = %d, attendu 400", w.Code)
	}
	if w := doSupportReq(r, http.MethodPost, "/v1/support/tickets/"+opened.ID+"/messages", `{"body":""}`); w.Code != http.StatusBadRequest {
		t.Fatalf("msg body vide = %d, attendu 400", w.Code)
	}
	if w := doSupportReq(r, http.MethodPost, "/v1/support/tickets/t-closed/messages", `{"body":"suite"}`); w.Code != http.StatusGone {
		t.Fatalf("msg dossier clos = %d, attendu 410 (%s)", w.Code, w.Body.String())
	}
	wMsg := doSupportReq(r, http.MethodPost, "/v1/support/tickets/"+opened.ID+"/messages", `{"body":"Complément d'information."}`)
	if wMsg.Code != http.StatusOK {
		t.Fatalf("msg valide = %d, attendu 200 (%s)", wMsg.Code, wMsg.Body.String())
	}
	var updated internalsupport.Ticket
	_ = json.Unmarshal(wMsg.Body.Bytes(), &updated)
	if len(updated.Messages) != 2 {
		t.Fatalf("attendu 2 messages, obtenu %d", len(updated.Messages))
	}

	// Cas erreur DB sur list → 500.
	db.queryErr = errors.New("db down")
	if wErr := doSupportReq(r, http.MethodGet, "/v1/support/tickets", ""); wErr.Code != http.StatusInternalServerError {
		t.Fatalf("list err DB = %d, attendu 500", wErr.Code)
	}

	// Couverture directe de mapErr pour ErrTicketForbidden → 403.
	wForb := httptest.NewRecorder()
	h.mapErr(wForb, internalsupport.ErrTicketForbidden)
	if wForb.Code != http.StatusForbidden {
		t.Fatalf("mapErr ErrTicketForbidden = %d, attendu 403", wForb.Code)
	}
}
