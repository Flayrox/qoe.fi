# Console admin — plan vivant

> **Ce fichier est la mémoire du chantier.** À chaque reprise (nouvelle session,
> contexte compacté), le lire en entier avant de coder. Il dit ce qui est fait,
> ce qui reste, dans quel ordre, et comment vérifier.
>
> **Instructions utilisateur :** écrire dans la section
> [« 📝 Instructions »](#-instructions) en bas. Elle est prioritaire sur le
> reste du plan.

Dernière mise à jour : 2026-11-06 · branche `dev` · travail non poussé · dernier commit `6c6ac8b9`.

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

- [~] **B1. Facettes de filtre** : barre compacte (chips) au-dessus de chaque
      grille — file, état SLA, priorité, rôle, statut de compte, assignation.
      Les facettes sont **déclarées dans la spec de colonne/ressource**, pas
      codées par écran.
      *Fait : comptes (rôle, statut), vue d'ensemble (file, SLA), triage
      (file, priorité, SLA). Reste : files de modération, notifications, imports.*
- [x] **B2. État dans l'URL** : tri, facettes, densité et colonnes visibles
      vivent dans `?sort=…&f=statut:open&d=compact&c=email,role`. Une URL est
      partageable et rechargeable (`components/shell/grid-view.ts`).
- [x] **B3. Vues sauvegardées** : nommer une combinaison (filtres + tri +
      colonnes + densité), l'épingler, la rejouer ; stockage local par personne
      (`qoe.admin.views.<resource>`). *Reste : passage en base
      (`admin_saved_views`) pour les vues d'équipe.*
- [~] **B4. Colonnes configurables** : masquer/afficher, réordonner, largeur
      minimale ; mémorisé avec la vue. *Fait : masquer/afficher + mémorisation.
      Reste : réordonnancement, largeur.*
- [x] **B5. Sélection + actions groupées** : `DataGrid` (`selectable`,
      `bulkActions`, `TableSelectAllCell`/`TableSelectionCell`, « Tout
      désélectionner ») + barre de 28 px réservée à la sélection +
      `WorkTable` (« M'assigner » en boucle séquentielle auditée, **Annuler**
      qui remet à zéro l'assignation des lignes qui n'en avaient pas).
      *Reste : priorité / échéance / statut groupés.*
- [x] **B6. Panneau de détail 480 px** : `Drawer` de `@qoe/ui/drawer` ouvert
      par `Entrée` (`onRowOpen`) ou le clic droit (« Aperçu du dossier ») ;
      identifiant copiable, file, priorité, SLA, échéance, assigné, actions
      « M'assigner » / « Ouvrir » / « Fermer ».
- [x] **B7. Clavier** : `j/k` curseur (surbrillance + `scrollIntoView`),
      `x` sélection, `Entrée` détail (`onRowOpen`) ou navigation (`rowHref`),
      `a` assigner (`onAssign`), `r` `router.refresh()`, `?` aide en surimpression,
      `Échap` ferme/vide — sur tout `DataGrid` focusable. *Reste : `e` édition
      inline, `/` recherche, `f` facettes, `v` vues, `g`+lettre.*
- [ ] **B8. Édition inline générique** : champ scalaire déclaré dans la spec,
      écriture optimiste, statut `Audité · à …`, rollback sur échec.
- [~] **B9. Chips métriques** dans le header de chaque écran (API ms, p95,
      volumes, stockage, outbox) — zéro hauteur supplémentaire. *Fait :
      `components/shell/MetricChips.tsx` (24 px, tons, liens) et `/admin/work`
      (ouverts, à moi, SLA dépassés, une chip par file) à la place des six
      cartes. Reste : dashboard, utilisateurs, exports, outbox.*

### Lot C — plan de contrôle (à faire)

- [ ] **C1. `ResourceSpec`** : extraire `query` + `facets` + `rowActions` +
      `detail` de chaque écran dans un registre `lib/admin-resources.ts`.
      Migrer d'abord `reports`, `appeals`, `users`, `deliveries`.
- [~] **C2. `/admin/settings`** : *fait* l'inventaire en lecture (catalogue
      typé + « qui peut changer »). Reste l'écriture (diff, validation, audit).
      Registre de réglages typés — clé, type,
      défaut, capacité requise, portée (global/tenant/utilisateur), rayon
      d'impact, N2 requis, audit, rollback. Catégories : inscriptions,
      modération, emails, médias, stockage, limites & quotas, API, légal,
      features, sécurité, maintenance. Diff avant écriture + « qui peut changer ».
- [ ] **C3. Matrice rôles × capacités** éditable, avec simulateur
      « qui peut X ? » et revue d'accès périodique.
- [x] **C4. Audit toujours écrit** : vérifié dans
      `apps/api/internal/modules/admin/service_aux.go` — `logAudit` insère sans
      consulter `admin-audit-log` ; les tests `admin/audit_test.go` couvrent les
      deux états du flag.
- [ ] **C5. Double validation** sur l'irréversible (motif obligatoire + ticket).
- [ ] **C6. Routes Go manquantes** : flags (`admin.flags.write`) et annonce
      globale (capacité de communication, pas `admin.config.write`).
- [ ] **C7. Vocabulaire unique TS ↔ Go** (statuts de campagne notamment :
      `LEGAL_NOTICE` vs `legal.version_notice`), verrouillé par test de parité.
- [ ] **C8. Matrice de rôles corrigée** : `content` ne doit plus détenir
      `admin.legal.write` ; découper `ops`.
- [ ] **C9. File agrégée** : assignation et SLA uniformes sur les six files.

### Lot D — crédibilité plateforme (à faire)

- [ ] **D1. DSAR** : export et effacement par personne, avec preuve et délai.
- [ ] **D2. Rétention** : politiques par table, purge planifiée, journal.
- [ ] **D3. Exports signés** déjà présents côté légal — généraliser aux autres
      registres (audit, consentement, abonnés).
- [ ] **D4. SLO + alertes** par surface (latence API, erreurs, outbox, migration).
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
