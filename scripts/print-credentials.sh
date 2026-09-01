#!/bin/bash
# =====================================================================
# 🔑 print-credentials.sh — Inventaire des accès QOE (affiché depuis le VPS)
# =====================================================================
# 📖 Usage :
#     bash scripts/print-credentials.sh
#
# ⚠️ AFFICHE DES SECRETS EN CLAIR DANS TON TERMINAL.
#    Ne jamais rediriger vers un fichier versionné / un chat public.
#    Référentiel « où ça vit » : docs/CREDENTIALS.md (lui, sans valeurs).
#
# 🔒 Nécessite : accès SSH root@159.195.110.239 (comme deploy-prod.sh).
# =====================================================================

set -euo pipefail
VPS_HOST="${VPS_HOST:-root@159.195.110.239}"
SUP="/var/www/supabase/docker/.env"
QOE="/var/www/qoe.fi/.env.docker"

echo "🔑 Inventaire des accès QOE — $(date -u +%FT%TZ)"
echo "   (source : $VPS_HOST)"
echo

ssh -o ConnectTimeout=15 "$VPS_HOST" 'bash -s' "$SUP" "$QOE" <<'REMOTE'
SUP="$1"; QOE="$2"
show() { # show <label> <file> <clé1> [clé2...]
  local label="$1" file="$2"; shift 2
  echo "── $label ──"
  for k in "$@"; do
    v=$(grep -E "^${k}=" "$file" 2>/dev/null | head -1 | cut -d= -f2-)
    if [ -n "$v" ]; then echo "  $k = $v"; else echo "  $k = (vide)"; fi
  done
  echo
}

show "SUPABASE (stack self-hosted)" "$SUP" \
  POSTGRES_PASSWORD JWT_SECRET ANON_KEY SERVICE_ROLE_KEY \
  DASHBOARD_USERNAME DASHBOARD_PASSWORD SMTP_USER SMTP_PASS

show "QOE (.env.docker)" "$QOE" \
  DATABASE_URL NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY \
  SUPABASE_SERVICE_ROLE_KEY SUPABASE_JWT_SECRET QOE_INTERNAL_SECRET \
  MEILI_MASTER_KEY SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS \
  UMAMI_USERNAME UMAMI_PASSWORD UMAMI_HASH_SALT \
  OPENAI_API_KEY ANTHROPIC_API_KEY

echo "── STALWART (recovery admin + certs) ──"
grep -E "^STALWART_RECOVERY_ADMIN=" /etc/stalwart/stalwart.env 2>/dev/null || echo "  (introuvable)"
ls -l /etc/stalwart/certs/ 2>/dev/null | tail -n +2
echo

echo "── TAILSCALE (tailnet) ──"
tailscale status 2>/dev/null | head -5
echo

echo "── HASH vs CLAIR (résumé) ──"
echo "  auth.users (mots de passe users QOE) : $(docker exec supabase-db psql -U postgres -d postgres -t -A -c "SELECT left(encrypted_password,7) FROM auth.users LIMIT 1;" 2>/dev/null || echo 'n/a') (bcrypt = hashé)"
echo "  umami user (admin)                  : $(docker exec qoefi-umami-db psql -U umami -d umami -t -A -c 'SELECT left(password,7) FROM "user" LIMIT 1;' 2>/dev/null || echo 'n/a') (bcrypt = hashé)"
echo "  les .env ci-dessus                  : EN CLAIR (perms $(stat -c '%a %U:%G' "$QOE" 2>/dev/null || echo 'n/a')) — normal pour des env files"
REMOTE
