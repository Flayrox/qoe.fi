package admin

// =====================================================================
// 🤝 Quorum N3 : la double validation, prouvée de bout en bout (Phase 8)
// =====================================================================
// Quatre règles, éprouvées sur la base RÉELLE et sur les routes réellement
// montées (admin + légal + registre des validations, comme cmd/server) :
//
//   1. un acte N3 n'est pas exercé sans l'approbation d'une SECONDE personne
//      distincte — la publication juridique reste refusée (`needs_review`) et
//      le texte ne passe pas PUBLISHED ;
//   2. l'auteur de la demande ne peut pas s'auto-approuver ;
//   3. une approbation expirée ou déjà consommée ne vaut rien ;
//   4. chaque refus laisse une trace : décision d'accès pour le garde, entrée
//      d'audit (avec le motif) pour la demande et la décision.
//
// Le garde est monté SANS politique d'application : il est donc en observation,
// comme la console en production tant que le flag `authz-enforce` est éteint.
// C'est voulu : le quorum ne doit pas dépendre d'un interrupteur.
// =====================================================================

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/qoefi/api/internal/adminauthz"
	"github.com/qoefi/api/internal/authz"
	"github.com/qoefi/api/internal/modules/legal"
)

// adminSecondID : le SECOND administrateur — la personne distincte que le
// quorum exige. Sans elle, « double validation » ne serait qu'un clic de plus.
const adminSecondID = "00000000-0000-0000-0000-0000000000a4"

// capLookup : capacités en mémoire, sans politique d'application (le garde
// reste en observation). Un identifiant absent ne détient rien.
type capLookup map[string]adminauthz.Set

func (l capLookup) Access(_ context.Context, userID string) (adminauthz.Access, error) {
	caps, ok := l[userID]
	if !ok {
		return adminauthz.Access{UserID: userID, Capabilities: adminauthz.Set{}}, nil
	}
	return adminauthz.Access{UserID: userID, Roles: []string{adminauthz.RoleSuperadmin}, Capabilities: caps}, nil
}

// quorumConsole monte admin + légal exactement comme cmd/server : registre
// partagé, registre des validations branché sur le module qui commet l'acte,
// journal des décisions. Rien n'est simulé : ce sont les routes de production.
func quorumConsole(t *testing.T, caps capLookup, observer adminauthz.Observer) *chi.Mux {
	t.Helper()
	if poolTest == nil {
		t.Skip("DB indisponible (Docker/testcontainers requis)")
	}
	r := chi.NewRouter()
	console := adminauthz.NewConsole(r, caps, nil, adminauthz.WithObserver(observer))

	adminSvc := NewService(poolTest)
	adminSvc.SetAccessLookup(caps)
	h := NewHandler(adminSvc)
	h.SetConsole(console)
	h.Register(r)

	legalHandler := legal.NewHandler(legal.NewService(poolTest))
	legalHandler.SetApprovals(adminSvc)
	legalHandler.SetConsole(console)
	legalHandler.RegisterAdmin(r)
	return r
}

// quorumCaps : deux administrateurs qui détiennent tout, un compte qui ne
// détient rien.
func quorumCaps() capLookup {
	return capLookup{
		adminAdminID:  adminauthz.AllCapabilities(),
		adminSecondID: adminauthz.AllCapabilities(),
		adminReaderID: adminauthz.Set{},
	}
}

// seedQuorum pose deux administrateurs DISTINCTS (rôle legacy superadmin : la
// garde du service légal) et deux brouillons juridiques — deux cibles, pour
// vérifier qu'une approbation n'ouvre que la sienne.
func seedQuorum(t *testing.T) {
	t.Helper()
	requirePool(t)
	ctx := context.Background()
	if _, err := poolTest.Exec(ctx, `TRUNCATE TABLE
		"AdminApproval", "AdminAuditLog", "AdminAuthzDecision",
		"legal_document_version", "legal_document", "User" CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	users := []struct{ id, email, username, role string }{
		{adminAdminID, "quorum-a@test.dev", "quoruma", "superadmin"},
		{adminSecondID, "quorum-b@test.dev", "quorumb", "superadmin"},
		{adminReaderID, "quorum-r@test.dev", "quorumr", "user"},
	}
	for _, u := range users {
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
			 VALUES ($1, $2, $3, $3, $4, now(), now())`,
			u.id, u.email, u.username, u.role); err != nil {
			t.Fatalf("user %s: %v", u.username, err)
		}
	}
	if _, err := poolTest.Exec(ctx,
		`INSERT INTO "legal_document" (id, slug, category, audience, is_active, sort_order)
		 VALUES ('ldoc_q', 'quorum-cgu', 'legal', 'all', true, 100)`); err != nil {
		t.Fatalf("document: %v", err)
	}
	for _, v := range []string{"lver_q1", "lver_q2"} {
		if _, err := poolTest.Exec(ctx,
			`INSERT INTO "legal_document_version" (id, document_id, locale, version, title, body, status, created_by)
			 VALUES ($1, 'ldoc_q', 'fr', $2, 'CGU', 'Texte opposable', 'DRAFT', $3)`,
			v, v, adminAdminID); err != nil {
			t.Fatalf("version %s: %v", v, err)
		}
	}
}

// quorumHTTP : les trois gestes du protocole, sur les routes réelles.
type quorumHTTP struct{ r http.Handler }

func (q quorumHTTP) publish(user, version string) *httptest.ResponseRecorder {
	return do(q.r, http.MethodPost, "/v1/admin/legal/versions/"+version+"/publish", user, "")
}

func (q quorumHTTP) request(user, version, reason string) *httptest.ResponseRecorder {
	return do(q.r, http.MethodPost, "/v1/admin/legal/versions/"+version+"/request-publish", user,
		`{"reason":`+strconv.Quote(reason)+`}`)
}

func (q quorumHTTP) decide(user, id, decision string) *httptest.ResponseRecorder {
	return do(q.r, http.MethodPost, "/v1/admin/approvals/"+id+"/decide", user,
		`{"decision":"`+decision+`"}`)
}

// decodeApproval lit une demande de validation renvoyée par l'API.
func decodeApproval(t *testing.T, w *httptest.ResponseRecorder) adminauthz.ApprovalRequest {
	t.Helper()
	var out adminauthz.ApprovalRequest
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("json: %v (%s)", err, w.Body.String())
	}
	return out
}

func versionStatus(t *testing.T, id string) string {
	t.Helper()
	var status string
	if err := poolTest.QueryRow(context.Background(),
		`SELECT status FROM "legal_document_version" WHERE id = $1`, id).Scan(&status); err != nil {
		t.Fatalf("statut de %s: %v", id, err)
	}
	return status
}

func approvalStatus(t *testing.T, id string) string {
	t.Helper()
	var status string
	if err := poolTest.QueryRow(context.Background(),
		`SELECT status FROM "AdminApproval" WHERE id = $1`, id).Scan(&status); err != nil {
		t.Fatalf("statut de %s: %v", id, err)
	}
	return status
}

// ─── 1. Le quorum, de la demande à l'acte ─────────────────────────────

func TestQuorum_PublishNeedsSecondDistinctApproval(t *testing.T) {
	seedQuorum(t)
	q := quorumHTTP{quorumConsole(t, quorumCaps(), nil)}

	// Sans approbation, l'acte N3 n'est pas exercé — et le texte ne bouge pas.
	w := q.publish(adminAdminID, "lver_q1")
	if w.Code != http.StatusForbidden || w.Header().Get("X-Qoe-Authz-Code") != string(authz.CodeNeedsReview) {
		t.Fatalf("publication sans quorum = %d %s, attendu 403 needs_review", w.Code, w.Body.String())
	}
	if got := versionStatus(t, "lver_q1"); got != "DRAFT" {
		t.Fatalf("statut après refus = %q, attendu DRAFT : l'acte a été exercé sans quorum", got)
	}

	// Demander la validation : motif obligatoire (le journal doit rester
	// relisible) et capacité de l'acte requise.
	if w := q.request(adminAdminID, "lver_q1", "ok"); w.Code != http.StatusBadRequest {
		t.Fatalf("demande sans motif = %d %s, attendu 400", w.Code, w.Body.String())
	}
	if w := q.request(adminReaderID, "lver_q1", "mise à jour des CGU"); w.Code != http.StatusForbidden {
		t.Fatalf("demande par un compte sans capacité = %d %s, attendu 403", w.Code, w.Body.String())
	}
	w = q.request(adminAdminID, "lver_q1", "mise à jour des CGU validée par le juriste")
	if w.Code != http.StatusCreated {
		t.Fatalf("demande = %d %s, attendu 201", w.Code, w.Body.String())
	}
	pending := decodeApproval(t, w)
	if pending.Status != "pending" || pending.Act != string(authz.ActionLegalPublish) || pending.Target != "lver_q1" {
		t.Fatalf("demande = %+v, attendu pending sur legal_publish/lver_q1", pending)
	}
	// Rejouer la demande ne remplit pas la file de doublons indésirables.
	if again := decodeApproval(t, q.request(adminAdminID, "lver_q1", "autre motif tout aussi valable")); again.ID != pending.ID {
		t.Fatalf("demande non idempotente : %s puis %s", pending.ID, again.ID)
	}

	// L'auteur ne s'auto-approuve pas, et une demande en attente n'ouvre rien.
	if w := q.decide(adminAdminID, pending.ID, "approved"); w.Code != http.StatusForbidden {
		t.Fatalf("auto-validation = %d %s, attendu 403", w.Code, w.Body.String())
	}
	if w := q.publish(adminAdminID, "lver_q1"); w.Code != http.StatusForbidden {
		t.Fatalf("publication sur demande non approuvée = %d, attendu 403", w.Code)
	}

	// La seconde personne approuve… pour SA cible : la version voisine reste
	// fermée (une approbation n'est jamais « en gros »).
	if w := q.decide(adminSecondID, pending.ID, "approved"); w.Code != http.StatusOK {
		t.Fatalf("validation par le second = %d %s, attendu 200", w.Code, w.Body.String())
	}
	if w := q.publish(adminAdminID, "lver_q2"); w.Code != http.StatusForbidden ||
		w.Header().Get("X-Qoe-Authz-Code") != string(authz.CodeNeedsReview) {
		t.Fatalf("publication d'une AUTRE version = %d (%s), attendu 403 needs_review", w.Code, w.Body.String())
	}

	// La version visée s'ouvre, et l'approbation est consommée aussitôt.
	if w := q.publish(adminAdminID, "lver_q1"); w.Code != http.StatusOK {
		t.Fatalf("publication approuvée = %d %s, attendu 200", w.Code, w.Body.String())
	}
	if got := versionStatus(t, "lver_q1"); got != "PUBLISHED" {
		t.Fatalf("statut après publication = %q, attendu PUBLISHED", got)
	}
	if got := approvalStatus(t, pending.ID); got != "consumed" {
		t.Fatalf("approbation = %q, attendu consumed : elle pourrait resservir", got)
	}
	// Consommée : la demande suivante est une NOUVELLE demande, pas la même.
	fresh := decodeApproval(t, q.request(adminAdminID, "lver_q1", "seconde édition du même texte"))
	if fresh.ID == pending.ID || fresh.Status != "pending" {
		t.Fatalf("après consommation, demande = %+v (attendu une nouvelle demande pending)", fresh)
	}
}

// ─── 2. Règles du service, sans HTTP ───────────────────────────────────

func TestQuorum_ServiceRules(t *testing.T) {
	seedQuorum(t)
	svc := NewService(poolTest)
	svc.SetAccessLookup(quorumCaps())
	ctx := context.Background()

	if _, err := svc.RequestApproval(ctx, adminAdminID, authz.Action("acte_inexistant"), "cible", "motif valable"); !errors.Is(err, ErrApprovalUnknownAct) {
		t.Errorf("acte inconnu = %v, attendu ErrApprovalUnknownAct", err)
	}

	created, err := svc.RequestApproval(ctx, adminAdminID, authz.ActionLegalPublish, "lver_q1", "publication urgente des CGU")
	if err != nil {
		t.Fatalf("demande: %v", err)
	}
	if svc.CheckApproval(ctx, adminAdminID, authz.ActionLegalPublish, "lver_q1") {
		t.Fatal("une demande en attente ne prouve rien : CheckApproval doit refuser")
	}

	// Les façons de dire NON. Chaque ligne est une règle du contrat : si l'une
	// cesse de refuser, le quorum n'en est plus un. Elles s'exercent contre une
	// demande réellement en attente, c'est-à-dire dans l'état où la tentation
	// existe.
	for _, tc := range []struct {
		name string
		call func(id string) error
		want error
	}{
		{"motif trop court", func(string) error {
			_, err := svc.RequestApproval(ctx, adminAdminID, authz.ActionLegalPublish, "lver_q1", "trop")
			return err
		}, ErrApprovalReason},
		{"demande sans capacité", func(string) error {
			_, err := svc.RequestApproval(ctx, adminReaderID, authz.ActionLegalPublish, "lver_q1", "motif valable")
			return err
		}, ErrApprovalForbidden},
		{"file lue hors console", func(string) error {
			_, err := svc.PendingApprovals(ctx, adminReaderID, 10)
			return err
		}, ErrApprovalForbidden},
		{"validation sans capacité", func(id string) error {
			_, err := svc.DecideApproval(ctx, adminReaderID, id, "approved", "")
			return err
		}, ErrApprovalForbidden},
		{"auto-validation", func(id string) error {
			_, err := svc.DecideApproval(ctx, adminAdminID, id, "approved", "")
			return err
		}, ErrApprovalSelf},
		{"décision invalide", func(id string) error {
			_, err := svc.DecideApproval(ctx, adminSecondID, id, "peut-être", "")
			return err
		}, errInvalidAction},
	} {
		if err := tc.call(created.ID); !errors.Is(err, tc.want) {
			t.Errorf("%s = %v, attendu %v", tc.name, err, tc.want)
		}
	}
	if _, err := svc.DecideApproval(ctx, adminSecondID, created.ID, "approved", "relu par le juriste"); err != nil {
		t.Fatalf("validation: %v", err)
	}
	if !svc.CheckApproval(ctx, adminAdminID, authz.ActionLegalPublish, "lver_q1") {
		t.Fatal("approbation valide non vue par le garde")
	}
	// Une approbation n'ouvre ni un autre acte ni une autre cible.
	if svc.CheckApproval(ctx, adminAdminID, authz.ActionStaffHighImpact, "lver_q1") ||
		svc.CheckApproval(ctx, adminAdminID, authz.ActionLegalPublish, "lver_q2") {
		t.Fatal("l'approbation a débordé de son acte ou de sa cible")
	}
	if _, err := svc.DecideApproval(ctx, adminSecondID, created.ID, "approved", ""); !errors.Is(err, ErrApprovalClosed) {
		t.Errorf("rejouer une décision = %v, attendu ErrApprovalClosed", err)
	}
	if err := svc.ConsumeApproval(ctx, adminAdminID, authz.ActionLegalPublish, "lver_q1"); err != nil {
		t.Fatalf("consommation: %v", err)
	}
	if got := approvalStatus(t, created.ID); got != "consumed" {
		t.Errorf("statut = %q, attendu consumed", got)
	}
	if svc.CheckApproval(ctx, adminAdminID, authz.ActionLegalPublish, "lver_q1") {
		t.Fatal("une approbation consommée ne vaut plus rien")
	}

	// Le rejet ne laisse aucun pouvoir, et il est audité avec son motif.
	rejected, err := svc.RequestApproval(ctx, adminAdminID, authz.ActionLegalPublish, "lver_q2", "seconde tentative sur l'autre version")
	if err != nil {
		t.Fatalf("demande: %v", err)
	}
	if _, err := svc.DecideApproval(ctx, adminSecondID, rejected.ID, "rejected", "texte pas prêt"); err != nil {
		t.Fatalf("rejet: %v", err)
	}
	if svc.CheckApproval(ctx, adminAdminID, authz.ActionLegalPublish, "lver_q2") {
		t.Fatal("un rejet ne vaut pas approbation")
	}
	assertApprovalAudit(t, adminAdminID, "approval.request", rejected.ID)
	assertApprovalAudit(t, adminSecondID, "approval.rejected", rejected.ID)
}

// assertApprovalAudit vérifie qu'un acte du cycle de vie du quorum a laissé sa
// trace, avec son motif : une validation à deux qui ne s'écrit pas n'en est pas
// une.
func assertApprovalAudit(t *testing.T, actorID, action, approvalID string) {
	t.Helper()
	var (
		count  int
		reason string
	)
	if err := poolTest.QueryRow(context.Background(), `
		SELECT count(*), coalesce(max("reason"), '') FROM "AdminAuditLog"
		 WHERE "actorId" = $1::uuid AND "action" = $2 AND "targetType" = 'admin_approval'
		   AND "targetId" = $3`, actorID, action, approvalID).Scan(&count, &reason); err != nil {
		t.Fatalf("audit %s: %v", action, err)
	}
	if count == 0 {
		t.Fatalf("aucune trace d'audit pour %s (acteur %s, demande %s)", action, actorID, approvalID)
	}
	if reason == "" {
		t.Fatalf("trace d'audit %s sans motif : impossible de relire POURQUOI", action)
	}
}

// expireApproval recule la fenêtre d'une demande en base : l'API ne crée que
// des demandes de 72 h, et la contrainte `expiresAt > createdAt` interdit de
// reculer la seule échéance. On recule donc la naissance ET l'échéance, ce qui
// reproduit exactement une demande laissée en attente trois jours.
func expireApproval(t *testing.T, id string) {
	t.Helper()
	if _, err := poolTest.Exec(context.Background(), `
		UPDATE "AdminApproval"
		   SET "createdAt" = CURRENT_TIMESTAMP - interval '3 days',
		       "expiresAt" = CURRENT_TIMESTAMP - interval '1 minute'
		 WHERE id = $1`, id); err != nil {
		t.Fatalf("péremption: %v", err)
	}
}

// ─── 3. Expiration : le temps rend une approbation sans valeur ─────────

func TestQuorum_ExpiredApprovalIsWorthless(t *testing.T) {
	seedQuorum(t)
	svc := NewService(poolTest)
	svc.SetAccessLookup(quorumCaps())
	ctx := context.Background()

	approved, err := svc.RequestApproval(ctx, adminAdminID, authz.ActionLegalPublish, "lver_q1", "publication à valider")
	if err != nil {
		t.Fatalf("demande: %v", err)
	}
	if _, err := svc.DecideApproval(ctx, adminSecondID, approved.ID, "approved", ""); err != nil {
		t.Fatalf("validation: %v", err)
	}
	// L'échéance ne se manipule pas par l'API (l'approbation naît avec 72 h) :
	// on la recule en base pour éprouver la frontière temporelle elle-même.
	expireApproval(t, approved.ID)
	if svc.CheckApproval(ctx, adminAdminID, authz.ActionLegalPublish, "lver_q1") {
		t.Fatal("une approbation expirée ouvre encore l'acte")
	}
	if err := svc.ConsumeApproval(ctx, adminAdminID, authz.ActionLegalPublish, "lver_q1"); err != nil {
		t.Fatalf("consommation d'une approbation expirée: %v", err)
	}
	if got := approvalStatus(t, approved.ID); got != "approved" {
		t.Fatalf("une approbation expirée a changé d'état (%q) : elle est censée ne plus rien valoir", got)
	}

	// Décider une demande déjà expirée est refusé : le temps a tranché avant.
	stale, err := svc.RequestApproval(ctx, adminAdminID, authz.ActionLegalPublish, "lver_q2", "demande qui va traîner")
	if err != nil {
		t.Fatalf("demande: %v", err)
	}
	expireApproval(t, stale.ID)
	if _, err := svc.DecideApproval(ctx, adminSecondID, stale.ID, "approved", ""); !errors.Is(err, ErrApprovalClosed) {
		t.Fatalf("décision sur demande expirée = %v, attendu ErrApprovalClosed", err)
	}
	// Et une demande expirée ne bloque pas la suivante : la personne peut
	// redemander (l'idempotence ne s'applique qu'à une demande VIVANTE).
	renewed, err := svc.RequestApproval(ctx, adminAdminID, authz.ActionLegalPublish, "lver_q2", "seconde demande, la première a expiré")
	if err != nil {
		t.Fatalf("seconde demande: %v", err)
	}
	if renewed.ID == stale.ID || renewed.Status != "pending" {
		t.Fatalf("après expiration, demande = %+v (attendu une nouvelle demande pending)", renewed)
	}
}

// ─── 4. Le refus laisse une trace dans les décisions d'accès ───────────

func TestQuorum_RefusalIsRecordedAsDecision(t *testing.T) {
	seedQuorum(t)
	rec := adminauthz.NewRecorder(poolTest)
	defer rec.Close()
	q := quorumHTTP{quorumConsole(t, quorumCaps(), rec.Observe)}

	if w := q.publish(adminAdminID, "lver_q1"); w.Code != http.StatusForbidden {
		t.Fatalf("publication sans quorum = %d, attendu 403", w.Code)
	}
	rec.Close() // vide le tampon avant de relire

	var (
		code       string
		capability string
		allowed    bool
		mode       string
	)
	if err := poolTest.QueryRow(context.Background(), `
		SELECT "code", "capability", "allowed", "mode" FROM "AdminAuthzDecision"
		 WHERE "path" = '/v1/admin/legal/versions/lver_q1/publish'
		 ORDER BY "createdAt" DESC LIMIT 1`).
		Scan(&code, &capability, &allowed, &mode); err != nil {
		t.Fatalf("décision non enregistrée: %v", err)
	}
	if code != string(authz.CodeNeedsReview) || allowed {
		t.Fatalf("décision = %s/allowed=%v, attendu needs_review refusé", code, allowed)
	}
	if capability != string(adminauthz.LegalWrite) {
		t.Errorf("capacité tracée = %q, attendu %q", capability, adminauthz.LegalWrite)
	}
	// Le refus a été APPLIQUÉ, même si la console est en observation : la trace
	// ne doit pas laisser croire à un avertissement.
	if mode != "enforce" {
		t.Errorf("mode tracé = %q, attendu enforce", mode)
	}
}

// ─── La file des validations est lisible, et ne déborde pas ────────────

func TestQuorum_PendingQueueListsDecisions(t *testing.T) {
	seedQuorum(t)
	q := quorumHTTP{quorumConsole(t, quorumCaps(), nil)}

	pending := decodeApproval(t, q.request(adminAdminID, "lver_q1", "première demande à valider"))
	decided := decodeApproval(t, q.request(adminSecondID, "lver_q2", "seconde demande à valider"))
	if w := q.decide(adminAdminID, decided.ID, "approved"); w.Code != http.StatusOK {
		t.Fatalf("validation = %d %s", w.Code, w.Body.String())
	}

	w := do(q.r, http.MethodGet, "/v1/admin/approvals", adminSecondID, "")
	if w.Code != http.StatusOK {
		t.Fatalf("file = %d %s", w.Code, w.Body.String())
	}
	var body struct {
		Items []adminauthz.ApprovalRequest `json:"items"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("json: %v (%s)", err, w.Body.String())
	}
	byID := map[string]adminauthz.ApprovalRequest{}
	for _, item := range body.Items {
		byID[item.ID] = item
	}
	if got, ok := byID[pending.ID]; !ok || got.Status != "pending" || got.ExpiresAt == "" {
		t.Fatalf("demande en attente absente ou incomplète : %+v", got)
	}
	if got, ok := byID[decided.ID]; !ok || got.Status != "approved" || got.DecidedBy != adminAdminID {
		t.Fatalf("décision absente ou incomplète : %+v", got)
	}
	// La file ne se lit pas depuis un compte hors console.
	if w := do(q.r, http.MethodGet, "/v1/admin/approvals", adminReaderID, ""); w.Code != http.StatusForbidden {
		t.Fatalf("file pour un compte hors console = %d, attendu 403", w.Code)
	}
}
