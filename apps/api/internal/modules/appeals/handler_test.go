package appeals

// =====================================================================
// 🧪 Tests HTTP & service du module appeals (sans Docker requis)
// =====================================================================
// Simule abuse.SignalDB en mémoire afin de couvrir tous les chemins du
// handler et du service (auth, validations, erreurs métier, isolation).
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
	"github.com/qoefi/api/internal/abuse"
	"github.com/qoefi/api/internal/middleware"
)

// ─── Double mémoire de abuse.SignalDB ──────────────────────────────────

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
		case *[]string:
			*dst = v.([]string)
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
		case *int:
			*dst = v.(int)
		default:
			return fmt.Errorf("assignValues: type destination non géré %T", d)
		}
	}
	return nil
}

type storedAppeal struct {
	id          string
	subjectType string
	subjectID   string
	decisionID  *string
	openedBy    string
	status      string
	outcome     *string
	staffNote   string
	decidedBy   *string
	decidedAt   *time.Time
	createdAt   time.Time
	messages    []storedAppealMsg
}

type storedAppealMsg struct {
	id        string
	authorID  string
	body      string
	createdAt time.Time
}

type fakeAppealDB struct {
	decisions map[string]string // userID -> decisionID (si absent : aucune décision)
	appeals   map[string]*storedAppeal
	order     []string
	nextSeq   int
	queryErr  error
	execErr   error
}

func newFakeAppealDB() *fakeAppealDB {
	return &fakeAppealDB{
		decisions: map[string]string{},
		appeals:   map[string]*storedAppeal{},
	}
}

func (f *fakeAppealDB) Exec(_ context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	if f.execErr != nil {
		return pgconn.CommandTag{}, f.execErr
	}
	if strings.Contains(sql, `INSERT INTO "AppealMessage"`) {
		appealID := args[0].(string)
		authorID := args[1].(string)
		body := args[2].(string)
		now := args[3].(time.Time)
		a, ok := f.appeals[appealID]
		if !ok {
			return pgconn.CommandTag{}, pgx.ErrNoRows
		}
		f.nextSeq++
		a.messages = append(a.messages, storedAppealMsg{
			id:        fmt.Sprintf("msg-%d", f.nextSeq),
			authorID:  authorID,
			body:      body,
			createdAt: now,
		})
	}
	return pgconn.CommandTag{}, nil
}

func (f *fakeAppealDB) Query(_ context.Context, sql string, args ...any) (pgx.Rows, error) {
	if f.queryErr != nil {
		return nil, f.queryErr
	}
	if strings.Contains(sql, `FROM "AppealMessage"`) {
		appealID := args[0].(string)
		a, ok := f.appeals[appealID]
		if !ok {
			return &memRows{}, nil
		}
		var rows [][]any
		for _, m := range a.messages {
			rows = append(rows, []any{m.id, m.authorID, m.body, m.createdAt})
		}
		return &memRows{rows: rows}, nil
	}
	if strings.Contains(sql, `FROM "Appeal" WHERE "openedBy"`) {
		uid := args[0].(string)
		var matched []*storedAppeal
		for _, id := range f.order {
			if a := f.appeals[id]; a != nil && a.openedBy == uid {
				matched = append(matched, a)
			}
		}
		total := len(matched)
		var rows [][]any
		for _, a := range matched {
			rows = append(rows, []any{
				a.id, a.subjectType, a.subjectID, a.decisionID, a.openedBy,
				a.status, a.outcome, a.staffNote, a.decidedBy, a.decidedAt, a.createdAt, total,
			})
		}
		return &memRows{rows: rows}, nil
	}
	return &memRows{}, nil
}

func (f *fakeAppealDB) QueryRow(_ context.Context, sql string, args ...any) pgx.Row {
	if strings.Contains(sql, `FROM "RiskDecision"`) {
		subjectID := args[1].(string)
		decID, ok := f.decisions[subjectID]
		if !ok {
			return memRow{err: pgx.ErrNoRows}
		}
		return memRow{vals: []any{decID, "suspend", []string{"abuse:spam"}}}
	}
	if strings.Contains(sql, `INSERT INTO "Appeal"`) {
		subjectType := args[0].(string)
		subjectID := args[1].(string)
		decisionID := args[2].(string)
		openedBy := args[3].(string)
		now := args[4].(time.Time)

		for _, a := range f.appeals {
			if a.subjectType == subjectType && a.subjectID == subjectID && a.openedBy == openedBy && a.status != abuse.AppealDecided {
				return memRow{err: &pgconn.PgError{Code: "23505"}}
			}
		}
		f.nextSeq++
		id := fmt.Sprintf("appeal-%d", f.nextSeq)
		dec := decisionID
		f.appeals[id] = &storedAppeal{
			id:          id,
			subjectType: subjectType,
			subjectID:   subjectID,
			decisionID:  &dec,
			openedBy:    openedBy,
			status:      abuse.AppealOpen,
			createdAt:   now,
		}
		f.order = append(f.order, id)
		return memRow{vals: []any{id}}
	}
	if strings.Contains(sql, `FROM "Appeal" WHERE "id"`) {
		id := args[0].(string)
		a, ok := f.appeals[id]
		if !ok {
			return memRow{err: pgx.ErrNoRows}
		}
		return memRow{vals: []any{
			a.id, a.subjectType, a.subjectID, a.decisionID, a.openedBy,
			a.status, a.outcome, a.staffNote, a.decidedBy, a.decidedAt, a.createdAt,
		}}
	}
	return memRow{err: pgx.ErrNoRows}
}

// ─── Helpers HTTP ──────────────────────────────────────────────────────

func newTestRouter(svc *Service, userID string) *chi.Mux {
	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			if userID != "" {
				req = req.WithContext(context.WithValue(req.Context(), middleware.UserIDKey, userID))
			}
			next.ServeHTTP(w, req)
		})
	})
	NewHandler(svc).RegisterProtected(r)
	return r
}

func doAppealReq(r *chi.Mux, method, path, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

// ─── Tests ─────────────────────────────────────────────────────────────

func TestAppeals_NilPool_NoPanic(t *testing.T) {
	svc := NewService(nil)
	svc.SetTrustService(nil)
	r := newTestRouter(svc, "u-nil")

	wList := doAppealReq(r, http.MethodGet, "/v1/appeals", "")
	if wList.Code != http.StatusOK {
		t.Fatalf("GET /v1/appeals nil pool = %d, attendu 200 (%s)", wList.Code, wList.Body.String())
	}
	var listed struct {
		Items []abuse.Appeal `json:"items"`
		Total int            `json:"total"`
	}
	if err := json.Unmarshal(wList.Body.Bytes(), &listed); err != nil {
		t.Fatalf("unmarshal list: %v", err)
	}
	if listed.Total != 0 || len(listed.Items) != 0 {
		t.Fatalf("attendu items=[], total=0, obtenu %+v", listed)
	}

	wOpen := doAppealReq(r, http.MethodPost, "/v1/appeals", `{"subjectType":"user","subjectId":"u-nil","message":"bonjour"}`)
	if wOpen.Code != http.StatusInternalServerError {
		t.Fatalf("POST /v1/appeals nil pool = %d, attendu 500", wOpen.Code)
	}

	wGet := doAppealReq(r, http.MethodGet, "/v1/appeals/x", "")
	if wGet.Code != http.StatusInternalServerError {
		t.Fatalf("GET /v1/appeals/x nil pool = %d, attendu 500", wGet.Code)
	}
}

func TestAppeals_Unauthenticated(t *testing.T) {
	r := newTestRouter(NewServiceWithDB(newFakeAppealDB()), "")
	routes := [][2]string{
		{http.MethodGet, "/v1/appeals"},
		{http.MethodPost, "/v1/appeals"},
		{http.MethodGet, "/v1/appeals/a1"},
		{http.MethodPost, "/v1/appeals/a1/messages"},
	}
	for _, rt := range routes {
		w := doAppealReq(r, rt[0], rt[1], `{}`)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("%s %s anonyme = %d, attendu 401", rt[0], rt[1], w.Code)
		}
	}
}

func TestAppeals_Open(t *testing.T) {
	db := newFakeAppealDB()
	db.decisions["u1"] = "dec-1"
	r := newTestRouter(NewServiceWithDB(db), "u1")

	// JSON malformé → 400.
	if w := doAppealReq(r, http.MethodPost, "/v1/appeals", "{"); w.Code != http.StatusBadRequest {
		t.Fatalf("JSON invalide = %d, attendu 400", w.Code)
	}
	// subjectType ou subjectId vide → 400.
	if w := doAppealReq(r, http.MethodPost, "/v1/appeals", `{"subjectType":"","subjectId":"u1","message":"x"}`); w.Code != http.StatusBadRequest {
		t.Fatalf("subjectType vide = %d, attendu 400", w.Code)
	}
	// Contestation pour autrui ou type invalide → 403.
	if w := doAppealReq(r, http.MethodPost, "/v1/appeals", `{"subjectType":"user","subjectId":"u2","message":"x"}`); w.Code != http.StatusForbidden {
		t.Fatalf("autrui = %d, attendu 403", w.Code)
	}
	if w := doAppealReq(r, http.MethodPost, "/v1/appeals", `{"subjectType":"article","subjectId":"u1","message":"x"}`); w.Code != http.StatusForbidden {
		t.Fatalf("type invalide = %d, attendu 403", w.Code)
	}
	// Message vide → 400 (ErrInvalidAppeal).
	if w := doAppealReq(r, http.MethodPost, "/v1/appeals", `{"subjectType":"user","subjectId":"u1","message":"   "}`); w.Code != http.StatusBadRequest {
		t.Fatalf("message vide = %d, attendu 400 (%s)", w.Code, w.Body.String())
	}
	// Aucun verdict contestable → 404 (ErrNothingToAppeal).
	rNoDec := newTestRouter(NewServiceWithDB(db), "u-sans-decision")
	if w := doAppealReq(rNoDec, http.MethodPost, "/v1/appeals", `{"subjectType":"user","subjectId":"u-sans-decision","message":"faux positif"}`); w.Code != http.StatusNotFound {
		t.Fatalf("sans décision = %d, attendu 404 (%s)", w.Code, w.Body.String())
	}
	// Ouverture valide → 200.
	w := doAppealReq(r, http.MethodPost, "/v1/appeals", `{"subjectType":"user","subjectId":"u1","message":"Mon compte a été suspendu par erreur."}`)
	if w.Code != http.StatusOK {
		t.Fatalf("ouverture valide = %d, attendu 200 (%s)", w.Code, w.Body.String())
	}
	var opened abuse.Appeal
	if err := json.Unmarshal(w.Body.Bytes(), &opened); err != nil {
		t.Fatalf("unmarshal opened: %v", err)
	}
	if opened.ID == "" || opened.Status != abuse.AppealOpen || len(opened.Messages) != 1 {
		t.Fatalf("recours ouvert inattendu: %+v", opened)
	}
	// Recours déjà ouvert → 409 (ErrAppealAlreadyOpen).
	if wDup := doAppealReq(r, http.MethodPost, "/v1/appeals", `{"subjectType":"user","subjectId":"u1","message":"doublon"}`); wDup.Code != http.StatusConflict {
		t.Fatalf("doublon = %d, attendu 409 (%s)", wDup.Code, wDup.Body.String())
	}
}

func TestAppeals_List(t *testing.T) {
	db := newFakeAppealDB()
	db.decisions["u1"] = "dec-1"
	svc := NewServiceWithDB(db)
	r := newTestRouter(svc, "u1")

	if _, err := svc.OpenAppeal(context.Background(), "u1", abuse.SubjectUser, "u1", "Contestation"); err != nil {
		t.Fatalf("seed open: %v", err)
	}

	w := doAppealReq(r, http.MethodGet, "/v1/appeals?limit=10&offset=-5", "")
	if w.Code != http.StatusOK {
		t.Fatalf("list = %d, attendu 200 (%s)", w.Code, w.Body.String())
	}
	var resp struct {
		Items []abuse.Appeal `json:"items"`
		Total int            `json:"total"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal list: %v", err)
	}
	if resp.Total != 1 || len(resp.Items) != 1 {
		t.Fatalf("attendu 1 recours, obtenu %+v", resp)
	}

	db.queryErr = errors.New("db down")
	if wErr := doAppealReq(r, http.MethodGet, "/v1/appeals", ""); wErr.Code != http.StatusInternalServerError {
		t.Fatalf("list err DB = %d, attendu 500", wErr.Code)
	}
}

func TestAppeals_Detail(t *testing.T) {
	db := newFakeAppealDB()
	decidedAt := time.Now().UTC()
	decider := "staff-1"
	outcome := abuse.AppealUpheld
	db.appeals["a-u1"] = &storedAppeal{
		id:          "a-u1",
		subjectType: abuse.SubjectUser,
		subjectID:   "u1",
		openedBy:    "u1",
		status:      abuse.AppealDecided,
		outcome:     &outcome,
		decidedBy:   &decider,
		decidedAt:   &decidedAt,
		createdAt:   decidedAt.Add(-time.Hour),
	}
	db.appeals["a-u2"] = &storedAppeal{
		id:          "a-u2",
		subjectType: abuse.SubjectUser,
		subjectID:   "u2",
		openedBy:    "u2",
		status:      abuse.AppealOpen,
		createdAt:   decidedAt,
	}

	r := newTestRouter(NewServiceWithDB(db), "u1")

	if w := doAppealReq(r, http.MethodGet, "/v1/appeals/inconnu", ""); w.Code != http.StatusNotFound {
		t.Fatalf("inconnu = %d, attendu 404", w.Code)
	}
	if w := doAppealReq(r, http.MethodGet, "/v1/appeals/a-u2", ""); w.Code != http.StatusNotFound {
		t.Fatalf("dossier d'autrui = %d, attendu 404 (zéro fuite)", w.Code)
	}
	w := doAppealReq(r, http.MethodGet, "/v1/appeals/a-u1", "")
	if w.Code != http.StatusOK {
		t.Fatalf("dossier propre = %d, attendu 200 (%s)", w.Code, w.Body.String())
	}
	var got abuse.Appeal
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("unmarshal detail: %v", err)
	}
	if got.ID != "a-u1" || got.DecidedAt == nil {
		t.Fatalf("détail inattendu: %+v", got)
	}
}

func TestAppeals_AddMessage(t *testing.T) {
	db := newFakeAppealDB()
	now := time.Now().UTC()
	db.appeals["a-open"] = &storedAppeal{
		id:          "a-open",
		subjectType: abuse.SubjectUser,
		subjectID:   "u1",
		openedBy:    "u1",
		status:      abuse.AppealOpen,
		createdAt:   now,
	}
	db.appeals["a-closed"] = &storedAppeal{
		id:          "a-closed",
		subjectType: abuse.SubjectUser,
		subjectID:   "u1",
		openedBy:    "u1",
		status:      abuse.AppealDecided,
		createdAt:   now,
	}
	db.appeals["a-other"] = &storedAppeal{
		id:          "a-other",
		subjectType: abuse.SubjectUser,
		subjectID:   "u2",
		openedBy:    "u2",
		status:      abuse.AppealOpen,
		createdAt:   now,
	}

	r := newTestRouter(NewServiceWithDB(db), "u1")

	if w := doAppealReq(r, http.MethodPost, "/v1/appeals/a-open/messages", "{"); w.Code != http.StatusBadRequest {
		t.Fatalf("JSON invalide = %d, attendu 400", w.Code)
	}
	if w := doAppealReq(r, http.MethodPost, "/v1/appeals/a-open/messages", `{"body":""}`); w.Code != http.StatusBadRequest {
		t.Fatalf("body vide = %d, attendu 400", w.Code)
	}
	if w := doAppealReq(r, http.MethodPost, "/v1/appeals/a-other/messages", `{"body":"coucou"}`); w.Code != http.StatusNotFound {
		t.Fatalf("dossier d'autrui = %d, attendu 404", w.Code)
	}
	if w := doAppealReq(r, http.MethodPost, "/v1/appeals/a-closed/messages", `{"body":"complément"}`); w.Code != http.StatusGone {
		t.Fatalf("dossier clos = %d, attendu 410 (%s)", w.Code, w.Body.String())
	}

	w := doAppealReq(r, http.MethodPost, "/v1/appeals/a-open/messages", `{"body":"Voici la pièce justificative."}`)
	if w.Code != http.StatusOK {
		t.Fatalf("ajout valide = %d, attendu 200 (%s)", w.Code, w.Body.String())
	}
	var got abuse.Appeal
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("unmarshal addMessage: %v", err)
	}
	if len(got.Messages) != 1 || got.Messages[0].Body != "Voici la pièce justificative." {
		t.Fatalf("messages inattendus: %+v", got.Messages)
	}
}
