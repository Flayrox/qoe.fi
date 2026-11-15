# Analytics Studio & Média Multi-Auteurs — Plan Vivant

> **Ce fichier est la mémoire du chantier Analytics.** À chaque reprise, le lire avant de coder, puis le mettre à jour après chaque lot : ce qui est fait, ce qui reste, dans quel ordre et comment vérifier.

Dernière mise à jour : 2026-11-15 · branche `dev`

---

## 0. Audit de l'existant & Écarts identifiés (code vérifié)

L'inspection du backend Go (`apps/api/internal/modules/analytics/`, `tracking/`), du schéma (`schema.sql`) et du Studio (`apps/studio/src/app/(creator)/analytics/`) révèle 5 écarts majeurs à corriger en priorité :

1. **Mélange / fuite de métriques Umami globales dans le Studio (`actions.ts`)** :
   - Quand un créateur/média n'a pas son propre `umamiWebsiteId`, le studio retombe sur `NEXT_PUBLIC_UMAMI_WEBSITE_ID` (global `qoe.fi`). Résultat : `pageviews` vient bien des `ReadingSession` Go du créateur, mais `visitors`, `visits`, `bounces`, `referrers`, `devices`, `countries`, `returning` et `hours` proviennent du site global.
   - **Action** : Basculer 100 % des métriques créateur/média vers des requêtes scopées côté Go (ou tags/websites Umami strictement isolés) pour qu'aucun indicateur global ne pollue un dashboard personnel.
2. **Perte d'historique > 90 jours (`ReadingSession` purgé)** :
   - `tracking/service.go` signale que le worker purge `ReadingSession` après 90 jours. Par conséquent, le filtre `all` ("Tout l'historique") perd les vues plus anciennes.
   - **Action** : Ajouter une table de rollup journalier permanent (`ArticleDailyStat` / `PublisherDailyStat` ventilée par auteur/tenant/source) calculée avant purge.
3. **Données déjà collectées mais invisibles dans le Studio** :
   - `FeedImpression` (`useFeedImpressionTracker`) est stocké mais jamais rapproché des lectures (`CTR du Feed`, `Découverte pgvector vs Abonnés`).
   - `ReadingSession.status` (`BOUNCE`, `SKIM`, `READ_PARTIAL`, `READ_COMPLETE`) et `scrollDepth` sont stockés session par session, mais `ProductMetrics` calcule la qualité de lecture via un simple EMA `Article.completionRate` par article au lieu d'agréger les vraies sessions et la courbe de rétention (25 % ➔ 50 % ➔ 75 % ➔ 85 %+).
   - `apps/mobile` ne remonte pas encore `/v1/tracking/reading-session` : les lectures iOS/Android sont aveugles.
4. **Absence d'analytics Newsletter & Tunnel Paywall** :
   - `NewsletterIssue`, `NewsletterDelivery` et `ArticleReleaseDelivery` ne suivent que `QUEUED/SENT/FAILED`. Aucun lien avec les clics newsletter ➔ lectures web, conversions abonnés, ni hits/conversions paywall.
5. **Absence des stats Financières & Pensées dans l'UI Studio** :
   - `Service.Financial()` (MRR, ARR, LTV, taux de conversion) et `GetRecentThoughtsForAnalytics()` existent en Go mais ne sont pas exposés dans le dashboard analytics pour relier **Contenu (Article ou Pensée) ➔ Profil ➔ Abonné payant/gratuit**.

---

## 1. Vision Métier & Piliers Différenciants (au-delà de Substack/Ghost/Medium)

### A. Courbes Multi-Auteurs & Multi-Tenants (Pilotage d'équipe & média)
- **Séries temporelles multi-séries (`TimeseriesMultiChart`)** :
  - Mode **Superposé (multi-lignes)** : une courbe colorée par auteur/contributeur ou par tenant.
  - Mode **Additionné / Empilé (stacked area)** : empilement des aires pour voir la courbe totale du média et la part de chaque personne.
  - Mode **Part relative (100 % stacked)** : évolution de la répartition d'audience entre contributeurs.
- **Manipulation dynamique** : pills d'auteurs cliquables (toggle on/off, double-clic = mode *Solo*, *Tout sélectionner / Moi uniquement*, ajouter/retirer à la volée).
- **Sélecteur Multi-Tenants** : bascule d'un tenant à l'autre (`*.qoe.fi`, domaine custom) ou comparaison cross-publications.

### B. Radiographie In-Situ du Texte (Où exactement dans l'article ?)
*Qoefi stocke déjà `Highlight.canonicalStart`/`canonicalEnd`/`contentSha`. En ajoutant l'ancrage positionnel (`scrollDepth` / `paragraphIndex`) aux actions, l'article devient une carte interactive :*
1. **À quel moment de l'article** les lecteurs cliquent sur **Like**, mettent en **Marque-page**, **Partagent** (citation ou article), ouvrent une **Annotation officielle** ou **Commentent**.
2. **Courbe de Rétention & Vitesse le long du texte** : où les lecteurs décrochent (`Drop-off`), où ils survolent vite (`Skim` local), et quel est le **"paragraphe Climax"** qui déclenche le pic de surlignages et de partages.

### C. Attribution Collaborative Co-Auteurs & Passerelle Croisée Média ⇄ Auteur
1. **Attribution Co-Auteurs (`ArticleAttribution`)** :
   - Sur un article co-signé, distinguer la part du lectorat drainée par le réseau / les partages de l'Auteur A vs Co-auteur B vs le média vs l'organique (`referrerUsername`, liens signés, followers respectifs).
2. **Vases communicants Média ⇄ Profil Personnel (`isAuthorSovereignCopy`)** :
   - **Flux Média ➔ Auteur** : quand j'écris pour un média, combien de lecteurs ont cliqué sur mon profil depuis cet article, combien se sont abonnés à mon espace personnel ?
   - **Flux Auteur ➔ Média** : combien de lecteurs amenés par mon réseau ont ensuite lu d'autres articles du média ou se sont abonnés au média ?
3. **Arbre de propagation & Provenance fine** :
   - De quel tenant (`hostname`), profil référent (`referrerUsername`), repost cité (`Post.quotedArticleId`) ou newsletter provient chaque vague de lecture.

### D. Funnel Complet, Timeline Causale & ADN "Sanctuaire de Lecture"
1. **Funnel d'acquisition complet** :
   - `Impressions Feed / Newsletter / Externe` ➔ `Clics` ➔ `Début de lecture (>25%)` ➔ `Deep Read` ➔ `Paywall / Abonnement gratuit ou payant`.
   - **Attribution d'abonnement** (*First Touch* / *Last Touch*) par article, par auteur et par pensée (`Post`).
2. **Marqueurs causaux sur la courbe temporelle** :
   - Superposer automatiquement les évènements `ArticleEvent` (`PUBLISHED`, `LIVE_UPDATED`, envoi `NewsletterIssue`, repost majeur, boost co-auteur) sur la courbe des vues pour voir l'impact immédiat de chaque action.
3. **Comfort & Accessibility Insights (spécifique Qoefi)** :
   - Usage du **Mode Bionic (TDAH)**, ouverture des **annotations officielles de l'auteur**, taux de sauvegarde bibliothèque / export, web vs App Mobile Expo.
4. **Découvrabilité Sémantique (`pgvector`)** :
   - Identifier les formats/longueurs "Sweet Spot" (longueur vs taux de complétion réel) et les thématiques connexes qui engagent le plus les lecteurs du média.

### E. Vues Contextuelles Adaptatives selon le Rôle
- **Auteur Solo** : focus qualité de lecture, radiographie in-situ, funnel abonnés, sans surcharge multi-équipes.
- **Co-Auteur** : répartition transparente des apports d'audience par collaborateur.
- **Rédacteur dans un Média** : performance de ses écrits dans le média + retombées directes sur son profil/abonnés personnels.
- **Propriétaire / Éditeur en chef Média** : pilotage multi-courbes de l'équipe, comparaison/cumul des auteurs, matrice d'attribution et vases communicants.

---

## 2. Architecture Technique & Base de Données

### A. Nouvelles tables / enrichissements SQL (`apps/api/sql/migrations`)
1. **Rollup journalier permanent** (`ArticleDailyStat`) :
   - Clé : `(day, articleId, source, hostname, authorAttributionUserId)` + compteurs (`views`, `uniqueReaders`, `deepReads`, `skims`, `bounces`, `totalDwellSeconds`, `authorProfileClicks`, `subscribesCount`).
   - Alimenté par le worker avant la purge 90j de `ReadingSession` ➔ historique illimité ultra-rapide.
2. **Signaux positionnels & passerelle (`ArticleInteractionPoint` ou colonnes sur `ContentFeedback`/`Share`/event léger)** :
   - Stockage de `(articleId, eventType, scrollDepthPercent, paragraphIndex, sourceRefUserId)` pour Likes, Partages, Bookmarks, PaywallHits, ProfileClicksFromMedia.
3. **Attribution Abonné & Conversion** :
   - Sur `Subscriber` (ou `SubscriptionConversion`) : `attributedArticleId`, `attributedAuthorId`, `attributedChannel` (`article`, `thought`, `media_bridge`, `newsletter`, `profile`), `attributedFromPublisherId`.
4. **Tracking Mobile** :
   - Brancher `POST /v1/tracking/reading-session` (avec `source = 'mobile_app'`) depuis `apps/mobile`.

### B. Endpoints Go (`apps/api/internal/modules/analytics/`)
- `GET /v1/analytics/timeseries` : multi-séries ventilées par `groupBy=author|tenant|channel` (`views`, `deepReads`, `dwellMinutes`, `subscribers`).
- `GET /v1/analytics/article/{id}/in-situ` : courbe de décrochage par tranche de 10 % + heatmap des likes/surlignages/partages/annotations par paragraphe + marqueurs `ArticleEvent`.
- `GET /v1/analytics/article/{id}/collaboration` : apports co-auteurs + flux passerelle Média ⇄ Auteurs.
- `GET /v1/analytics/funnel` : `FeedImpression` ➔ `ReadingSession` (tous statuts) ➔ `Paywall / Subscription` + conversion pensées & newsletters.
- `GET /v1/analytics/media-bridge` : bilan global des transferts d'audience Média ⇄ Profils personnels des rédacteurs.

---

## 3. Découpage des Lots d'Implémentation

### Lot 1 — Fiabilisation & Fin des fuites de scope + Rollup permanent
- [ ] Corriger l'isolation 100 % scopée des stats Studio (ne plus exposer les visiteurs/heures/pays globaux d'Umami quand `umamiWebsiteId` est partagé).
- [ ] Créer la table de rollup permanent `ArticleDailyStat` + worker d'agrégation avant purge 90j.
- [ ] Calculer `ReadingQuality` et la courbe de rétention depuis les vraies `ReadingSession` (non plus uniquement EMA).
- [ ] Brancher le tracking lecture sur `apps/mobile`.

### Lot 2 — Graphique Multi-Courbes & Pilotage Équipe/Tenants (`TimeseriesMultiChart`)
- [ ] Endpoint Go `GET /v1/analytics/timeseries?groupBy=author|tenant`.
- [ ] Composant SVG pur `TimeseriesMultiChart` : modes *Superposé*, *Empilé/Cumulé*, *% Relatif*, curseur unifié au hover.
- [ ] Pills interactives d'auteurs/tenants (ajouter, retirer, isoler en *Solo*, *Moi uniquement*).
- [ ] Sélecteur de tenant pour comptes multi-publications.

### Lot 3 — Radiographie In-Situ, Marqueurs Causaux & Confort de Lecture
- [ ] Capture de `paragraphIndex` / `scrollDepth` sur Likes, Bookmarks, Partages, PaywallHits + agrégation des `Highlight` existants (`canonicalStart`/`canonicalEnd`).
- [ ] Vue "Radiographie de l'article" dans `ArticleAnalyticsPageClient.tsx` + marqueurs `ArticleEvent` (`PUBLISHED`, `LIVE_UPDATED`, `NewsletterIssue`) sur la courbe temporelle.
- [ ] Indicateurs Comfort & Accessibility (Mode Bionic, annotations officielles).

### Lot 4 — Co-Auteurs, Passerelle Média ⇄ Auteur & Funnel Abonnés/Newsletter
- [ ] Tracking du passage Média ➔ Profil Auteur et Auteur ➔ Média + attribution de conversion `Subscriber`.
- [ ] Raccordement de `FeedImpression` (CTR Feed + part Découverte pgvector) et des métriques Newsletter (clics ➔ lectures) + Pensées (`Post`).
- [ ] Blocs UI dédiés adaptatifs selon le contexte (Solo, Co-auteur, Contributeur Média, Rédacteur en chef).
- [ ] Tests unitaires Go (`analytics_test.go`), Vitest Studio et E2E Playwright.

---

## 4. Règles & Garde-fous
- **Vie privée & RGPD** : Zéro fingerprinting individuel des lecteurs ; toutes les stats créateurs restent strictement agrégées (seuil d'anonymat quand pertinent) et sans cookies tiers.
- **Go = Source de vérité** : Toute logique d'attribution, de permission (`canAccess` / `articleScopeSQL`) et de calcul de funnel vit côté Go.
- **Légèreté UI** : Graphiques SVG natifs alignés sur le design system `@qoe/ui`, responsive mobile/desktop.
