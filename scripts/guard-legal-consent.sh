#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# Guard CI — consentement légal & registre des traceurs
#
# Échoue si :
#   1. un parcours d'inscription/onboarding (formulaire @qoe/ui, page login
#      core, wizard onboarding studio) perd le câblage du consentement ;
#   2. le chemin serveur Go (SyncUserFromAuth → RecordSignupConsent, ou
#      AcceptBatch) disparaît ;
#   3. un traceur du registre n'a ni catégorie, ni finalité, ni durée, ou est
#      en doublon — le même contrôle que le test vitest, ici pour tenir même
#      quand on ne lance pas la suite JS ;
#   4. la sentinelle de catégorie à consentement ou le mode exempté sautent.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fail=0

banner() { printf '\n── %s ──\n' "$1"; }
violation() { printf '✗ %s\n' "$1"; fail=1; }
ok() { printf '✓ %s\n' "$1"; }

# ── 1. Câblage UI des parcours d'inscription / onboarding ────────────────
banner "1) Parcours d'inscription et d'onboarding"

UI_FORM="$ROOT/packages/ui/src/LoginFormBento.tsx"
if [ -f "$UI_FORM" ] \
   && grep -q "buildSignupConsent" "$UI_FORM" \
   && grep -q "signupConsent" "$UI_FORM"; then
  ok "formulaire @qoe/ui : consentement déposé dans user_metadata"
else
  violation "formulaire @qoe/ui ($UI_FORM) : câblage du consentement perdu"
fi

CORE_LOGIN="$ROOT/apps/core/src/app/login/login-form.tsx"
if [ -f "$CORE_LOGIN" ] && grep -q "consentDocuments" "$CORE_LOGIN"; then
  ok "page login core : documents de consentement transmis au formulaire"
else
  violation "page login core ($CORE_LOGIN) : transmission des documents perdue"
fi

STUDIO_WIZARD="$ROOT/apps/studio/src/features/onboarding/components/wizard.tsx"
if [ -f "$STUDIO_WIZARD" ] \
   && grep -q "acceptLegalConsentsAction" "$STUDIO_WIZARD" \
   && grep -q "consentAccepted" "$STUDIO_WIZARD"; then
  ok "wizard onboarding studio : consentement créateur acté côté serveur"
else
  violation "wizard onboarding studio ($STUDIO_WIZARD) : acte de consentement perdu"
fi

# ── 2. Chemins serveurs Go ────────────────────────────────────────────────
banner "2) Capture serveur du consentement"

USERS_CONSENT="$ROOT/apps/api/internal/modules/users/signup_consent.go"
USERS_WIRED="$(grep -rl --include='*.go' 'signupConsent' "$ROOT/apps/api/internal/modules/users/" 2>/dev/null | grep -v '_test.go' | head -1 || true)"
if [ -f "$USERS_CONSENT" ] \
   && grep -q "RecordSignupConsent" "$USERS_CONSENT" \
   && [ -n "$USERS_WIRED" ]; then
  ok "API users : signupConsent transformé en preuve à la création du compte"
else
  violation "API users ($USERS_CONSENT) : capture du consentement d'inscription perdue"
fi

if grep -q "AcceptBatch" "$ROOT/apps/api/internal/modules/legal/consent.go" 2>/dev/null; then
  ok "API legal : AcceptBatch disponible pour l'onboarding studio"
else
  violation "API legal : AcceptBatch a disparu de consent.go"
fi

# Le drain des avis légaux doit rester branché dans le worker.
WORKERS_NOTICE="$ROOT/apps/api/internal/workers/legal_notice.go"
if [ -f "$WORKERS_NOTICE" ] && grep -q "drainLegalNoticesOnce" "$WORKERS_NOTICE"; then
  ok "worker : drain des avis de re-consentement présent"
else
  violation "worker ($WORKERS_NOTICE) : drain des avis légaux perdu"
fi

# ── 3. Registre des traceurs (@qoe/utils) ─────────────────────────────────
banner "3) Registre des traceurs"

REGISTRY="$ROOT/packages/utils/src/cookie-consent.ts"
if [ ! -f "$REGISTRY" ]; then
  violation "registre introuvable : $REGISTRY"
elif node "$ROOT/scripts/check-tracker-registry.cjs" "$REGISTRY"; then
  ok "registre des traceurs : catégorie, finalité, durée, unicité"
else
  violation "registre des traceurs : entrée incomplète (voir ci-dessus)"
fi

# ── 4. Catégories et sentinelles ──────────────────────────────────────────
banner "4) Catégories et sentinelles"

if [ -f "$REGISTRY" ] && grep -q "consentRequired: true" "$REGISTRY"; then
  ok "sentinelle de catégorie à consentement conservée (marketing)"
else
  violation "sentinelle disparue : une catégorie à consentement sans porteuse deviendrait invisible"
fi

# Mode exempté par défaut : la bannière ne revient pas sans décision explicite.
if [ -f "$REGISTRY" ] && grep -q "DEFAULT_ANALYTICS_MODE: AnalyticsMode = 'exempt'" "$REGISTRY"; then
  ok "mesure d'audience : mode exempté par défaut"
else
  violation "mode par défaut de la mesure d'audience modifié sans revue"
fi

printf '\n'
if [ "$fail" -ne 0 ]; then
  printf '🛡 guard-legal-consent : ÉCHEC — un garant légal a sauté.\n'
  exit 1
fi
printf '🛡 guard-legal-consent : OK — consentement et registre verrouillés.\n'
