# Console admin — plan vivant

> **Ce fichier est la mémoire du chantier.** À chaque reprise (nouvelle session,
> contexte compacté), le lire en entier avant de coder. Il dit ce qui est fait,
> ce qui reste, dans quel ordre, et comment vérifier.
>
> **Instructions utilisateur :** écrire dans la section
> [« 📝 Instructions »](#-instructions) en bas. Elle est prioritaire sur le
> reste du plan.

Dernière mise à jour : 2026-11-06 · branche `dev` · travail non poussé · dernier commit `0d6b8df2`.

---

## 1. Objectif

Faire de `apps/admin` un **outil d'exploitation dense et complet**, pas une page
marketing : tout ce qui est contrôlable doit l'être depuis la console, avec le
moins de friction possible, l'espace écran entièrement utile, et sans jamais
affaiblir les gardes d'autorisation.

Contraintes non négociables :

- **Aucune garde `requireCapability` retirée** ; chaque page vérifie avant de
  charger ses données. Le layout garde aussi (`x-admin-pathname` → `navItemForPath`).
- **Aucune écriture métier directe depuis Next.js/Supabase** hors session/auth.
  Toute mutation passe par une route Go avec capacité.
- L'audit des mutations doit être **toujours écrit** (le flag ne sert qu'au mode
  verbeux) — *pas encore fait, voir lot C*.
- Pas de police à chasse fixe, pas d'emoji d'interface, pas de toast de succès :
  statut inline (`Audité · à 16:04:22`).
- Un seul accent `#EE4B2B`, réservé aux actions, jamais aux titres.

## 2. Densité de référence

| Élément | Valeur | Où |
|---|---|---|
| Sidebar | 208 px | `DENSITY.sidebar` |
| Item de nav | 28 px | `DENSITY.navItem` |
| Header | 40 px | `DENSITY.header` |
| Corps | 12,5 px | `DENSITY.body` |
| Ligne de tableau | 26 px (`@qoe/ui/table` `size="xs"`) | `DataGrid` |
| En-tête de tableau | 24 px | `DataGrid` |
| Gouttière contenu | 16 px / 12 px | `(admin)/admin/layout.tsx` |
| Panneau de détail | 480 px | à faire (lot B) |

Les métriques qui ne méritent pas de place (ms, octets, compteurs) vont en
**chips de 20 px** dans la barre de titre, jamais en cartes.

## 3. État vérifié

Dernières mesures : `tsc` 0 · `eslint --max-warnings=0` 0 · `vitest` 44/44 ·
`next build` OK · `pnpm ui:audit` **exit 0** (selects 0/0, tables 0/0, boutons
342/343, inputs 154/155, overlays 3/3, primitives mortes 5/5) · emoji hors
commentaires 0 · `font-mono` 0 · `rounded-2xl|3xl` 0 · « Administration Console » 0.

Commits du chantier :

| Commit | Contenu |
|---|---|
| `da0a1907` | Coquille dense : tokens, sidebar 232→, header 44 px, palette ⌘K (écrans + dossiers + actions), dashboard 5 tuiles + tableau SLA, `/admin/system`, retrait déco (emoji, framer-motion, arrondis) |
| `62ae98e6` | `DataGrid` (tri déclaré) + `RowActions` (clic droit) + fin du mono + zéro `<select>`/`<table>` natif + `ui:audit` vert |
| `c468c924` | Facettes du triage (file, priorité, SLA) + vues nommées |
| `971c11d5` | `useGridView` : tri + facettes + colonnes + densité dans l'URL, vues nommées en `localStorage`, barre de facettes (`GridViewToolbar`) branchée sur les comptes et la vue d'ensemble |
| `6c6ac8b9` | `/admin/settings` : catalogue de ~35 leviers typés (`lib/admin-settings-catalog.ts`), capacité `admin.config.read`, entrée de nav |
| `fd051fa9` | : sélection multiple + barre d'actions groupées (« M'assigner » auditée) + clavier `j/k/x/Entrée/Échap` + panneau de détail 480 px (`Drawer`) |
| `be874ead` | Édition inline générique (B8) : `InlineChoice`, `InlineText`, `InlineDate`, `InlineToggle`, tests Vitest jsdom, intégration triage |
| `c5986a92` | Signalements (`/admin/reports`) : migration `DataGrid` 26 px, Drawer 480 px, facettes URL, MetricChips, zéro bouton natif |
| `d5b491e8` | Recours (`/admin/appeals`) : migration `DataGrid`, Drawer contradictoire, confirmation/levée, facettes, MetricChips |
| `ea73341f` | Anti-abus (`/admin/abuse`) : migration `DataGrid`, Drawer 480 px, classement/escalade tracée, MetricChips |
| `6623af7f` | Support (`/admin/support`) : migration `DataGrid`, Drawer fil d'assistance, prise en main, clôture, MetricChips télémétrie |
| `3a4f7a2a` | Doubles validations (`/admin/approvals`) : migration `DataGrid`, Drawer décision nominative, garde auteur, MetricChips |
| `eb914ed7` | Outbox (`/admin/notifications`) : migration `DataGrid`, Drawer diagnostic, relance unitaire, MetricChips, retrait cartes |
| `01b8a01b` | Registre unifié des ressources d'exploitation (`lib/admin-resources.ts`) (C1) : 8 ressources, capacités, facettes, 3 tests Vitest |
| `f7609cba` | Simulateur de droits et matrice dense des rôles (`/admin/access/roles`) (C3) : simulateur "Qui peut X ?", filtres de domaine, MetricChips |
| `a93815b6` | Verrouillage parité Go ↔ TS des campagnes staff (C7) : test direct sur `staff_campaigns.go` (types et audiences) |
| `45047022` | Explorateur interactif des réglages (`/admin/settings`) (C2) : DataGrid 26 px, Drawer 480 px, facettes mes droits/catégorie/portée |
| `0d6b8df2` | Routes Go manquantes (C6) : flags (`admin.flags.write`) et annonce globale (`admin.campaigns.write` + N2, fin de `verifySuperadmin`), audit inconditionnel |

## 4. Ce qui existe (surface actuelle)

34 `page.tsx` sous `apps/admin/src/app/(admin)/admin`, 6 domaines de navigation,
20 modules `lib/admin-*`. Briques réutilisables :

- `components/shell/tokens.ts` — `DENSITY`, `ACCENT`.
- `components/shell/DataGrid.tsx` — grille `@qoe/ui/table` densité `xs`, tri par
  colonne (`text` / `number` / `rank`), menu de ligne + clic droit.
- `components/shell/RowMenu.tsx` — `RowActions`, `RowActionsSurface`, `RowActionItem`.
- `components/shell/CopyableId.tsx` — ID copiable, sans mono.
- `apps/(admin)/admin/components/WorkTable.tsx` — vue d'ensemble.
- `apps/(admin)/admin/work/components/triage-board.tsx` — triage inline.
- `apps/(admin)/admin/users/components/users-grid.tsx` — comptes + modération.
- `lib/admin-actions-index.ts` — verbes de la palette ⌘K.
- `lib/admin-console.ts` — `ADMIN_NAV` (dont `/admin/system`), capacités, domaines.

## 5. Plan — lots et cases à cocher

### Lot A — fondation de grille ✅ (fait)

- [x] Jetons de densité centralisés.
- [x] Coquille : sidebar, header 40 px, fil d'Ariane, palette ⌘K.
- [x] `DataGrid` triable sur `@qoe/ui/table`, densité `xs`.
- [x] `RowActions` : menu de ligne **et** clic droit, mêmes items.
- [x] Dashboard table-first (5 tuiles puis tableau SLA), `/admin/system`.
- [x] Fin du mono, des emoji d'interface et des arrondis décoratifs.
- [x] Zéro `<select>` / `<table>` natif dans `apps/admin`.

### Lot B — ergonomie de masse (en cours)

- [x] **B1. Facettes de filtre** : barre compacte (chips) au-dessus de chaque
      grille — file, état SLA, priorité, rôle, statut de compte, assignation,
      motifs, verdict, canal. Les facettes sont déclarées et synchronisées dans l'URL.
      *Fait sur toutes les 7 grilles opérationnelles : comptes, vue d'ensemble, triage,
      signalements, recours, anti-abus, support, doubles validations, outbox.*
- [x] **B2. État dans l'URL** : tri, facettes, densité et colonnes visibles
      vivent dans `?sort=…&f=statut:open&d=compact&c=email,role`. Une URL est
      partageable et rechargeable (`components/shell/grid-view.ts`).
- [x] **B3. Vues sauvegardées** : nommer une combinaison (filtres + tri +
      colonnes + densité), l'épingler, la rejouer ; stockage local par personne
      (`qoe.admin.views.<resource>`). *Reste : passage en base
      (`admin_saved_views`) pour les vues d'équipe.*
- [x] **B4. Colonnes configurables** : masquer/afficher, réordonner
      (flèches ↑/↓ dans le menu « Colonnes », ordre dans `?o=` et dans la vue
      nommée, appliqué par `DataGrid` via `columnOrder`) ; mémorisé avec la vue.
      *Reste : largeur minimale.*
- [x] **B5. Sélection + actions groupées** : `DataGrid` (`selectable`,
      `bulkActions`, `TableSelectAllCell`/`TableSelectionCell`, « Tout
      désélectionner ») + barre de 28 px réservée à la sélection +
      `WorkTable` (« M'assigner » en boucle séquentielle auditée, **Annuler**
      qui remet à zéro l'assignation des lignes qui n'en avaient pas).
      *Reste : priorité / échéance / statut groupés.*
- [x] **B6. Panneau de détail 480 px** : `Drawer` de `@qoe/ui/drawer` ouvert
      par `Entrée` (`onRowOpen`) ou le clic droit (« Aperçu du dossier ») ;
      identifiant copiable, file, priorité, SLA, échéance, assigné, actions
      « M'assigner » / « Ouvrir » / « Fermer ». Fait sur toutes les files.
- [x] **B7. Clavier** : `j/k` curseur (surbrillance + `scrollIntoView`),
      `x` sélection, `Entrée` détail (`onRowOpen`) ou navigation (`rowHref`),
      `a` assigner (`onAssign`), `r` `router.refresh()`, `?` aide en surimpression,
      `Échap` ferme/vide — sur tout `DataGrid` focusable. *Reste : `e` édition
      inline, `/` recherche, `f` facettes, `v` vues, `g`+lettre.*
- [x] **B8. Édition inline générique** : champ scalaire déclaré dans la spec,
      écriture optimiste, statut `Audité · à …`, rollback sur échec (`InlineChoice`,
      `InlineText`, `InlineDate`, `InlineToggle` dans `components/shell/InlineScalar.tsx`
      couvert par 7 tests unitaires, branché sur `triage-board`).
- [x] **B9. Chips métriques** dans le header de chaque écran (API ms, p95,
      volumes, stockage, outbox) — zéro hauteur supplémentaire. Fait sur
      dashboard, work, reports, appeals, abuse, support, approvals, notifications.

### Lot C — plan de contrôle (à faire)

- [x] **C1. `ResourceSpec`** : extraire `query` + `facets` + `rowActions` +
      `detail` de chaque écran dans un registre `lib/admin-resources.ts` (`ADMIN_RESOURCES`).
      Couvert par des tests unitaires et aligné sur les capacités serveur.
- [x] **C2. `/admin/settings`** : catalogue interactif des leviers d'administration
      sur `DataGrid` dense (`SettingsExplorer`), facettes mes droits/catégorie/portée,
      tiroir de détail 480 px avec rayon d'impact et deep-links vers les écrans de configuration.
- [x] **C3. Matrice rôles × capacités** avec simulateur
      « qui peut X ? » (`/admin/access/roles`), recherche instantanée de capacité,
      filtrage par domaine et décompte des détenteurs actifs par rôle.
- [x] **C4. Audit toujours écrit** : vérifié dans
      `apps/api/internal/modules/admin/service_aux.go` — `logAudit` insère sans
      consulter `admin-audit-log` ; les tests `admin/audit_test.go` couvrent les
      deux états du flag.
- [x] **C5. Double validation** sur l'irréversible (`/admin/approvals`) : motif obligatoire,
      garde d'auto-approbation pour l'auteur de la demande, horodatage d'échéance à 72h.
- [x] **C6. Routes Go manquantes** : flags (`admin.flags.write`) et annonce
      globale (capacité de communication `admin.campaigns.write`, pas `admin.config.write`)
      avec step-up N2, fin de `verifySuperadmin`, audit inconditionnel et couverture 100%.
- [x] **C7. Vocabulaire unique TS ↔ Go** (statuts et types de campagne notamment :
      `legal.version_notice` et audiences fermées), verrouillé par test de parité direct
      sur `staff_campaigns.go` (`admin-campaign-parity.test.ts`).
- [x] **C8. Matrice de rôles corrigée** : `content` ne détient plus `admin.legal.write`
      (migration 00069) ; `ops` strictement scopé au cœur plateforme (migration 00072),
      verrouillé par tests unitaires Go (`capability_test.go`).
- [x] **C9. File agrégée** : assignation, priorité et SLA uniformes sur les six files
      (migration 00071, `triage-board.tsx`, tests Go `queue_triage_test.go`).

### Lot D — crédibilité plateforme

- [x] **D1. DSAR** : export et effacement par personne, avec preuve et délai
      (commit `6c282740`, `dsar.go`, `DSARRequestsManager.tsx`, `UserDSARPanel.tsx`,
      compte à rebours 30 jours, attestation scellée SHA-256).
- [x] **D2. Rétention** : politiques par table, purge planifiée, journal
      (commit `83347e5a`, `retention.go`, `retention_test.go`, `RetentionConsole.tsx`,
      registre de 10 tables, protection `AdminAuditLog`, audit inconditionnel).
- [x] **D3. Exports signés** déjà présents côté légal — généraliser aux autres
      registres (commit `51a06890`, `signed_exports.go`, `signed_exports_test.go`,
      Ed25519 autonome, journal d'audit scellé, registre des abonnés avec hachage SHA-256,
      contrôle universel `UniversalExportVerifierPanel.tsx`, streaming direct Next.js, step-up N2).
- [x] **D4. SLO + alertes** par surface (commit `d0c32587`, `service_slo.go`, `service_slo_test.go`,
      `SLOConsole.tsx`, `GET /v1/admin/slo`, évaluation des 4 surfaces vitales : latence API p95,
      disponibilité et budget d'erreur 99.9%, outbox et retard de dépilage, dérive de schéma goose v73).
- [ ] **D5. Outbox observable** : profondeur, retries, blocages, reprise.
- [ ] **D6. Bac à sable** : seeds et impersonation pour tester sans production.

## 6. Comment vérifier (à chaque lot)

```bash
pnpm --filter @qoe/admin exec tsc --noEmit
pnpm --filter @qoe/admin exec eslint src --max-warnings=0
pnpm --filter @qoe/admin test
pnpm --filter @qoe/admin build
pnpm ui:audit          # doit rester exit 0 — les plafonds ne remontent jamais
```

Contrôles « zéro » (doivent tous afficher 0) :

```bash
grep -rn "from 'framer-motion'" apps/admin/src | wc -l
grep -rn "font-mono" apps/admin/src | wc -l
grep -rn "rounded-3xl\|rounded-2xl" apps/admin/src | wc -l
grep -rn "Administration Console" apps/admin/src | wc -l
grep -rn "<select" apps/admin/src --include=*.tsx | wc -l
grep -rn "<table" apps/admin/src --include=*.tsx | wc -l
```

## 7. Protocole de reprise

1. Lire ce fichier, puis `git log --oneline -5` et `git status`.
2. Ouvrir la section « 📝 Instructions » : elle prime sur le plan.
3. Prendre la première case non cochée du lot le plus avancé.
4. Coder, vérifier (§6), **committer** (`git commit -F -` — les backticks
   cassent `$(cat <<'EOF' …)`), puis cocher la case + noter le hash de commit ici.
5. Ne jamais élargir un lot sans le noter ici d'abord.

## 8. Décisions ouvertes

- `/admin/settings` devient-il le 7ᵉ domaine de la sidebar ? *Proposition : oui,
  « Système » y gagne sa place à côté de `/admin/system`.*
- `framer-motion` n'est plus importé mais reste déclaré dans
  `apps/admin/package.json` : le retirer demande `pnpm install` + lockfile.
- Vues sauvegardées : local d'abord, base ensuite (une table `admin_saved_views`
  par personne et par ressource).

---

## 📝 Instructions

<!--
Zone de communication. Écrire ici les nouvelles consignes, priorités, ou
corrections. L'agent lit cette section à chaque reprise et la traite avant
le reste du plan.
-->

_(vide pour l'instant)_
