# 🛡️ A5 — Sécurité & vie privée

> **But :** qu'aucun point d'entrée ne puisse être utilisé contre la plateforme ou ses
> utilisateurs, et que la conformité (RGPD) soit **prouvable**, pas déclarative.
> **Porte de sortie de l'axe :** chaque surface d'écriture (image, texte, fichier, API)
> est filtrée ou explicitement exemptée, les secrets ne sont nulle part dans le repo,
> et l'export/suppression de compte fonctionnent réellement.

**Source :** [`../SECURITY_UPLOAD_MODERATION_AUDIT.md`](../SECURITY_UPLOAD_MODERATION_AUDIT.md).
Les trous identifiés y deviennent des lots ci-dessous (5.1 → 5.5).

**Périmètre principal :** `apps/api/internal/**`, `packages/{moderation,supabase}`, `apps/mobile/**`, `apps/*/src/**`, Caddy, Supabase (RLS).

| # | Lot | Fichiers | Sortie vérifiable | Taille |
| --- | --- | --- | --- | --- |
| 5.1 | **P0 — Avatars/bannières mobile** : passer par la pipeline complète (magic bytes, ré-encodage, EXIF, modération) au lieu de l'écriture directe dans Storage | `apps/mobile/src/lib/upload.ts`, route serveur | plus aucune écriture directe non filtrée ; test qui le prouve | L |
| 5.2 | **P0 — Journal de modération** : chaque décision (image + texte) tracée (hash, verdict, provider, latence, surface, fail-open) | nouveau (Go + Postgres + migration) | une ligne par décision, consultable, sans PII | M |
| 5.3 | Mode **fail-closed** activable (par drapeau) pour les surfaces sensibles (avatars, bannières, logos de Média) | `packages/moderation` | panne du provider → rejet explicite, testé | S |
| 5.4 | **Texte** : brancher `fastPath` + `OpenAiModerator` à l'écriture (articles, pensées, commentaires, réponses, MP, bios, Médias, catégories), décision asynchrone non bloquante | handlers Go, asynq | chaque surface d'écriture déclenche une décision tracée | L |
| 5.5 | SVG : modération du contenu ou restriction par surface, documentée | routes d'upload, `media-engine` | règle écrite + test | S |
| 5.6 | RLS et buckets Storage : revue complète des politiques (lecture/écriture/suppression par rôle) | Supabase, `packages/supabase` | chaque bucket a une politique testée (écriture par tiers refusée) | M |
| 5.7 | Rate limiting : un budget par famille d'endpoints (auth, écriture, upload, recherche, liens publics) | `apps/api/internal/middleware/ratelimit.go` | abus rejoués en test → 429 attendu | M |
| 5.8 | Sessions et JWT : expiration, rotation, révocation, déconnexion globale | `packages/auth`, Go | scénarios d'attaque rejoués et bloqués | M |
| 5.9 | Secrets : audit du repo et des images (aucune valeur sensible), rotation documentée | tout le repo, `docs/CREDENTIALS.md` | scan automatique en CI, zéro finding | M |
| 5.10 | En-têtes de sécurité : CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy | Caddyfile, Next | en-têtes vérifiés par test sur chaque sous-domaine | M |
| 5.11 | Dépendances : `pnpm audit` + `govulncheck` en CI, politique de correction | CI | aucune vulnérabilité haute non traitée | M |
| 5.12 | Matrice des permissions fines (Médias, articles, admin) auditée et testée | Go + admin | chaque action sensible a son test d'accès refusé | L |
| 5.13 | OAuth/apps tierces : scopes minimaux, révocation, journal d'usage | `apps/api/internal/modules/oauth` | scopes par défaut restrictifs + tests | M |
| 5.14 | RGPD : export complet des données, suppression réelle, délais, sous-traitants | Go + admin + docs | un scénario utilisateur de bout en bout, tracé | L |
| 5.15 | Aucune PII dans les logs/erreurs (emails, IP, tokens) | Go + apps Next | scan automatique des logs + tests | M |
| 5.16 | Sauvegardes : chiffrement, rétention, restauration testée | `scripts/backup-*`, VPS | restauration complète rejouée et datée | M |
| 5.17 | Surface admin (tailnet-only) : revue des accès, sessions, 2FA, journal d'actions | admin, Caddy | chaque action admin sensible est journalisée et attribuée | L |

**Anti-collision :** 5.6, 5.9, 5.16 touchent l'infra (Supabase, secrets, sauvegardes) :
à mener **seul** et jamais pendant un déploiement. 5.1 et 5.4 modifient le code produit :
coordination obligatoire avec A2/A4.

**Reprise à froid :** 5.1 puis 5.2 (les deux P0 de l'audit), ensuite 5.4.
