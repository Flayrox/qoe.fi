package adminauthz

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// ─── Doubles sans base : le seul moyen d'exercer la résolution ici ──────

const testUserID = "00000000-0000-0000-0000-0000000000c1"

// fakeRows rejoue une colonne de chaînes, une ligne à la fois.
type fakeRows struct {
	values []string
	i      int
	err    error
}

func (r *fakeRows) Close()                                       {}
func (r *fakeRows) Err() error                                   { return r.err }
func (r *fakeRows) CommandTag() pgconn.CommandTag                { return pgconn.CommandTag{} }
func (r *fakeRows) FieldDescriptions() []pgconn.FieldDescription { return nil }
func (r *fakeRows) Values() ([]any, error)                       { return nil, nil }
func (r *fakeRows) RawValues() [][]byte                          { return nil }
func (r *fakeRows) Conn() *pgx.Conn                              { return nil }

func (r *fakeRows) Next() bool {
	if r.i >= len(r.values) {
		return false
	}
	r.i++
	return true
}

func (r *fakeRows) Scan(dest ...any) error {
	if len(dest) != 1 {
		return fmt.Errorf("fakeRows: %d destinations, attendu 1", len(dest))
	}
	target, ok := dest[0].(*string)
	if !ok {
		return fmt.Errorf("fakeRows: destination %T, attendu *string", dest[0])
	}
	*target = r.values[r.i-1]
	return nil
}

// fakeDB répond aux deux requêtes du service selon leur texte (les capacités
// joignent AdminRoleCapability, les rôles non) et compte les appels.
type fakeDB struct {
	roles []string
	caps  []string
	err   error

	roleQueries int
	capQueries  int
}

func (f *fakeDB) Query(_ context.Context, sql string, _ ...any) (pgx.Rows, error) {
	if f.err != nil {
		return nil, f.err
	}
	if strings.Contains(sql, "AdminRoleCapability") {
		f.capQueries++
		return &fakeRows{values: f.caps}, nil
	}
	f.roleQueries++
	return &fakeRows{values: f.roles}, nil
}

func shortTTL(t *testing.T) {
	t.Helper()
	previous := cacheTTL
	cacheTTL = 30 * time.Millisecond
	t.Cleanup(func() { cacheTTL = previous })
}

// ─── Résolution ────────────────────────────────────────────────────────

func TestService_NonUUIDIsEmptyWithoutQuery(t *testing.T) {
	db := &fakeDB{}
	svc := NewService(db)

	for _, id := range []string{"", "not-a-uuid", "42"} {
		access, err := svc.Access(context.Background(), id)
		if err != nil {
			t.Fatalf("Access(%q) : %v", id, err)
		}
		if access.UserID != "" || !access.Capabilities.Empty() || len(access.Roles) != 0 {
			t.Fatalf("Access(%q) = %+v, attendu accès vide", id, access)
		}
	}
	if db.roleQueries != 0 || db.capQueries != 0 {
		t.Fatalf("accès vide a interrogé la base (%d/%d)", db.roleQueries, db.capQueries)
	}
}

func TestService_ResolvesRolesAndCapabilities(t *testing.T) {
	db := &fakeDB{
		roles: []string{RoleSupport},
		caps:  []string{string(SubscriptionsRead), string(SupportWrite), "admin.inconnue.read"},
	}
	access, err := NewService(db).Access(context.Background(), testUserID)
	if err != nil {
		t.Fatalf("Access : %v", err)
	}
	if access.UserID != testUserID {
		t.Errorf("UserID = %q", access.UserID)
	}
	if len(access.Roles) != 1 || access.Roles[0] != RoleSupport {
		t.Errorf("Roles = %v", access.Roles)
	}
	if !access.Has(SubscriptionsRead) || !access.Has(SupportWrite) {
		t.Errorf("capacités manquantes : %v", access.CapabilityKeys())
	}
	// Le vocabulaire Go est la source de vérité : une clé inconnue en base
	// n'accorde rien.
	if access.Has(Capability("admin.inconnue.read")) {
		t.Error("capacité inconnue accordée")
	}
	if len(access.CapabilityKeys()) != 2 {
		t.Errorf("capacités = %v, attendu 2", access.CapabilityKeys())
	}
	// Le support ne détient pas l'écriture des abonnements.
	if access.Has(SubscriptionsWrite) {
		t.Error("support détient admin.subscriptions.write")
	}
}

func TestService_LegacySuperadminHoldsEverything(t *testing.T) {
	// Le rôle vient de User."role" = 'superadmin' (requête des rôles), sans
	// ligne dans AdminRoleCapability : la promotion historique vaut tout.
	db := &fakeDB{roles: []string{RoleSuperadmin}}
	access, err := NewService(db).Access(context.Background(), testUserID)
	if err != nil {
		t.Fatalf("Access : %v", err)
	}
	if !access.IsSuperadmin() {
		t.Fatal("superadmin non reconnu")
	}
	if len(access.CapabilityKeys()) != len(Capabilities()) {
		t.Fatalf("superadmin = %d capacités, attendu %d", len(access.CapabilityKeys()), len(Capabilities()))
	}
	for _, c := range Capabilities() {
		if !access.Has(c) {
			t.Errorf("superadmin sans %q", c)
		}
	}
}

func TestService_CachesWithinTTL(t *testing.T) {
	db := &fakeDB{roles: []string{RoleSupport}, caps: []string{string(SupportRead)}}
	svc := NewService(db)

	for i := 0; i < 3; i++ {
		if _, err := svc.Access(context.Background(), testUserID); err != nil {
			t.Fatalf("Access #%d : %v", i, err)
		}
	}
	if db.roleQueries != 1 || db.capQueries != 1 {
		t.Fatalf("requêtes = %d/%d, attendu 1/1 (cache 30 s)", db.roleQueries, db.capQueries)
	}
}

func TestService_CacheExpiresAndInvalidateForgets(t *testing.T) {
	shortTTL(t)
	db := &fakeDB{roles: []string{RoleSupport}, caps: []string{string(SupportRead)}}
	svc := NewService(db)

	if _, err := svc.Access(context.Background(), testUserID); err != nil {
		t.Fatalf("Access : %v", err)
	}
	time.Sleep(50 * time.Millisecond)
	if _, err := svc.Access(context.Background(), testUserID); err != nil {
		t.Fatalf("Access après TTL : %v", err)
	}
	if db.roleQueries != 2 {
		t.Fatalf("relecture après TTL = %d, attendu 2", db.roleQueries)
	}

	// Invalidate : effet immédiat, sans attendre le TTL.
	svc.Invalidate(testUserID)
	db.roles = []string{RoleAnalyst}
	access, err := svc.Access(context.Background(), testUserID)
	if err != nil {
		t.Fatalf("Access après Invalidate : %v", err)
	}
	if db.roleQueries != 3 {
		t.Fatalf("relecture après Invalidate = %d, attendu 3", db.roleQueries)
	}
	if access.IsSuperadmin() || access.Roles[0] != RoleAnalyst {
		t.Fatalf("rôles périmés : %v", access.Roles)
	}
}

// TestService_CachedAccessIsIsolated — le cache ne doit pas partager son
// ensemble de capacités avec l'appelant : le modifier de l'extérieur changerait
// l'autorisation de tout le monde.
func TestService_CachedAccessIsIsolated(t *testing.T) {
	db := &fakeDB{roles: []string{RoleSupport}, caps: []string{string(SupportRead)}}
	svc := NewService(db)

	first, err := svc.Access(context.Background(), testUserID)
	if err != nil {
		t.Fatalf("Access : %v", err)
	}
	first.Capabilities[SubscriptionsWrite] = true
	first.Roles[0] = "sabotage"

	second, err := svc.Access(context.Background(), testUserID)
	if err != nil {
		t.Fatalf("Access : %v", err)
	}
	if second.Has(SubscriptionsWrite) {
		t.Fatal("le cache a été modifié par l'appelant")
	}
	if second.Roles[0] != RoleSupport {
		t.Fatalf("rôles du cache modifiés : %v", second.Roles)
	}
}

func TestService_DBErrorIsPropagated(t *testing.T) {
	boom := errors.New("db down")
	db := &fakeDB{err: boom}
	if _, err := NewService(db).Access(context.Background(), testUserID); !errors.Is(err, boom) {
		t.Fatalf("erreur = %v, attendu %v", err, boom)
	}
}

func TestService_SetDBAndInvalidateEdgeCases(t *testing.T) {
	svc := NewService(nil)
	// Pas de source : l'erreur est explicite, jamais un accès silencieux ni un
	// panic au milieu d'une requête.
	if _, err := svc.Access(context.Background(), testUserID); !errors.Is(err, ErrNoSource) {
		t.Fatalf("base absente : erreur = %v, attendu %v", err, ErrNoSource)
	}
	var nilSvc *Service
	if _, err := nilSvc.Access(context.Background(), testUserID); !errors.Is(err, ErrNoSource) {
		t.Fatalf("service nil : erreur = %v, attendu %v", err, ErrNoSource)
	}

	db := &fakeDB{roles: []string{RoleOps}, caps: []string{string(FlagsWrite)}}
	svc.SetDB(db)
	access, err := svc.Access(context.Background(), testUserID)
	if err != nil {
		t.Fatalf("Access : %v", err)
	}
	if !access.Has(FlagsWrite) {
		t.Fatalf("capacités = %v", access.CapabilityKeys())
	}
	// Invalidate sans identifiant est sans effet (pas de panique).
	svc.Invalidate("")
}

// ─── Politique d'application ──────────────────────────────────────────

func TestService_EnforceFollowsResolverAndDefaultsToObserve(t *testing.T) {
	svc := NewService(&fakeDB{})
	if svc.Enforce(context.Background()) {
		t.Fatal("sans resolver, le défaut doit être l'observation")
	}

	svc.SetModeResolver(func(context.Context) bool { return true })
	if !svc.Enforce(context.Background()) {
		t.Fatal("resolver à vrai ignoré")
	}
	svc.SetModeResolver(func(context.Context) bool { return false })
	if svc.Enforce(context.Background()) {
		t.Fatal("resolver à faux ignoré")
	}

	// Le service satisfait ModeResolver : le garde lit la politique dessus.
	var _ ModeResolver = svc
}
