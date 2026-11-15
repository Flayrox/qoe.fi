# Analytics Studio & Média Multi-Auteurs — Plan Vivant

> **Ce fichier est la mémoire du chantier Analytics.** À chaque reprise, le lire avant de coder, puis le mettre à jour après chaque lot : ce qui est fait, ce qui reste, dans quel ordre et comment vérifier.

Dernière mise à jour : 2026-11-15 · branche `dev`

---

## 1. Vision Métier & Spécifications Écosystème

Le système d'analytics de Qoefi est conçu pour refléter la réalité **relationnelle, collaborative et typographique** de la plateforme :

### A. L'Interaction In-Situ le long de l'article (Heatmap Textuelle)
Contrairement aux plateformes web classiques qui mesurent un bouton de like isolé en haut ou bas de page, Qoefi mesure la lecture vécue :
1. **Point d'impact précis dans le texte** :
   - À quel paragraphe / pourcentage de scroll le lecteur a-t-il cliqué sur **Like** ?
   - À quel endroit précis l'article a-t-il été **Partagé** (partage de l'article ou d'une citation précise) ?
   - Quels blocs de texte concentrent les **Surlignages** et **Annotations** ?
2. **Détection du Climax Éditorial** :
   - Identification du "paragraphe star" (celui qui déclenche le plus de réactions, de surlignages et de partages sociaux).
   - Corrélation avec les points de décrochage (*Drop-off*) pour comprendre si une baisse d'attention précède ou suit une section dense.

---

### B. Co-Auteurs & Attribution du Trafic Réseau
Pour les articles rédigés en collaboration (auteur principal + co-auteurs enregistrés via `ArticleAttribution`) :
1. **Origine du lectorat par co-auteur** :
   - Quelle part de l'audience a été amenée par le réseau et les abonnés de l'Auteur A vs l'Auteur B ?
   - Attribution via liens de partage, profils respectifs et notifications aux cercles d'abonnés de chaque co-auteur.
2. **Impact partagé & Transparence** :
   - Chaque co-auteur accède aux métriques de l'article partagé dans son propre Studio, sans rupture de confidentialité sur les données financières privées du co-auteur.

---

### C. La Passerelle Croisée d'Audience : Média ⇄ Auteur Personnel
Un rédacteur qui publie au sein d'un média (ou d'une publication collective) bénéficie d'une relation à double sens mesurée :
1. **Flux Média ➔ Auteur Personnel** :
   - Nombre de lecteurs ayant cliqué sur le profil / avatar de l'auteur depuis l'article publié sur le média.
   - Nouveaux abonnés personnels générés pour l'auteur grâce à sa publication dans le média.
2. **Flux Auteur ➔ Média (Rétention & Découverte)** :
   - Nombre de lecteurs amenés par l'auteur qui ont continué à naviguer sur le média (rebond interne vers d'autres articles du média).
   - Taux d'abonnements au média déclenchés par l'article de cet auteur.

---

### D. Multi-Tenants & Provenance Réseau
Pour les écosystèmes multi-tenants (`*.qoe.fi`, domaines personnalisés, copies souveraines `isAuthorSovereignCopy`) :
1. **Cartographie des Tenants sources** :
   - De quel tenant / sous-domaine / publication proviennent les lecteurs ?
   - Détection des articles partenaires ou cross-postings fédérés.
2. **Analytics unifiées vs ventilées pour les studios multi-publications** :
   - Sélecteur de tenant rapide permettant d'inspecter un sous-domaine spécifique ou d'agréger tous les tenants d'un même groupe média.

---

### E. Vues Contextuelles Adaptatives
Le Studio adapte automatiquement les tableaux de bord et contrôles en fonction du contexte de l'utilisateur :
- **Mode Auteur Solo** : Interface épurée, focalisée sur la qualité de lecture, les surlignages et les abonnés sans encombrement multi-équipes.
- **Mode Co-Auteur** : Affichage de la part d'audience respective, des contributions réseau et des retombées personnelles.
- **Mode Contributeur de Média** : Vue sur l'impact de l'article dans le média + retombées d'audience sur son propre sanctuaire.
- **Mode Rédacteur en Chef / Propriétaire Média** : Panorama d'équipe, comparaison de courbes (superposées, empilées/cumulées), matrice des contributeurs et vases communicants d'audience.

---

## 2. Architecture Technique

### A. Backend (Go `apps/api`)
- **Modèle d'évènements in-situ** :
  - Enrichissement de `article_reading_session` et des évènements d'interaction avec le champ `paragraph_index` et `scroll_percentage`.
  - Enregistrement du `referrer_type` (`AUTHOR_PROFILE`, `MEDIA_HOME`, `CO_AUTHOR_SHARE`, `EXTERNAL_TENANT`).
- **Endpoints d'Analyse Relationnelle** :
  - `GET /v1/creator/analytics/in-situ?article_id=...` : heatmap des interactions (likes, shares, highlights, drops) le long des paragraphes du texte.
  - `GET /v1/creator/analytics/co-authors?article_id=...` : répartition des apports d'audience par co-auteur.
  - `GET /v1/creator/analytics/media-bridge` : flux croisé (clics vers profil auteur vs clics vers le média).
  - `GET /v1/creator/analytics/timeseries?group_by=author` : séries temporelles multi-auteurs (support modes lignes et stacked).

### B. Frontend (`apps/studio` & `packages/analytics`)
- **Visualiseur In-Situ (Article Engagement Map)** :
  - Mini-carte verticale le long du texte ou vue par blocs indiquant les points chauds (climax, partages, surlignages).
- **TimeseriesMultiChart (SVG natif)** :
  - Modes Superposé (lignes) / Cumulé (stacked area) / Part relative (100%).
  - Contrôles dynamiques (pills d'auteurs on/off/solo, sélecteur de période).
- **Passerelle d'Audience (Sankey / Flux visuel)** :
  - Visualisation simple du flux : Lecteurs Média ➔ Lecteurs Article ➔ Abonnés Média & Abonnés Profil Auteur.

---

## 3. Découpage des Lots

### Lot 1 — Capture In-Situ & Modèle Go
- [ ] Enregistrement du `scroll_depth` et `paragraph_index` sur les likes, reposts, bookmarks et partages.
- [ ] Tracking du passage Média ➔ Profil Auteur (`author_profile_click_from_media`).
- [ ] Endpoints Go pour la heatmap in-situ et le flux média ⇄ auteur.

### Lot 2 — Graphique Temporel Multi-Séries (`TimeseriesMultiChart`)
- [ ] Moteur SVG multi-lignes et aires empilées avec couleurs distinctes et palette accessible.
- [ ] Curseur unifié multi-auteurs au hover avec tooltip d'agrégation.
- [ ] Système de pills interactifs d'auteurs (toggle, solo, select all).

### Lot 3 — Heatmap In-Situ & Vues Collaboratives
- [ ] Composant visuel d'inspection in-situ sur l'article (où sont les likes, partages et décrochages dans le texte).
- [ ] Bloc Co-auteurs : ventilation de l'audience apportée par chaque collaborateur.
- [ ] Bloc Passerelle Média ⇄ Auteur : mesure des conversions d'abonnés personnelles issues du média.

### Lot 4 — Multi-Tenants & Rôles
- [ ] Sélecteur de tenant pour les comptes multi-publications.
- [ ] Vues adaptatives selon le profil (Solo, Contributeur, Co-auteur, Équipe).
- [ ] Tests Playwright et conformité vie privée (zéro fingerprinting intrusif).

---

## 4. Garde-fous & Principes Fondamentaux
- **Respect de la vie privée** : Métriques agrégées, conformité stricte RGPD/CNIL, aucun profilage comportemental individuel des lecteurs.
- **Légèreté & Performance** : Graphiques SVG purs sans bibliothèques tierces lourdes, requêtes SQL optimisées avec mise en cache Redis.
- **Souveraineté de l'auteur** : Les données d'audience d'un co-auteur ou d'un créateur lui appartiennent et alimentent la copie souveraine de son article.
