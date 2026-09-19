# 🛡️ Audit — uploads d'images / de texte et modération

> **Date :** 19/09/2026 · **Périmètre :** web (studio, core, tenants), mobile, API Go, admin.
> **Question posée :** « est-ce que tous nos points d'entrée pour uploader une image ou du
> texte sont modérés ? » → **Réponse courte : non.** Les images web passent par une
> vraie pipeline (mais *fail-open*), le mobile écrit **directement** dans Storage, et le
> texte n'est modéré qu'à l'inscription.
>
> Ce document est un état des lieux **factuel** du code au 19/09/2026. Les chantiers qui
> en découlent sont planifiés dans [`TRUST_AND_SAFETY_PLATFORM.md`](./TRUST_AND_SAFETY_PLATFORM.md).

---

## 0. TL;DR — par surface

| Surface | Point d'entrée | Pipeline | Verdict |
| --- | --- | --- | --- |
| Images web (studio) | `apps/studio/src/app/api/articles/upload/route.ts` | complète | ✅ mais fail-open |
| Images web (core) | `apps/core/src/app/api/upload/route.ts` | complète | ✅ mais fail-open |
| Images web (tenants) | `apps/tenants/src/app/api/articles/upload/route.ts` | complète | ✅ mais fail-open |
| **Images mobile** | `apps/mobile/src/lib/upload.ts` | **aucune** | ❌ trou réel |
| SVG (toutes surfaces web) | `sanitizeSvgBuffer()` | désinfection seule | ⚠️ pas de modération IA |
| Texte (inscription) | `@qoe/moderation` (email jetable + pseudo) | complète | ✅ |
| **Texte (articles, posts, commentaires, MP, bios, médias, catégories)** | handlers Go / server actions | **aucune** | ❌ trou majeur |
| Signalements & sanctions | module admin (Go) | **manuelle** | ⚠️ volontairement humain |

---

## 1. Images web — pipeline complète, mais *fail-open*

`packages/supabase/src/media-engine.ts` (utilisé par les 3 routes d'upload) applique,
dans cet ordre :

1. **Taille** — `MAX_UPLOAD_BYTES` = 12 Mo (`bodySizeLimit` côté route Next.js).
2. **Magic bytes** — `detectMagicBytes(buffer)` : inspection binaire physique, pas de
   confiance au `Content-Type` déclaré par le client.
3. **Anti-bombe** — `MAX_IMAGE_PIXELS` = 50 Mpx, `MAX_DIMENSION` = 8192 px.
4. **Ré-encodage Sharp** — sortie WebP, ce qui neutralise les payloads exotiques.
5. **Strip EXIF** — pas de GPS/device dans les métadonnées publiées.
6. **Dédoublonnage** — CAS SHA-256 via `packages/supabase/src/storage.ts`.
7. **Modération IA** — `moderateImageBuffer()` (OpenAI omni-moderation, image).

### ⚠️ Deux limites assumées

- **Fail-open** : sans `OPENAI_API_KEY`, sur erreur réseau ou réponse ≠ 200, l'image est
  **acceptée**. C'est un choix de disponibilité : une panne OpenAI ne doit pas casser
  l'upload. Conséquence : il n'existe aujourd'hui **aucun mode « fail-closed »** ni
  **journal de modération** permettant de rattraper a posteriori une image passée.
- **SVG** : `sanitizeSvgBuffer()` retire `<script>`, `<iframe>`, `onX=`,
  `javascript:`… mais le SVG n'est **pas** envoyé au modèle de modération (ni
  ré-encodé par Sharp). Un SVG peut donc être valide techniquement et problématique
  éditorialement.

---

## 2. ❌ Trou mobile — upload direct dans Supabase Storage

`apps/mobile/src/lib/upload.ts` (`uploadProfileImage`, utilisé par
`apps/mobile/src/app/settings/edit-profile.tsx` pour les **avatars** et **bannières**)
écrit **directement** dans le bucket public `articles-media` avec le client utilisateur.

Ce qui n'est **pas** fait par rapport au web :

| Contrôle web | Mobile |
| --- | --- |
| Magic bytes | ❌ |
| Anti-bombe (Mpx/dimensions) | ❌ |
| Ré-encodage Sharp | ❌ |
| Strip EXIF | ❌ |
| Modération IA | ❌ |
| Dédoublonnage CAS | ❌ (les avatars sont volontairement versionnés) |
| Taille | ✅ 12 Mo (`MAX_UPLOAD_BYTES`) |

Le contrôle de taille mobile s'appuie sur les métadonnées du picker
(`fileSize`/`width`/`height`) : un client modifié peut le contourner. **C'est le trou
le plus exploitable du périmètre** : n'importe quel compte peut publier une image
arbitraire (contenu illicite, EXIF de géolocalisation, payload non-image) sur un bucket
public en contournant 100 % des garde-fous.

---

## 3. ❌ Texte — la modération n'est branchée qu'à l'inscription

`packages/moderation` expose pourtant tout ce qu'il faut :

| Module | Contenu | Branché sur |
| --- | --- | --- |
| `email/` | 2 500+ domaines jetables, anti-alias `+tag` | inscription ✅ |
| `identity/` | homoglyphes, leetspeak, garde-fous de pseudo | inscription ✅ |
| `text/` | `fastPath` < 1 ms + `chunker` sliding window | **rien** ❌ |
| `image/` | magic bytes | uploads web ✅ |
| `ai/` | adaptateur OpenAI omni-moderation (texte **et** image) | uploads web (image) ✅, texte ❌ |

Aucun filtre automatique sur : corps et titres d'articles, pensées, commentaires,
réponses, messages privés (`conversations`), bios, noms de Médias, catégories,
newsletters. Le `OpenAiModerator` n'est instancié **nulle part** hors tests.

---

## 4. Modération côté Go — humaine, par construction

- Signalements : `POST /v1/reports` (`apps/api/internal/modules/posts/handler.go`),
  table `ModerationReport` (`apps/api/sql/schema/schema.sql:820`).
- Revue : `apps/admin/src/app/(admin)/admin/reports` (+ `users/[id]`).
- Mots masqués par utilisateur, et consultations humaines côté admin.
- Aucun scan automatique à l'écriture, aucune sanction automatique.

C'est cohérent avec une plateforme à taille humaine, mais ça ne tient pas si le volume
augmente : sans détection automatique, la charge de revue croît linéairement avec le
contenu publié.

---

## 5. Priorités recommandées

| Priorité | Action | Où | Effort |
| --- | --- | --- | --- |
| **P0** | Faire passer les avatars/bannières mobile par la même pipeline (route serveur + `media-engine`) | `apps/mobile/src/lib/upload.ts` | M |
| **P0** | Journaliser **chaque** décision de modération (hash, verdict, provider, latence, surface) pour pouvoir rattraper en cas de fail-open | nouveau (Go + Postgres) | M |
| **P1** | Brancher `text.fastPath` + `OpenAiModerator` à l'écriture (articles, pensées, commentaires, MP, bios) avec décision *asynchrone* non bloquante | handlers Go + asynq | L |
| **P1** | Mode « fail-closed » activable par drapeau pour les surfaces à risque (avatars, bannières, logos de Média) | `packages/moderation` | S |
| **P2** | Passer les SVG au modèle de modération texte (description/alt) ou les interdire hors avatars | routes d'upload | S |
| **P2** | File d'attente de revue + appels + sanctions graduées | admin + Go | L |

> Le détail exécutable de ces priorités (micro-lots, ordre, critères de sortie) est dans
> [`TRUST_AND_SAFETY_PLATFORM.md`](./TRUST_AND_SAFETY_PLATFORM.md).

---

## Annexe A — 🔧 Post-mortem : « échec de l'upload » du logo de Média en prod (19/09/2026)

**Symptôme.** Ajout d'un logo sur un Média du Studio (VPS prod Netcup) → « Échec de
l'upload de l'image », alors que tout fonctionnait en dev.

**Diagnostic.** Les logs studio montraient, à chaque tentative :

```
⨯ Error: Failed to load external module sharp-…: Could not load the "sharp" module
  using the linuxmusl-x64 runtime
  ERR_DLOPEN_FAILED: Error loading shared library libvips-cpp.so.8.18.3: No such file or directory
```

Ni Caddy (aucune limite de body), ni la route (présente dans l'image, 307 → login), ni
Supabase Storage : **`sharp` était cassé dans l'image de prod**.

**Cause racine.** Le *file tracing* de Next.js (`@vercel/nft`) ne suit que les
`import`/`require` JS. Or le binaire natif **libvips** n'est jamais requêté : il est
chargé par `dlopen` via RUNPATH depuis
`@img/sharp-libvips-<platform>/lib/libvips-cpp.so.N`. La sortie `output: 'standalone'`
contenait donc `package.json`, `index.js` et `versions.json` de `@img/sharp-libvips-*`
**mais pas son dossier `lib/`** : le `.node` de sharp se chargeait à moitié et mourait au
premier appel. Deux couples `sharp`/libvips coexistent dans le monorepo (celui de Next,
0.34.5/1.2.4, et celui des apps, 0.35.3/1.3.2) : les **deux** étaient tronqués.

Reproduit en local à l'identique :

```bash
cd apps/studio/.next/standalone && node -e "require('sharp')"
# → Could not load the "sharp" module using the darwin-arm64 runtime
```

**Correctif.**

1. `scripts/fix-standalone-native-deps.sh` — après `turbo build`, chaque copie tronquée
   de `node_modules/@img/*` d'une sortie standalone est écrasée par le paquet complet du
   workspace (mêmes chemins relatifs : la sortie standalone reproduit l'arborescence du
   monorepo), puis le script **échoue explicitement** si un `@img/sharp-libvips-*` n'a
   toujours pas son binaire. La CI casse au build au lieu d'expédier une image cassée.
2. `Dockerfile` — appel du script dans le stage `builder`, + garde-fou `require('sharp')`
   dans les images finales `tenants`, `core` et `studio` (là où le bug s'était installé
   sans que rien ne le signale).
3. `.dockerignore` — `scripts/` devient `scripts/*` + une exception pour ce seul script
   (un dossier exclu ne peut pas voir un de ses fichiers ré-inclus) ; l'exclusion du reste
   de `scripts/` et donc l'effet sur le cache CI sont inchangés.

**Vérification en prod après déploiement.**

```
libvips-cpp.so.8.18.3   18 387 016 octets   ← présent dans l'image studio déployée
sharp 0.35.3 - libvips 8.18.3               ← require() OK dans le conteneur
OK image 68 octets                          ← resize + WebP réellement exécutés
```

**Leçon retenue.** Un binaire natif chargé par `dlopen` est invisible pour le bundler :
tout paquet de ce type (futurs bindings natifs, `ffmpeg`, `canvas`, OCR…) doit être
couvert par un test de chargement **dans l'image finale**, pas seulement par un build vert.
