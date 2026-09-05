#!/usr/bin/env bash
# =====================================================================
# ⚡ dev-light.sh — Démarre UNIQUEMENT les apps locales (mode VPS)
# =====================================================================
# Les services lourds (DB, Redis, Meili, Supabase, Jina...) tournent
# déjà sur le VPS de dev (cf. docs/DEV_VPS_RUNBOOK.md).
# Ici on ne lance que :
#   - API Go        → http://localhost:15407
#   - Worker asynq  → tâches de fond
#   - Web core      → http://localhost:15402
# (via launchd → survivent aux sessions, auto-restart)
# =====================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

echo "⚙️  Synchronisation du .env racine…"
node scripts/copy-env.js >/dev/null

for label in com.qoefi.api-server com.qoefi.api-worker com.qoefi.core-local; do
  if ! launchctl print "gui/$(id -u)/$label" >/dev/null 2>&1; then
    echo "↗️  Chargement de $label (launchd)…"
    launchctl bootstrap "gui/$(id -u)" "scripts/launchd/$label.plist"
  fi
  launchctl kickstart -k "gui/$(id -u)/$label" >/dev/null 2>&1
  echo "   ✓ $label relancé"
done

echo
echo "✅ Stack locale prête :"
echo "   API Go  → http://localhost:15407/healthz"
echo "   Web     → http://localhost:15402"
echo "   Worker  → asynq (tâches de fond)"
echo "   (services VPS : déjà actifs, auto-restart Docker)"