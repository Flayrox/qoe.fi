# Analytics Studio & Média Multi-Auteurs — Plan Vivant

> **Ce fichier est la mémoire du chantier Analytics.** À chaque reprise, le lire avant de coder, puis le mettre à jour après chaque lot : ce qui est fait, ce qui reste, dans quel ordre et comment vérifier.

Dernière mise à jour : 2026-11-15 · branche `dev`

---

## 1. Objectifs Métier & Fonctionnels

Permettre aux créateurs individuels, équipes éditoriales et médias multi-auteurs/multi-tenants de :
1. **Distinguer et comparer les courbes de chaque créateur / auteur** sur les séries temporelles (vues, lectures complètes, temps de lecture, conversions).
2. **Additionner (mode empilé / cumulé) ou superposer (mode multi-lignes)** les courbes pour visualiser la part de chaque rédacteur dans la dynamique globale du média.
3. **Manipuler interactivement les séries** :
   - Masquer/afficher un auteur en un clic (toggle on/off).
   - Isoler un auteur ("solo") pour analyser sa trajectoire.
   - Comparer 2 ou N auteurs sélectionnés.
4. **Ventiler les KPIs par créateur** :
   - Volume de publication vs volume de lecture.
   - Taux de complétion moyen et temps moyen par auteur.
   - Attribution des nouveaux abonnés (qui convertit le plus de lecteurs fidèles).
5. **Support Multi-Tenant & Multi-Publications** :
   - Sélecteur de média / publication pour les studios gérant plusieurs tenants.
   - Comparaison cross-publications pour les éditeurs multi-médias.

---

## 2. Architecture Technique

### A. Backend (Go `apps/api`) — Source de vérité
- **Routes Analytics Média** :
  - `GET /v1/creator/analytics/authors` : liste des contributeurs ayant publié sur le média avec leurs totaux sur la période.
  - `GET /v1/creator/analytics/timeseries?group_by=author` : points temporels journaliers ventilés par `author_id` (date, author_id, views, reads, reading_time).
  - `GET /v1/creator/analytics/authors/ranking` : tableau de bord comparatif des auteurs (articles, vues moyennes, complétion, abonnés générés).
- **Stockage & Performance** :
  - Requêtes SQL agrégées (`DATE_TRUNC('day', ...)` + `GROUP BY author_id, day`).
  - Cache Redis (`analytics:timeseries:<media_id>:<period>:<group_by>`) avec TTL court (ex: 5-15 min) invalidé sur nouvelles sessions de lecture.

### B. Frontend (`apps/studio` & `packages/analytics`)
- **Composant `TimeseriesMultiChart` (SVG / canvas ultra-léger et accessible)** :
  - Modes d'affichage :
    - `line` : courbes superposées lissées avec une couleur distincte et accessible par auteur.
    - `stacked` : aires empilées pour visualiser le total cumulé et la composition interne.
    - `percent` : part relative (100% stacked) montrant l'évolution des parts d'audience.
  - Curseur unifié au survol (tooltip multi-auteurs affichant la valeur de chacun et le total à la date T).
  - Légende interactive avec pills d'auteurs (avatar, nom, couleur, checkbox/pastille).
- **Contrôles d'agrégation & filtres** :
  - Période : 7j, 30j, 90j, 1 an, tout.
  - Métrique sélectionnée : Vues uniques, Lectures complètes, Heures de lecture, Abonnements.
  - Filtre "Tous / Aucun / Moi uniquement".

---

## 3. Découpage des Lots

### Lot 1 — Modèle de données & Requêtes Go
- [ ] Requête SQLc / SQL d'agrégation temporelle par auteur (`author_id`) sur les sessions de lecture et vues.
- [ ] Endpoint `GET /v1/creator/analytics/timeseries` enrichi avec paramètre `breakdown=author`.
- [ ] Tests unitaires Go dans `apps/api/internal/modules/creator/analytics_test.go`.

### Lot 2 — Composant Graphique Multi-Séries (`TimeseriesMultiChart`)
- [ ] Support multi-séries dans `TimeseriesChart` ou nouveau composant dédié.
- [ ] Calcul des coordonnées superposées vs empilées (stacked area).
- [ ] Tooltip interactif affichant le breakdown complet au point de survol.
- [ ] Palette de couleurs harmonieuse et conforme au design system QOE (light/dark mode).

### Lot 3 — Interface & Contrôles Utilisateur (Studio)
- [ ] Barre de filtres d'auteurs (pills cliquables avec toggle, solo, reset).
- [ ] Sélecteur de mode : Lignes séparées / Cumul empilé.
- [ ] Tableau récapitulatif des auteurs avec tri (vues, complétion, abonnés).
- [ ] Gestion du cas "Créateur solo" (affichage simplifié sans clutter multi-auteurs).

### Lot 4 — Multi-Tenants & Export
- [ ] Sélecteur de tenant/publication pour les comptes multi-médias.
- [ ] Export CSV/JSON ventilé par créateur pour les bilans d'équipe.
- [ ] Tests E2E Playwright et audit d'accessibilité.

---

## 4. Règles & Garde-fous
- Respect absolu de la vie privée (zéro fingerprinting intrusif, métriques agrégées).
- Zéro dépendance lourde externe pour les graphiques (conserver l'approche SVG rapide et contrôlée du repo).
- Support responsive parfait (mobile, tablette, desktop).
