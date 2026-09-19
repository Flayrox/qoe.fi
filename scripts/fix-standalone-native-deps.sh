#!/bin/sh
# =====================================================================
# 🔧 fix-standalone-native-deps.sh — répare les sorties `output: standalone`
# =====================================================================
# 📖 PROBLÈME (vécu en prod : studio.qoe.fi, upload du logo d'un Média) :
#    `sharp` plantait avec
#        ERR_DLOPEN_FAILED: Error loading shared library
#        libvips-cpp.so.8.18.3: No such file or directory
#    alors que le `.node` de `@img/sharp-linuxmusl-x64` était bien présent.
#
#    Cause : le file tracing de Next.js (@vercel/nft) ne suit que les
#    imports/requires JS. Or le binaire natif `libvips` n'est JAMAIS
#    `require()` : il est chargé par dlopen/RUNPATH depuis
#        @img/sharp-libvips-<platform>/lib/libvips-cpp.so.N
#    Résultat : la sortie standalone contient
#        @img/sharp-libvips-*/{package.json, index.js, versions.json}
#    mais PAS le `lib/` (glib-2.0 + libvips-cpp.*). Le paquet est donc
#    incomplet → sharp tombe au premier appel (upload d'image, next/image).
#
#    Le bug est identique sur toutes les plateformes : reproductible en
#    local avec `cd apps/studio/.next/standalone && node -e "require('sharp')"`.
#
# 🛠️ CORRECTIF : après `turbo build`, on écrase chaque copie tronquée de
#    `node_modules/@img/*` de la sortie standalone par le paquet complet
#    installé dans le workspace (mêmes chemins relatifs : la sortie
#    standalone reproduit l'arborescence du monorepo).
#
# ✅ VÉRIFICATION : échec explicite (exit 1) si un paquet
#    `@img/sharp-libvips-*` d'une sortie standalone ne contient toujours
#    pas sa bibliothèque `libvips-cpp.*` → la CI casse au build plutôt que
#    d'expédier une image dont sharp est cassé.
# =====================================================================
set -eu

root="$(pwd)"
packages=0

for standalone in apps/*/.next/standalone; do
  [ -d "$standalone" ] || continue

  # Toutes les copies de @img de la sortie tracée (racine + imbriquées, ex.
  # sharp/node_modules/@img).
  imgdirs="$(find "$standalone" -type d -name '@img' 2>/dev/null || true)"
  [ -n "$imgdirs" ] || continue

  for imgdir in $imgdirs; do
    for pkg in "$imgdir"/*; do
      [ -d "$pkg" ] || continue
      # Chemin relatif identique à celui du workspace (racine du monorepo).
      rel="${pkg#"$standalone"/}"
      if [ -d "$root/$rel" ]; then
        cp -R -p "$root/$rel/." "$pkg/"
        packages=$((packages + 1))
      else
        echo "⚠️  $rel absent du workspace : payload natif non restauré" >&2
      fi
    done
  done
done

# ── Vérification : chaque paquet libvips tracé doit avoir son binaire ──
failed=0
for standalone in apps/*/.next/standalone; do
  [ -d "$standalone" ] || continue
  for dir in $(find "$standalone" -type d -name 'sharp-libvips-*' 2>/dev/null || true); do
    if ! ls "$dir"/lib/libvips-cpp.* >/dev/null 2>&1; then
      echo "❌ $dir : libvips-cpp.* manquant après réparation" >&2
      failed=1
    fi
  done
done

if [ "$failed" -ne 0 ]; then
  echo "❌ Payloads natifs @img incomplets : sharp planterait au runtime." >&2
  exit 1
fi

echo "✓ Payloads natifs @img restaurés ($packages paquet(s) rafraîchi(s))"
