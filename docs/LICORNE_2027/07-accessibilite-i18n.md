# ♿ A7 — Accessibilité & internationalisation

> **But :** que n'importe qui, avec n'importe quel appareil ou assistif, puisse lire et
> publier — et que la plateforme parle vraiment **fr et en**, sans chaîne en dur.
> **Porte de sortie de l'axe :** WCAG 2.2 AA sur les parcours clés (prouvé par audit
> automatisé + revue manuelle), et zéro chaîne d'interface non localisée.

**État actuel :** Lingui est configuré (`pnpm lingui compile` au build, catalogues fr/en),
mais les écrans récents (pages « rejoindre » collaboration/média, éditeur d'attribution,
section invitations du Studio) sont en **français en dur**, et `pnpm intl:extract` n'a
pas été relancé depuis ces ajouts. Aucun audit d'accessibilité n'est versionné.

**Périmètre principal :** `apps/core/src/**`, `apps/studio/src/**`, `apps/tenants/src/**`, `apps/mobile/src/**`, `packages/ui`, `packages/i18n`, `locales/**`.

| # | Lot | Fichiers | Sortie vérifiable | Taille |
| --- | --- | --- | --- | --- |
| 7.1 | Audit a11y automatisé (axe-core) sur les parcours clés + rapport versionné | `e2e/**`, `docs/LICORNE_2027/annexe-a11y.md` (nouveau) | liste de violations classées par gravité | M |
| 7.2 | Corriger les violations bloquantes de l'audit (contrastes, labels, rôles) | `packages/ui`, apps | 0 violation critique sur les parcours clés | L |
| 7.3 | Navigation clavier complète (focus visible, ordre logique, `skip link`, pièges à focus) | `packages/ui`, layouts | parcours clés réalisables sans souris, testé | M |
| 7.4 | Lecteurs d'écran : vérification manuelle (VoiceOver/TalkBack) sur 5 parcours, corrections | apps + `docs` | compte rendu daté + corrections appliquées | M |
| 7.5 | Formulaires : labels, aides, erreurs annoncées (`aria-live`), champs obligatoires annoncés | `packages/ui`, apps | aucun formulaire non conforme | M |
| 7.6 | Composants riches (menus, dialogs, onglets, autocomplétion `@username`) conformes ARIA | `packages/ui` | comportement clavier + ARIA testé | M |
| 7.7 | `prefers-reduced-motion`, zoom 200 %, grands textes, cibles tactiles ≥ 44 px | design tokens, apps | respect vérifié sur les parcours clés | M |
| 7.8 | Pages publiques (articles, profils, blogs tenants) : structure sémantique, titres, `lang` | core, tenants | structure vérifiée par audit | M |
| 7.9 | Extraire toutes les chaînes nouvelles avec Lingui (fr + en) | locales, apps concernées | `pnpm intl:extract` à jour, aucun catalogue manquant | M |
| 7.10 | Éliminer les chaînes en dur restantes (gate de détection) | apps | gate CI : aucune chaîne d'interface hors catalogue | M |
| 7.11 | Pluriels, dates, nombres, devises et fuseaux via les formatters partagés | `packages/formatters` | aucun formatage manuel | M |
| 7.12 | Contenus légaux et emails transactionnels bilingues, vérifiés | `legal/content`, emails | aucune langue manquante | M |
| 7.13 | Préparer le RTL (logique de mise en page, sens des icônes) sans l'activer | `packages/ui` | aucune hypothèse LTR codée en dur dans les composants | M |
| 7.14 | Tests automatisés de non-régression a11y (axe) sur les parcours clés | CI | régression a11y bloquante | M |

**Anti-collision :** cet axe touche l'interface partout — à mener par surface (core et
tenants d'abord, puis studio, puis mobile), jamais en même temps que A8 sur la même app.

**Reprise à froid :** 7.1 (constat) → 7.2 → 7.9-7.10 (l'i18n est un avantage immédiat
pour un produit « licorne »).
