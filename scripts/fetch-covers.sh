#!/bin/bash
# =====================================================================
# 🎨 fetch-covers.sh — Couvertures éditoriales thématiques pour le seed
# =====================================================================
# Usage : ./scripts/fetch-covers.sh [theme ...]   (défaut : tous)
#
# Pour CHAQUE thème :
#   1. gallery-dl récupère ~24 pins Pinterest (recherche par mots-clés)
#   2. les vidéos (.mp4) sont supprimées — on ne garde que les images
#   3. chaque image est redimensionnée en JPEG 1400px (qualité 70)
#   4. les fichiers > 300 Ko sont écartés (le binaire qui les embarque
#      doit rester raisonnable), on plafonne à MAX_PER_THEME couvertures
#   5. résultat : apps/api/internal/seed/assets/covers/themed/<theme>/cover-N.jpg
#
# ⚠️ Dev/test local UNIQUEMENT : ces visuels Pinterest sont du contenu
#    tiers. Le dossier assets/covers/ est GITIGNORÉ (voir .gitignore) —
#    rien n'est jamais commité. Le seed les embarque via //go:embed
#    quand ils sont présents, et retombe sur les paysages embarqués sinon.
# =====================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SEED_ASSETS="$REPO_ROOT/apps/api/internal/seed/assets"
DEST_ROOT="$SEED_ASSETS/covers/themed"
RAW_ROOT="/tmp/qoe-covers-raw"
MAX_PER_THEME="${MAX_PER_THEME:-18}"
FETCH="${FETCH:-36}"
WIDTH="${WIDTH:-1400}"
QUALITY="${QUALITY:-65}"
MAX_KB="${MAX_KB:-500}"

# Ordre stable des thèmes (tous par défaut, sinon ceux passés en args).
if [ $# -gt 0 ]; then
  THEMES=("$@")
else
  THEMES=(anime cuisine gaming jardin lecture mode musique paysage peinture photo sports tech voyage)
fi

mkdir -p "$DEST_ROOT" "$RAW_ROOT"

for theme in "${THEMES[@]}"; do
  # Mots-clés par thème (case = compatible bash 3.2, pas d'associative array).
  case "$theme" in
    anime)    query="fond ecran anime paysage cinematique" ;;
    cuisine)  query="photographie cuisine editoriale plat" ;;
    gaming)   query="jeu video paysage edito sombre" ;;
    jardin)   query="jardin potager photographie editorial" ;;
    lecture)  query="bibliotheque livre photographie editorial" ;;
    mode)     query="mode photographie editorial studio" ;;
    musique)  query="musique concert photographie editorial" ;;
    paysage)  query="paysage photographie editorial europe" ;;
    peinture) query="peinture atelier art photographie" ;;
    photo)    query="photographie editorial noir et blanc" ;;
    sports)   query="sport photographie editorial action" ;;
    tech)     query="technologie photographie editorial minimal" ;;
    voyage)   query="voyage photographie editorial paysage" ;;
    *)        query="" ;;
  esac
  if [ -z "$query" ]; then
    echo "⚠️  thème inconnu : $theme (pas de mots-clés) — skip"
    continue
  fi
  dest="$DEST_ROOT/$theme"
  mkdir -p "$dest"
  # find (et non ls) : exit 0 même sans match — évite un abort set -e/pipefail.
  existing="$(find "$dest" -maxdepth 1 -name 'cover-*.jpg' 2>/dev/null | wc -l | tr -d ' ')"
  if [ "$existing" -ge "$MAX_PER_THEME" ]; then
    echo "✔ $theme : déjà $existing couvertures — skip"
    continue
  fi
  raw="$RAW_ROOT/$theme"
  rm -rf "$raw"
  mkdir -p "$raw"

  echo "🎨 $theme : téléchargement (${FETCH} pins) — « $query »"
  url="https://www.pinterest.com/search/pins/?q=$(python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))' "$query")"
  # gallery-dl peut retourner non-zéro sur des pins individuels ; on continue.
  gallery-dl --directory "$raw" --range "1-${FETCH}" "$url" >/dev/null 2>&1 || true

  # Supprime les vidéos, garde uniquement les images.
  find "$raw" -name '*.mp4' -delete 2>/dev/null || true
  imgs="$(find "$raw" \( -name '*.jpg' -o -name '*.jpeg' -o -name '*.png' -o -name '*.webp' \) 2>/dev/null | sort)"
  if [ -z "$imgs" ]; then
    echo "   ✗ aucune image — skip"
    continue
  fi

  # Déduplique par pin Pinterest : les frames d'un même pin (souvent issu
  # d'un album vidéo) partagent le même id de base — on garde le 1er.
  good=()
  last=""
  while IFS= read -r f; do
    name="$(basename "$f")"
    id="$(printf '%s' "$name" | sed -E 's/^pinterest_([0-9]+).*$/\1/')"
    [ -z "$id" ] && continue
    if [ "$id" != "$last" ]; then
      good+=("$f")
      last="$id"
    fi
  done <<< "$imgs"

  # Redimensionne en JPEG 1400px, écarte les > MAX_KB, plafonne.
  n=1
  for f in "${good[@]}"; do
    [ "$n" -gt "$MAX_PER_THEME" ] && break
    out="$dest/cover-$n.jpg"
    if sips -s format jpeg -s formatOptions "$QUALITY" --resampleWidth "$WIDTH" "$f" --out "$out" >/dev/null 2>&1; then
      kb=$(du -k "$out" | cut -f1)
      if [ "$kb" -gt "$MAX_KB" ]; then
        rm -f "$out"
        echo "   ✗ écarté (${kb} Ko) : $(basename "$f")"
        continue
      fi
      echo "   ✔ cover-$n.jpg (${kb} Ko) ← $(basename "$f")"
      n=$((n + 1))
    else
      echo "   ✗ conversion impossible : $(basename "$f")"
    fi
  done

  echo "✅ $theme : $((n - 1)) couvertures dans $dest"
done

rm -rf "$RAW_ROOT"
echo "✨ Terminé. (dossier gitignoré — dev/test local)"
