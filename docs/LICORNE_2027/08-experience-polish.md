# ✨ A8 — Expérience & finition

> **But :** que chaque écran se comporte proprement dans **tous** ses états (vide,
> chargement, erreur, hors ligne, hors droits), et que les cinq applications racontent
> la même histoire.
> **Porte de sortie de l'axe :** aucun écran sans état d'erreur ni de chargement, parité
> web/mobile documentée et tenue, et une cohérence visuelle vérifiée entre core, studio,
> tenants, admin et mobile.

**État actuel :** le design system existe (`packages/ui`, `packages/theme`, direction
« Silicon Valley/Starship »), mais plusieurs surfaces récentes n'ont pas leurs états
(chargement/erreur/vide) et la parité web/mobile est décrite dans `docs/PARITY_WEB_MOBILE.md`
sans vérification automatique.

**Périmètre principal :** `apps/{core,studio,tenants,admin,mobile}/src/**`, `packages/{ui,theme}`.

| # | Lot | Fichiers | Sortie vérifiable | Taille |
| --- | --- | --- | --- | --- |
| 8.1 | Inventaire des états manquants par surface (vide / chargement / erreur / hors droits) | `docs/LICORNE_2027/annexe-etats.md` (nouveau) | tableau surface × état, les trous nommés | M |
| 8.2 | Combler les états manquants du Studio (dont invitations, Médias, éditeur) | `apps/studio/src/**` | aucun écran sans ses états, vérifié visuellement | M |
| 8.3 | Idem core (lecture, réglages, profil) | `apps/core/src/**` | idem | M |
| 8.4 | Idem tenants (blogs publics) et admin | `apps/{tenants,admin}/src/**` | idem | M |
| 8.5 | Idem mobile (listes, profils, réglages, hors réseau) | `apps/mobile/src/**` | idem + comportement hors ligne | M |
| 8.6 | Gestion d'erreur homogène : message utile, action de reprise, jamais une page blanche | tout | `error.tsx`/boundaries partout, message + retry | M |
| 8.7 | Chargements perçus : squelettes au lieu de spinners génériques, transitions stables (CLS) | `packages/ui`, apps | aucune page qui « saute » | M |
| 8.8 | Notifications : texte clair, action unique, destination correcte (deep links) | `packages/ui`, Go | chaque type de notification a un écran réel (fin des liens morts) | M |
| 8.9 | Parité web/mobile : checklist versionnée + vérification automatique des écrans manquants | `docs/PARITY_WEB_MOBILE.md`, CI | écart calculé automatiquement, pas à la main | M |
| 8.10 | Cohérence du design system : tokens, espacements, typographie, thèmes | `packages/ui`, `packages/theme` | aucun style ad hoc hors tokens | L |
| 8.11 | Cohérence de navigation et de vocabulaire entre les 5 apps | apps | glossaire + écarts corrigés | M |
| 8.12 | Réglages unifiés (compte, confidentialité, collaboration, notifications) sur web et mobile | apps | même modèle de données de bout en bout | M |
| 8.13 | Onboarding créateur : parcours complet sans zone morte, mesuré | studio | parcours testé de bout en bout | M |
| 8.14 | Recherche : même expérience et mêmes filtres partout (core, studio, mobile) | apps, SDK | comportement identique vérifié | M |

**Anti-collision :** un lot = une app. Ne jamais faire 8.2 et 8.10 en parallèle
(le design system touche tous les composants).

**Reprise à froid :** 8.1 (inventaire) puis 8.6 (erreurs) et 8.8 (liens morts : un bug
utilisateur très visible se cache souvent là).
