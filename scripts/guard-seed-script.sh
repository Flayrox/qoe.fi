#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# Guard CI — seed de thème (`seed-script.tsx`)
#
# Échoue si :
#   1. on ré-importe `next/script` dans packages/theme/src/seed-script.tsx, ou
#   2. un rendu client du composant loggue le warning React
#      « Encountered a script tag while rendering React component ».
#
# Le seed utilise un <script> brut dans un serveur component (React 19 le
# hoiste dans le <head> et ne le re-rend jamais côté client). next/script est
# un composant CLIENT qui, re-rendu lors d'un router.refresh()/login, émet un
# vrai <script> → warning. Ce guard verrouille le correctif.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SEED_SRC="$ROOT/packages/theme/src/seed-script.tsx"
WARNING="Encountered a script tag while rendering React component"

echo "── 1) seed-script.tsx ne ré-importe PAS next/script ─────────────────────"
if ! [ -f "$SEED_SRC" ]; then
  echo "✗ $SEED_SRC introuvable"
  exit 1
fi

# Un vrai ré-import = un `from "next/script"` / `from 'next/script'` actif
# (hors commentaire). On balaie les occurrences et on ignore les lignes de
# commentaires/documentation.
violation=""
while IFS= read -r line; do
  case "$line" in
    \#* | //* | \** | \/*) ;; # commentaire
    *)
      if printf '%s' "$line" | grep -qE "from[[:space:]]+['\"](next/script|next-script)['\"]"; then
        violation="$line"
        break
      fi
      ;;
  esac
done < "$SEED_SRC"

if [ -n "$violation" ]; then
  echo "✗ next/script ré-importé dans seed-script.tsx (warning « script tag ») :"
  echo "  $violation"
  exit 1
fi
echo "✓ seed-script.tsx n'importe pas next/script"

echo "── 2) le rendu client ne loggue PAS « $WARNING » ───────────────"
# Le test vitest (packages/ui) rend le composant côté client via Testing
# Library et échoue si console.error contient le warning. On le cible
# directement pour un garde rapide.
(
  cd "$ROOT/packages/ui"
  pnpm exec vitest run src/__tests__/theme-seed-script.test.tsx
)
echo "✓ le rendu client ne loggue pas le warning « script tag »"

echo "✓ Guard seed-script : OK"