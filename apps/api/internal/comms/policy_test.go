package comms

import (
	"testing"
)

var (
	newsletterPolicy = &MessageTypePolicy{Key: "creator.newsletter", Family: "newsletter", BaseRule: "opt_in"}
	securityPolicy   = &MessageTypePolicy{Key: "auth.code", Family: "security", BaseRule: "always"}
	legalPolicy      = &MessageTypePolicy{
		Key: "legal.version_notice", Family: "legal", BaseRule: "approval", StaffApproval: true,
	}
)

func checkedBulkInput() Input {
	return Input{
		MessageType: "creator.newsletter", Email: "a@b.fr", PublicationID: "pub",
		SuppressionChecked: true, BudgetChecked: true, BudgetAvailable: true,
		ApprovalChecked: true, ApprovalGranted: true,
	}
}

func TestEvaluate_AllowNominal(t *testing.T) {
	if v := Evaluate(newsletterPolicy, checkedBulkInput()); v.Decision != DecisionAllow || v.Reason != ReasonOK {
		t.Fatalf("nominal = %+v, attendu allow/ok", v)
	}
}

func TestEvaluate_UnknownTypeCancels(t *testing.T) {
	if v := Evaluate(nil, checkedBulkInput()); v.Decision != DecisionCancel {
		t.Fatalf("type inconnu = %+v : on n'envoie jamais une finalité non enregistrée", v)
	}
}

func TestEvaluate_SuppressionDefinitive(t *testing.T) {
	in := checkedBulkInput()
	in.SuppressedGlobal = true
	if v := Evaluate(newsletterPolicy, in); v.Decision != DecisionSuppress || v.Reason != ReasonSuppressedGlobal {
		t.Fatalf("opposition globale = %+v", v)
	}
	in = checkedBulkInput()
	in.SuppressedPublication = true
	if v := Evaluate(newsletterPolicy, in); v.Decision != DecisionSuppress || v.Reason != ReasonSuppressedPublisher {
		t.Fatalf("opposition publication = %+v", v)
	}
}

func TestEvaluate_SuppressionNotCheckedNeedsReview(t *testing.T) {
	// Opposition non consultée sur un envoi de liste : ni autoriser (aveugle),
	// ni supprimer (rien prouvé) — revue humaine.
	in := checkedBulkInput()
	in.SuppressionChecked = false
	if v := Evaluate(newsletterPolicy, in); v.Decision != DecisionNeedsReview {
		t.Fatalf("non consulté = %+v, attendu needs_review", v)
	}
}

func TestEvaluate_SecurityIgnoresNewsletterOpposition(t *testing.T) {
	// Un code d'auth part même si l'adresse est désinscrite de newsletters :
	// sinon, signaler les e-mails de quelqu'un verrouillerait son compte.
	in := Input{
		MessageType: "auth.code", Email: "a@b.fr",
		SuppressionChecked: true, SuppressedGlobal: true, SuppressedPublication: true,
	}
	if v := Evaluate(securityPolicy, in); v.Decision != DecisionAllow {
		t.Fatalf("sécurité bloquée par une opposition newsletter : %+v", v)
	}
	// ... mais une suspension explicite bloque tout, y compris la sécurité
	// (compte compromis : on ne renvoie pas de codes).
	in.Suspended = true
	if v := Evaluate(securityPolicy, in); v.Decision != DecisionCancel || v.Reason != ReasonSuspended {
		t.Fatalf("suspendu = %+v", v)
	}
}

func TestEvaluate_ApprovalRequired(t *testing.T) {
	in := Input{MessageType: "legal.version_notice", Email: "a@b.fr", SuppressionChecked: true}
	if v := Evaluate(legalPolicy, in); v.Decision != DecisionNeedsReview {
		t.Fatalf("sans vérification d'approbation = %+v", v)
	}
	in.ApprovalChecked = true
	if v := Evaluate(legalPolicy, in); v.Decision != DecisionCancel {
		t.Fatalf("approbation refusée = %+v, attendu cancel (pas de réessai aveugle)", v)
	}
	in.ApprovalGranted = true
	if v := Evaluate(legalPolicy, in); v.Decision != DecisionAllow {
		t.Fatalf("approuvé = %+v", v)
	}
}

func TestEvaluate_BudgetExhaustedDefers(t *testing.T) {
	in := checkedBulkInput()
	in.BudgetAvailable = false
	if v := Evaluate(newsletterPolicy, in); v.Decision != DecisionDefer || v.Reason != ReasonBudgetExhausted {
		t.Fatalf("budget épuisé = %+v, attendu defer (reprise possible, jamais dépassé)", v)
	}
}

func TestEmailKillEngaged_NilPoolDefaultsOpen(t *testing.T) {
	// Sans pool (tests purs, worker mal câblé) : défaut sûr documenté —
	// envois autorisés, jamais de blocage silencieux.
	if EmailKillEngaged(t.Context(), nil) {
		t.Fatal("pool nil devrait donner false (défaut sûr)")
	}
}

func TestRequiresSuppressionCheck(t *testing.T) {
	for _, family := range []string{"newsletter", "product", "event", "staff"} {
		if !(MessageTypePolicy{Family: family}.RequiresSuppressionCheck()) {
			t.Fatalf("famille %s devrait exiger la consultation", family)
		}
	}
	for _, family := range []string{"security", "service", "legal"} {
		if (MessageTypePolicy{Family: family}.RequiresSuppressionCheck()) {
			t.Fatalf("famille %s ne doit pas être bloquée par une désinscription newsletter", family)
		}
	}
}

func TestResolveLocale_OrderAndProvenance(t *testing.T) {
	supported := []string{"fr", "en"}
	// Le choix explicite gagne, même si tout le reste est renseigné.
	got := ResolveLocale(supported, "fr",
		LocaleSource{Kind: LocalePlatform, Value: "fr"},
		LocaleSource{Kind: LocaleSubscription, Value: "en"},
		LocaleSource{Kind: LocaleExplicit, Value: "en"},
	)
	if got.Locale != "en" || got.From != LocaleExplicit {
		t.Fatalf("explicite = %+v", got)
	}
	// Sans choix explicite : l'abonnement gagne sur le défaut plateforme.
	got = ResolveLocale(supported, "fr",
		LocaleSource{Kind: LocalePlatform, Value: "fr"},
		LocaleSource{Kind: LocaleSubscription, Value: "en"},
	)
	if got.Locale != "en" || got.From != LocaleSubscription {
		t.Fatalf("abonnement = %+v", got)
	}
}

func TestResolveLocale_UnsupportedFallsThrough(t *testing.T) {
	// Une locale non supportée ne bloque jamais : on descend la chaîne.
	got := ResolveLocale([]string{"fr", "en"}, "fr",
		LocaleSource{Kind: LocaleExplicit, Value: "es"},
		LocaleSource{Kind: LocaleSubscription, Value: "en"},
	)
	if got.Locale != "en" || got.From != LocaleSubscription {
		t.Fatalf("repli = %+v", got)
	}
	// Rien d'exploitable : défaut plateforme, provenance annoncée.
	got = ResolveLocale([]string{"fr"}, "fr",
		LocaleSource{Kind: LocaleSession, Value: "!!"},
	)
	if got.Locale != "fr" || got.From != LocalePlatform {
		t.Fatalf("défaut = %+v", got)
	}
}

func TestResolveLocale_NormalizesTags(t *testing.T) {
	for in, want := range map[string]string{
		"fr-FR": "fr", "en_US": "en", "EN": "en", " fr ": "fr",
	} {
		got := ResolveLocale([]string{"fr", "en"}, "fr",
			LocaleSource{Kind: LocaleSubscription, Value: in})
		if got.Locale != want {
			t.Fatalf("tag %q = %q, attendu %q", in, got.Locale, want)
		}
	}
	// Accept-Language brut avec qualité : on prend la base du premier segment.
	got := ResolveLocale([]string{"fr", "en"}, "fr",
		LocaleSource{Kind: LocaleSession, Value: "en-US,en;q=0.9,fr;q=0.8"})
	if got.Locale != "en" || got.From != LocaleSession {
		t.Fatalf("accept-language = %+v", got)
	}
}

func TestResolveLocale_NeverEmpty(t *testing.T) {
	// Même avec des entrées vides ou absurdes, on rend toujours une locale.
	for _, sources := range [][]LocaleSource{
		{},
		{{Kind: LocaleExplicit, Value: ""}},
		{{Kind: LocaleSession, Value: "123"}},
	} {
		got := ResolveLocale(nil, "", sources...)
		if got.Locale == "" {
			t.Fatalf("locale vide pour %+v", sources)
		}
	}
}
