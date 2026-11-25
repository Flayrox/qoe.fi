#!/usr/bin/env bash
# =====================================================================
# 🔐 ensure-supabase-hetzner.sh — stack Supabase de test/dev = VPS Hetzner
# =====================================================================
# Décision (2026-11-25) : le stack Supabase self-hosted qui sert au dev et
# aux e2e est celui du VPS Hetzner (116.203.158.47:54321). Aucun
# `supabase start` local n'est requis.
#
# Les ports publics du VPS sont fermés : on passe par un tunnel SSH et on
# expose la stack sur la boucle locale, exactement comme `pnpm dev:vps`.
# L'application continue donc de viser `http://127.0.0.1:54321` (règle
# `resolveSupabaseUrl` : un build local ne peut jamais viser la prod).
#
# Usage :
#   bash scripts/ensure-supabase-hetzner.sh ensure   # ouvre si besoin
#   bash scripts/ensure-supabase-hetzner.sh stop     # referme NOTRE tunnel
#   bash scripts/ensure-supabase-hetzner.sh status
# =====================================================================

set -euo pipefail

SSH_HOST="${QOE_VPS_SSH_HOST:-dev}"
PORT="${QOE_SUPABASE_PORT:-54321}"
CONTROL="${TMPDIR:-/tmp}/qoe-hetzner-supabase.ctl"

probe() {
  (exec 3<>/dev/tcp/127.0.0.1/"$PORT") 2>/dev/null || return 1
  exec 3>&- 3<&- 2>/dev/null || true
  return 0
}

ensure() {
  if probe; then
    echo "→ Supabase de test/dev déjà joignable sur 127.0.0.1:$PORT"
    return 0
  fi

  echo "→ Ouverture du tunnel SSH vers le Supabase Hetzner ($SSH_HOST)…"
  # ControlMaster : « stop » peut fermer précisément ce tunnel, sans tuer
  # d'autres connexions SSH de l'utilisateur.
  ssh -M -S "$CONTROL" -fN \
    -o ExitOnForwardFailure=yes \
    -o ServerAliveInterval=30 \
    -L "127.0.0.1:${PORT}:127.0.0.1:${PORT}" \
    "$SSH_HOST"

  for _ in $(seq 1 25); do
    if probe; then
      echo "✔ Supabase Hetzner relayé sur 127.0.0.1:$PORT"
      return 0
    fi
    sleep 0.2
  done

  echo "✖ Le tunnel vers $SSH_HOST:$PORT n'a pas pu s'ouvrir" >&2
  return 1
}

stop() {
  if [ -S "$CONTROL" ]; then
    ssh -S "$CONTROL" -O exit "$SSH_HOST" >/dev/null 2>&1 || true
    rm -f "$CONTROL"
    echo "→ Tunnel Supabase Hetzner refermé"
  fi
}

case "${1:-ensure}" in
  ensure) ensure ;;
  stop) stop ;;
  status)
    if probe; then
      echo "Supabase joignable sur 127.0.0.1:$PORT"
    else
      echo "Supabase injoignable sur 127.0.0.1:$PORT"
      exit 1
    fi
    ;;
  *)
    echo "Usage : $0 {ensure|stop|status}" >&2
    exit 2
    ;;
esac
