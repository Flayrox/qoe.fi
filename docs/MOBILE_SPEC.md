# 📱 Spécification pixel-perfect — App mobile qoe.fi

> **Objectif** : documenter **chaque composant, chaque valeur de style,
> chaque paramètre d'animation** de `apps/mobile` pour servir de référence
> exacte au développement. Toutes les valeurs sont relevées dans le code
> actuel (août 2026). Les sections « GAP » listent ce qui manque vs le web.
>
> Complémentaire de `docs/API_CONTRACT.md` (contrat API) et
> `docs/ARCHITECTURE_REFERENCE.md` (relations).

---

## 0. Fondations

### Stack
- Expo SDK 57, React Native 0.86.2, React 19.2.3, expo-router ~57.0.13
- `@expo/ui` (composants natifs SwiftUI/Jetpack Compose)
- `@shopify/flash-list` 2.0.2 (feed virtualisé)
- `@tanstack/react-query` ^5.62.7
- `react-native-reanimated` 4.5.1 + `react-native-worklets`
- `expo-symbols` (SF Symbols iOS / Material Android)
- `@lingui/core` + `@lingui/react` 6.6.0
- `@supabase/supabase-js` (auth, AsyncStorage)

### Configuration (`app.json`)
- Nom : **Qoe**, slug `qoe-mobile`, scheme `qoe`
- orientation **portrait** (verrouillée)
- `userInterfaceStyle: automatic` (suit le mode système)
- `newArchEnabled: true` (Nouvelle Architecture RN)
- `experiments: { typedRoutes: true, reactCompiler: true }`
- **Splash natif** : fond `#208AEF`, image `splash-icon.png` **76px de large**
- **Icône Android adaptive** : backgroundColor `#E6F4FE`
- Web : `output: static`

### Alias & TS
- `@/*` → `./src/*`, `@/assets/*` → `./assets/*`
- `strict: true`

---

## 1. Système de thème mobile

### Mapping tokens (`src/constants/theme.ts`)
Le mobile importe `@qoe/theme/native` (`nativeTokens.light/dark`) et mappe les
sémantiques web vers des noms mobile :

| Clé mobile | Token web | Light | Dark |
|---|---|---|---|
| `text` | foreground | `#09090b` | `#fafafa` |
| `background` | **card** | `#ffffff` | `#121215` |
| `backgroundElement` | secondary | `#f4f4f5` | `#1c1c20` |
| `backgroundSelected` | muted | `#f4f4f5` | `#1c1c20` |
| `textSecondary` | textSecondary | `#52525b` | `#a1a1aa` |
| `sidebar` | background | `#f5f5f7` | `#0a0a0c` |
| `primary` | primary (vermillon) | `#ee4b2b` | `#ee4b2b` |
| `link` | primary | `#ee4b2b` | `#ee4b2b` |
| `border` | border | `#e4e4e7` | `rgba(255,255,255,0.06)` |
| `destructive` | destructive | `#c7331a` | `#e55a2e` |
| `success` | success | `#34d399` | `#34d399` |

> **Décision produit** : la « page » mobile (deck/feed) = `card` (blanche en
> light) ; la sidebar mobile = `background` web (#f5f5f7, gris très léger).

### Typographies (`Fonts`)
| Clé | iOS | Android | Web |
|---|---|---|---|
| `sans` | `system-ui` | `normal` | `var(--font-display)` (Spline Sans) |
| `serif` | `ui-serif` | `serif` | `var(--font-serif)` |
| `rounded` | `ui-rounded` | `normal` | `var(--font-rounded)` |
| `mono` | `ui-monospace` | `monospace` | `var(--font-mono)` |

### Échelle d'espacement (`Spacing`)
| Clé | px | Usage |
|---|---|---|
| `half` | 2 | padding vertical snippets |
| `one` | 4 | padding vertical boutons tab, gaps icônes |
| `two` | 8 | gaps, padding inputs, radius snippets |
| `three` | 16 | padding cartes, gaps, radius, radius boutons |
| `four` | 24 | padding formulaires, radius, boutons chevron |
| `five` | 32 | radius pastille tab web, padding badge |
| `six` | 64 | padding top web |

### Constantes
- `BottomTabInset` : **50** (iOS) / **80** (Android) — espace sous la barre d'onglets
- `MaxContentWidth` : **800** — largeur max du contenu centré (web)

---

## 2. Navigation & layout racine

### `src/app/_layout.tsx`
- `SplashScreen.preventAutoHideAsync()` au chargement.
- `GestureHandlerRootView` (flex:1) → `ThemeProvider` (expo-router,
  Dark/Default selon `useColorScheme()`) → `AppProviders` →
  `AnimatedSplashOverlay` → `RootContent`.
- **RootContent** :
  - `isLoading` (session) → `null` (le splash couvre).
  - `session` → `<AppDrawer><AppTabs /></AppDrawer>` (deck façon X).
  - sinon → `<LoginScreen />`.

### `src/app/index.tsx` → `FeedScreen`
### `src/app/explore.tsx` → écran template (à remplacer)

### Écrans stack (ajoutés — août 2026)
Le layout racine est désormais un `Stack` qui contient `(tabs)` (le deck +
onglets natifs) **plus** les écrans poussés par-dessus :

| Route | Écran | Header |
|---|---|---|
| `(tabs)` | deck + onglets Feed/Explore | masqué |
| `thought/[id]` | `ThreadScreen` | natif « Pensée » |
| `user/[username]` | `ProfileScreen` | natif « Profil » |
| `article/[slug]` | `ArticleScreen` (`?publicationId=`) | natif « Article » |
| `compose` | `ComposeScreen` | natif « Nouvelle pensée », **modal** |

Navigation depuis les cartes : avatar → `/user/[username]`, corps →
`/thought/[id]`, réponse → `/compose?parentId=&replyingTo=`.

### Onglets
- **Natif** (`app-tabs.tsx`) : `NativeTabs` avec 2 triggers :
  - `index` = **Feed** (icône `tabIcons/home.png`, `renderingMode: template`)
  - `explore` = **Explore** (icône `tabIcons/explore.png`)
  - `backgroundColor` = `colors.background`, `indicatorColor` = `colors.primary`
    (vermillon), `labelStyle.selected.color` = `colors.primary`
  - `selectedColor` sur les icônes = `colors.primary` (iOS tinte l'icône
    sélectionnée en vermillon au lieu du bleu système)
- **Web** (`app-tabs.web.tsx`) : `expo-router/ui` — barre flottante en haut :
  - conteneur absolu pleine largeur, padding 16, centré
  - pastille intérieure : fond `backgroundElement`, radius **32**, padding
    vertical **8** / horizontal **32**, flexGrow 1, maxWidth **800**
  - brand « Expo Starter » (smallBold, poussé à gauche) — **à remplacer par « Qoe »**
  - boutons tab : pastille radius **16**, padding 4/16 ; focusé =
    `backgroundSelected` + texte `text` ; sinon `backgroundElement` +
    `textSecondary` ; pressé = opacity 0.7
  - lien Docs externe + icône `arrow.up.right.square` 12px

---

## 3. Providers & données

### `src/components/providers/app-providers.tsx`
Ordre : `I18nProvider` → `QueryClientProvider` → `AuthProvider`.
React Query DevTools monté **uniquement** sur `Platform.OS === 'web' && __DEV__`
(le package rend du DOM, incompatible natif).

### `src/lib/query-client.ts`
```ts
new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false }
  }
})
```

### `src/lib/api.ts` — résolution d'hôte
- `EXPO_PUBLIC_API_URL` défini → tel quel (prod/staging).
- simulateur/émulateur/web → `localhost:8080`.
- appareil physique → hôte `hostUri` de Metro (IP du Mac).
- `apiClient = new QoeApiClient({ baseUrl, getAuthToken: () => getAccessToken() })`.

### `src/lib/session.ts`
- Module singleton (hors React) : `setAccessToken` / `getAccessToken`.
- Évite les imports circulaires entre AuthProvider et le client API.

### `src/lib/supabase.ts`
- `@supabase/supabase-js` + polyfill `react-native-url-polyfill/auto`.
- Session persistée dans **AsyncStorage** (`autoRefreshToken: true`,
  `persistSession: true`, `detectSessionInUrl: false`).

### `src/lib/i18n.ts`
- `initI18n()` : active la locale de l'appareil (fr par défaut, en si
  `languageCode === 'en'`) sur le singleton Lingui partagé
  (`@qoe/i18n/core` + `@qoe/i18n/catalogs`).
- `t(clé, défaut, params)` : même contrat que le web.

---

## 4. Auth

### `src/features/auth/auth-provider.tsx`
- `session`, `isLoading`, `signIn`, `signUp`, `signOut`.
- `useEffect` : `supabase.auth.getSession()` puis
  `onAuthStateChange` → met à jour session + `setAccessToken`.
- `signUp` : `options.data.full_name` si nom fourni ; retourne
  `needsConfirmation` si pas de session immédiate (confirmation email).
- `useAuth()` lève une erreur hors `AuthProvider`.

### `src/features/auth/login-screen.tsx`
- Modes `signin` / `signup` (bascule).
- Champs : (nom si signup) + email + mot de passe.
- Validation : tous les champs requis (`login.error_missing_fields`).
- Erreur en `destructive`, notice de confirmation en `success`.
- Bouton : fond `backgroundElement`, pressé → `backgroundSelected` ;
  spinner pendant `submitting`.
- `KeyboardAvoidingView` (padding sur iOS), maxWidth 480 centré.
- Inputs : radius **8**, padding 16/16, fontSize 16, fond `backgroundElement`.

---

## 5. Feed (écran principal)

### `src/features/feed/feed-screen.tsx`
- `useInfiniteFeed({ limit: 20, fetcher })` — fetcher adapte
  `QoeApiClient.getFeed` au contrat `ApiResponse<FeedSlice[]>` (pensées).
- `useInfiniteQuery` sur `/v1/feed/articles` (articles récents).
- **Intercalage** : les deux sources sont triées par `createdAt` desc dans
  une liste unique `FeedRow` (`thought` | `article`) — mêmes éléments que
  l'écran principal web (ArticleCard + ThoughtFeedSlice).
- `FlashList` :
  - `keyExtractor` = id du slice (pensée) ou id de l'article
  - `onEndReached` si `hasNextPage && !isFetching && !isRefetching`
  - `onEndReachedThreshold = 0.4`
  - pull-to-refresh (`refreshing = isRefetching`, `onRefresh` = refetch
    pensées + articles)
  - `ItemSeparatorComponent` : hauteur **8** (`Spacing.two`)
  - `contentContainerStyle` : padding **16**, gap **8**, flexGrow 1
- **Header** :
  - bouton menu « ☰ » (glyphe 22px/24px) — pressé → **fond `primary`
    (vermillon)** + radius 8 + glyphe blanc
  - `ApiStatus` (carte santé API)
  - bouton 🔖 Bibliothèque (`/library`)
  - bouton « + » Composer (`/compose`)
  - bouton « Se déconnecter » (small, pressé → `primary`)
- **Pill temps réel** (`useRealtimeFeedPill`) : flottante en haut (zIndex 10,
  radius 999, fond `primary`, texte blanc « ↑ X nouvelles pensées ») quand de
  nouvelles pensées arrivent (polling Go `/v1/feed` toutes les 20s). Tap →
  insère le buffer en tête de liste (`flush`).
- États : `isPending` → spinner centré ; `isError` → message + « Réessayer »
  (souligné, pressé → `primary`) ; vide → « Aucune pensée pour le moment ».
- Footer : spinner si `hasNextPage`.

> ✅ **RÉSOLU (août 2026)** : le feed consomme désormais les `FeedSlice` du
> Go via `ThoughtFeedSlice` + `ThoughtCard` (`src/components/thought/`) **et**
> les articles via `ArticleCard` (`src/components/article/article-card.tsx`,
> port pixel de l'ArticleCard web).

### 5ter. `src/components/article/article-card.tsx` (feed)
Port de `apps/feed/.../ArticleCard.tsx` (l'écran principal web) :
- Carte `backgroundElement`, radius **24**, overflow hidden.
- Image de couverture 160px (logo de la publication en fallback) + scrim
  `rgba(0,0,0,0.25)` + barre auteur superposée (avatar sm + nom blanc 15px/700
  + « · date » + 👑 si premium).
- Titre 20px/24px/700 (letterSpacing -0.4, ≤2 lignes) + extrait (texte pur
  du HTML, ≤2 lignes).
- Pied : catégorie · ⏱ X min (bordure haute hairline) + « Lire → » en `primary`.
- Tap titre/extrait/Lire → `/article/[slug]?publicationId=` ; tap auteur → profil.

### 5bis. `src/components/thought/` — le système de cartes pensées

Nouveau sous-système (port de `packages/ui/src/social/ThoughtCard.tsx` +
`ThoughtActions.tsx` et de `apps/feed/.../ThoughtFeedSlice.tsx`) :

- **`normalize.ts`** : unifie les 3 shapes (`FeedPost`/`Thought`/`ThoughtData`)
  en `NormalizedThought` (liked/reposted, compteurs via `_count`,
  parent/repost imbriqués).
- **`avatar.tsx`** : sizes xs(28)/sm(36)/md(44)/lg(56), badge vérifié
  (✓ blanc sur `#ee4b2b`).
- **`thought-header.tsx`** : nom + handle + temps relatif (avatar optionnel
  via `showAvatar`, masqué dans `ThoughtCard` qui l'affiche déjà dans sa
  colonne de gauche — fix « photo de profil affichée 2× par post »).
- **`thought-actions.tsx`** : like/reply/repost/share avec **optimistic UI**
  (shadow store `@qoe/api-client/mobile`), compteurs dérivés localement
  (le Go ne renvoie pas `likesCount`/`repostsCount`), partage natif
  (`Share.share`). Icônes `expo-symbols` (SF Symbols iOS / Material Android).
- **`thought-card.tsx`** : bannière repost pur (« @x a repartagé »), badge
  épinglé, contexte « En réponse à », corps + image + pièces jointes +
  sondage, connecteurs de fil (top/bottom).
- **`thought-feed-slice.tsx`** : 4 cas — post isolé, ou fil root → parent →
  target avec séparateur « Afficher la suite du fil » si `isIncompleteThread`.

### `src/features/feed/thought-card.tsx` (legacy, inutilisé)
- Carte : `backgroundElement`, radius **16** (`Spacing.three`), padding **16**,
  gap **8**.
- Header : avatar **36×36** (radius 18, overflow hidden) — image `logoUrl`
  (contentFit cover) OU initiale sur fond `backgroundSelected` ; nom (small,
  numberOfLines 1) + handle `@username` (opacity 0.6) ; temps relatif
  (opacity 0.6).
- `relativeTime` : `à l'instant` (<1min), `il y a {n} min`, `il y a {n} h`,
  `il y a {n} j`.
- Corps : fontSize **15**, lineHeight **21**.
- Meta (si likeCount/repostCount > 0) : `{n} likes` / `{n} reposts`, gap 16,
  opacity 0.7.

> ⚠️ **GAP** : la carte mobile est minimaliste vs la `ThoughtCard` web
> (`packages/ui/src/social/ThoughtCard.tsx`) qui gère : repost pur (bannière
> « a repartagé »), épinglé (badge), contexte de réponse (« En réponse à »),
> citations (thought/article), preview de lien (unfurl), sondages, actions
> (like/reply/repost/quote/share), knownLikers. **Tout ceci reste à porter.**

---

## 6. Drawer deck façon X (sidebar)

### `src/components/drawer/app-drawer.tsx`
- **Constantes d'animation** :
  - `TIMING_CONFIG = { duration: 250 }` — pas de spring, pas de rebond
  - `EDGE_SWIPE_WIDTH = 40` — zone d'ouverture depuis le bord gauche
  - `DECK_RADIUS = 60` — coins arrondis iPhone du deck
  - `SHADOW_OPEN = 0.12`, `SHADOW_RADIUS = 8`, `SHADOW_OFFSET_X = -4`
  - `SIDEBAR_REST_OPACITY = 0.45`, `SIDEBAR_REST_SCALE = 0.97`
  - `POP_END = 0.65` — fin du mini-pop (un poil après mi-parcours)
- `drawerOffset = width * 0.72` — le deck se décale de 72% de la largeur.
- **Canvas (deck)** : `translateX = interpolate(progress, [0,1], [0, drawerOffset])`.
- **Sidebar** : `opacity = interpolate(progress, [0, POP_END], [0.45, 1])`,
  `scale = interpolate(progress, [0, POP_END], [0.97, 1])` — mini-pop doux.
- **Gesture Pan** :
  - `activeOffsetX: [-12, 12]`
  - fermé : seul un swipe depuis `x < 40` ouvre (sinon `manager.fail()`)
  - `onUpdate` : `progress = clamp(start + translationX / drawerOffset, 0, 1)`
  - `onEnd` : ouvre si `velocityX > 500 || progress > 0.4`
- **Z-index** : sidebar `zIndex 1` (arrière-plan), deckShadow `zIndex 2`.
- Taper sur la sidebar (hors deck) ferme le drawer (`onPress={closeDrawer}`).
- Ombre : `shadowColor #000`, offsetX -4, opacity 0.12, radius 8, elevation 12.

### `src/components/drawer/drawer-context.ts`
- `DrawerContext` expose `openDrawer` / `closeDrawer`.
- `useDrawer()` lève une erreur hors `AppDrawer`.

### `src/features/sidebar/sidebar.tsx`
- Fond : `theme.sidebar` (#f5f5f7 light), paddingHorizontal **28**.
- Header : avatar **44×44** (radius 22) + wordmark « Qoe » (title 22px).
- Menu : items Feed (`/`) & Explorer (`/explore`) — item actif = barre
  verticale **4×20** radius 2 en `primary` + label fontWeight 700 ;
  item pressé = opacity 0.6.
- Footer (marginTop auto) : avatar **36×36** (radius 18) + nom + email
  (opacity 0.6) + bouton « Se déconnecter ».
- Navigation via `router.navigate` + `closeDrawer`.

---

## 7. Splash & logo animé

### `src/components/animated-icon.tsx` (natif)
- **AnimatedSplashOverlay** :
  - masque plein écran fond `#208AEF`, zIndex 1000
  - Phase 1 : statique, `onLayout` → `SplashScreen.hideAsync()` → phase 2
  - Phase 2 : keyframe 600ms (opacity 1 → 0 avec `Easing.elastic(0.7)`,
    scale 1 → 1), callback → `scheduleOnRN(setVisible, false)` (démonte)
- **AnimatedIcon** (splash natif, via app.json) :
  - carte 128×128, radius **40**, dégradé `#3C9FFE → #0274DF`
  - logo Expo 76×71
  - glow 201×201, rotation 0° → 7200° (20 tours) sur 4 min
  - carte : scale `height/90` → 1 (zoom caméra), elastic 0.7
  - logo : scale 1.3 → 1 + fondu, elastic 0.7

### `src/components/animated-icon.web.tsx`
- `AnimatedSplashOverlay` → `null` (pas de masque sur web).
- Durées 300ms, elastic 1.2 plus prononcé.
- Logo positionné à `128/2 + 138 = 202px` du haut (sous la barre d'onglets web).

---

## 8. Composants UI génériques

### `themed-text.tsx`
Types : `default` (16/24, w500), `title` (48/52, w600), `subtitle`
(32/44, w600), `small` (14/20, w500), `smallBold` (14/20, w700),
`link` (14/30), `linkPrimary` (14/30, couleur `primary`), `code` (12, mono).
`themeColor` : n'importe quelle clé du thème.

### `themed-view.tsx`
`type` = clé du thème (fond), défaut `background`.

### `external-link.tsx`
Ouvre dans le navigateur in-app (`openBrowserAsync`,
`WebBrowserPresentationStyle.AUTOMATIC`) sur natif ; `<a target="_blank">` sur web.

### `collapsible.tsx` (template)
Chevron `chevron.right` 14px bold, pastille 24×24 radius 12, rotate 90°/-90° ;
contenu `FadeIn.duration(200)`, radius 16, marginLeft 24, padding 24.

### `web-badge.tsx` (web only)
Version Expo + badge image 123×24, padding 32.

---

## 9. Écrans ajoutés (août 2026)

### Thread — `src/features/thread/thread-screen.tsx`
- `GET /v1/posts/{id}/thread` → racine normalisée + réponses avec
  connecteurs ; composer de réponse en bas (`POST /v1/posts/{id}/reply`,
  max 500) ; invalide le cache fil + feed après envoi ; `KeyboardAvoidingView`
  (padding iOS).
- **Chaîne d'ancêtres** (fix « on ne voit pas ce qu'il y a au-dessus d'une
  réponse ») : le Go peuple `FeedPost.parent` récursivement (root → … →
  parent direct) ; le mobile remonte `parent` jusqu'à la racine et rend les
  ancêtres AU-DESSUS de la pensée focus (parité `ThoughtThreadParentContext`
  web). Les ancêtres sont cliquables (ouvrent leur propre fil).
- **Pensée focus non cliquable** (`disableNavigation`) : taper la pensée ne
  la réouvre plus (fix boucle de navigation).

### Profil — `src/features/profile/profile-screen.tsx`
- `GET /v1/users/{username}` (profil) + `GET /v1/users/{username}/posts`
  (pensées, infini via `useInfiniteFeed`).
- Header : bannière `headerImageUrl` (140px, fallback 96px), avatar lg
  chevauchant (-32px), nom + `@handle` (subdomain||slug) + `heroText`,
  stats followers/articles, bouton Suivre (POST `/v1/users/{publicationId}/follow`).

### Article — `src/features/article/article-screen.tsx`
- `GET /v1/articles/{slug}?publicationId=` ; rendu HTML via le mini-renderer
  maison `src/components/article/html-blocks.tsx` (p/h1-4/ul/ol/blockquote/
  img/hr/code — aucune dépendance, aucun HTML brut exécuté).
- **En-tête aligné sur l'écran principal web** (ArticleAnnotatorView) :
  byline « Par **X** • N min de lecture • 17 août 2026 » (date longue fr-FR),
  puis titre 26px/32px/700 (letterSpacing -0.4), badges catégorie + 👑
  Premium, bouton 🔖 bookmark, séparateur hairline sous l'en-tête.
- Paywall : si `isTruncated || !accessGranted` → panneau « S'abonner »
  (le contenu payant n'est JAMAIS servi côté client, zéro-fuite).

### Composer — `src/features/compose/compose-screen.tsx`
- `POST /v1/posts` (createThought), max **280** chars, contexte « En réponse
  à @x », compteur (rouge au-delà), invalidation feed + thread, modal.
- **Mode citation** : paramètres `repostId` + `quotedAuthor`/`quotedText`
  (aperçu de la pensée citée sous la zone de saisie).

## 9bis. Fonctionnalités ajoutées (août 2026, 2ᵉ vague)

### Citations (quotes)
- Bouton **Citer** dans `thought-actions.tsx` (icône `text.quote`, entre
  Reply et Repost) → ouvre `/compose` avec `repostId`.
- `QuotedThoughtCard` (`components/thought/quoted-thought-card.tsx`) : carte
  bordée (avatar 20px + handle + contenu ≤6 lignes + image) affichée SOUS le
  texte d'un post de citation. Tap → ouvre le fil de la pensée citée.
- `ThoughtCard` distingue : repost pur (`repost` + contenu vide → bannière)
  vs **citation** (`repost` + contenu → carte citée).

### Sondages interactifs
- `PollDisplay` dans `thought-card.tsx` : options cliquables avec barre de
  progression (largeur = %, couleur `primary` si mon vote), ✓ sur mon choix,
  re-tap = unvote. Optimiste via `useMutation` + invalidation feed.
- Backend : `POST /v1/posts/{id}/poll/vote` & `/unvote` (idempotent,
  ON CONFLICT DO UPDATE → changer d'option remplace le vote).

### Bibliothèque — `src/features/library/library-screen.tsx`
- Route `/library` (stack, header « Bibliothèque ») + accès depuis le feed
  (bouton 🔖 dans le header) et la sidebar.
- Segments : **Sauvegardés** (`GET /v1/bookmarks`, articles bookmarkés) +
  **Surlignages** (`GET /v1/me/highlights`). Pagination par offset (FlashList
  infinie). Tap → ouvre l'article (`publicationId` = UUID).

### Surlignage d'articles — `src/components/article/article-highlights.tsx`
- Dans le lecteur d'article : section « Surlignages » (publics + les miens),
  bouton « + Surligner un passage » (formulaire inline : texte + note +
  public/privé), upvote ▲ optimiste.
- Backend : `GET/POST /v1/articles/{id}/highlights`, `DELETE`,
  `POST /v1/highlights/{id}/upvote`, commentaires d'annotation.

### Bookmark article
- Bouton 🔖 dans le header de l'article (toggle optimiste `toggleBookmark`),
  état initial déduit de `/v1/bookmarks` au chargement.

## 10. GAPS / Roadmap d'implémentation (par priorité)

### P0 — Corriger le feed (bloquant)
1. ✅ **Adapter le feed aux `FeedSlice`** — fait (`ThoughtFeedSlice`).
2. ✅ **Normaliser `liked`/`viewerLiked`** + compteurs via shadow store — fait.

### P1 — Ports depuis le web (feed)
3. ✅ **Citations** — fait (bouton Citer + QuotedThoughtCard + composer).
4. ✅ **Vote de sondage réel** — fait (PollDisplay interactif + backend).
5. **Composer avancé** : pièces jointes, triggerWarning, unfurl link preview —
   le composer (texte + réponse + citation) est fait.
6. ✅ **Realtime** — fait côté mobile : `useRealtimeFeedPill`
   (`src/hooks/use-realtime-feed-pill.ts`, polling Go `/v1/feed` toutes les
   20s — le mobile n'a pas Supabase Realtime) + pill « ↑ X nouvelles pensées »
   + insertion du buffer en tête de liste.

### P2 — Écrans manquants
7. **Notifications** : liste groupée + compteur non-lus + marquage lu +
   préférences (`/v1/notifications*`).
8. **Recherche** : Explorer réel (créateurs, hashtags, pensées) →
   `/v1/search/article` + `/v1/users/{username}`.
9. **Profil étendu** : onglets pensées/articles, abonnés/abonnements,
   édition du profil (le socle profil est fait).
10. ✅ **Lecture d'article + paywall** — fait (`ArticleScreen` + mini-renderer).
11. ✅ **Bibliothèque** — fait (bookmarks + surlignages).
12. ✅ **Surlignage d'articles** — fait (création + upvote + notes).

### P3 — Polish
13. **Notifications push** (expo-notifications) — non câblé côté serveur.
14. **Remplacer le brand « Expo Starter »** par « Qoe » (app-tabs.web).
15. **Explorer réel** — ✅ fait (`features/explore/explore-screen.tsx`, recherche Meilisearch `/search/articles`).
16. **Tests** : unitaires (relativeTime, shadow, queue) + e2e Playwright mobile-web.
17. **Supprimer l'ancien `features/feed/thought-card.tsx`** (legacy inutilisé).

---

## 11. Port Bluesky (.reference) — vague 3

Port systématique des patterns de `.reference/bluesky` vers `apps/mobile` :

- **Primitives UI** : `Button` (variantes/couleurs/tailles/formes), `Toast`
  (show/dismiss), `Skeleton` (post/feed/profil), `EmptyState`, `ErrorMessage`
  (+retry), `Divider`, `Loader`, `List` (footer loading/error/end), `ActionSheet`,
  `ErrorBoundary`, `FAB`, `Pills`, `AvatarStack`, `Badge` (certifié/bot/beta),
  `PressableWithHover`.
- **Utils** : `formatCount`, `niceDate`, `timeAgo`, `playHaptic`, `copyText`,
  `useTickEveryMinute`.
- **Post** : `RichText` (mention/lien/hashtag), `TimeElapsed` (tap → date absolue),
  `PostMenu` ⋯ (copier/traduire/supprimer/épingler/masquer/bloquer/signaler),
  `ShareMenu`, `WhoCanReply` (badge + picker), `ContentHider`, `ExternalEmbed`,
  `ViewFullThread`.
- **Composer** : `CharProgress`, brouillons (`drafts.ts`), `replyRestriction`
  (threadgate) + client.
- **Feed** : états vide/fin/erreur, `FeedTabs`, skeleton de chargement,
  interstitials « suggestions ».
- **Notifications** : `NotificationsScreen` + `NotificationItem` (groupées,
  non-lues) sur l'endpoint Go `/v1/notifications` existant.
- **Profil** : `ProfileMenu` ⋯ (copier/partager/bloquer).
- **Lightbox** : visionneuse plein écran (tap image → zoom).
- **Backend Go** : `DELETE /v1/posts/{id}` (soft delete) + `POST /v1/posts/{id}/pin`
  (épingle unique), client `deleteThought`/`togglePin`/`getNotifications`/
  `markNotificationsRead`/`searchArticles`.

⚠️ Limites : muet/blocage/signalement sont des stubs UI (pas d'endpoint Go),
la traduction ouvre Google Translate, et les brouillons sont en mémoire
(pas d'async-storage).

---

## 10. Vérifications finales

```bash
pnpm mobile:typecheck   # tsc --noEmit
pnpm mobile:lint        # expo lint
pnpm mobile:ios         # simulateur iOS (Metro :8081)
pnpm mobile:web         # test UI web le plus rapide
# API requise :
cd apps/api && go run ./cmd/server   # :8080
```
