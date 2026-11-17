# Plan vivant — Sécurité

> Ce document est la mémoire de la posture sécurité de qoe.fi : modèle de
> menace, contrôles vérifiés, **findings** et **tâches auto-attribuées**, mis à
> jour à chaque passe. Une passe = un audit statique, des correctifs testés, puis
> une **ré-analyse** qui ajoute de nouvelles tâches. Rien ne se coche sans test
> ou vérification rejouable.

- **Passe en cours** : 3 (2026-11-16)
- **Dernier commit de référence** : `26ea3b93` (studio Média), correctifs sécurité
  de la passe 1 dans le commit « durcit le studio ».
- **Portée** : `apps/api` (Go), `apps/{studio,admin,core,tenants,hi}` (Next),
  `packages/*`, `docker/caddy`, `infra/monitoring`.
- **Hors portée** : infrastructure Hetzner (pare-feu réseau, accès SSH) — voir
  `docs/RUNBOOK-SECURITY-SLO.md`.

---

## 1. Modèle de menace

### Actifs

| Actif                               | Pourquoi il compte                                |
| ----------------------------------- | ------------------------------------------------- |
| Session créateur (`studio.qoe.fi`)  | Accès aux brouillons, à la médiathèque, à Stripe  |
| Session superadmin (`admin.qoe.fi`) | Accès à toute la plateforme (suspensions, grants) |
| Jeton d'API média                   | Publication et lecture programmatique             |
| Contenu d'article (HTML)            | Injecté dans toutes les apps lecteur              |
| Journal d'audit                     | Preuve en cas d'incident                          |

### Acteurs et frontières de confiance

1. **Anonyme** → endpoints publics (lecture, inscription, webhooks entrants).
2. **Créateur authentifié** → `studio` ; ses actions passent par `packages/sdk`
   (server actions) → `apps/api` (Go, source de vérité).
3. **Média / rôle** → périmètre de données ; le cookie d'espace actif n'est
   qu'un **indice** : Go revérifie l'appartenance.
4. **Superadmin** → `admin`, avec step-up (`aal2`).
5. **Contenu tiers** (HTML collé, SVG, images distantes) → jamais de confiance.

### Règles non négociables

- Go est la source de vérité métier : aucune règle d'autorisation réimplémentée
  côté TypeScript.
- Toute route protégée passe par `CombinedAuth` + `requireCapability`.
- Aucun HTML/SVG tiers n'est injecté sans liste blanche.
- Les cookies d'état sont `Secure` en production.
- Un test doit prouver chaque correctif (rouge avant, vert après).

---

## 2. Contrôles vérifiés (inventaire)

| Contrôle                                   | Où                                                                                            | État           |
| ------------------------------------------ | --------------------------------------------------------------------------------------------- | -------------- |
| En-têtes de durcissement API (frame DENY…) | `apps/api/internal/middleware/middleware.go` + `hardening_test.go`                            | ✅ testé       |
| HSTS + X-Frame-Options par site            | `docker/caddy/Caddyfile` (admin en `DENY`)                                                    | ✅             |
| SSRF bloqué (loopback, métadonnées)        | NetGuard (`qoe_netguard_ssrf_blocked_total`) + runbook §4                                     | ✅             |
| Rate limiting + décisions `fail_open`      | Redis, métriques `qoe_ratelimit_decisions_total`, runbook §5                                  | ✅             |
| Step-up (`aal2`) sur actions sensibles     | `apps/studio/src/features/security/step-up.tsx`, `packages/auth`, garde Go                    | ✅             |
| Résolution du workspace côté Go            | `packages/sdk/src/actions/workspace/index.ts` → `/v1/workspaces/active` (repli perso)         | ✅ vérifié     |
| Assainissement des chemins de stockage     | `packages/supabase/src/storage.ts` (`sanitizePathSegment`, `sanitizeExtension`)               | ✅ testé       |
| SVG d'images téléversées                   | `packages/supabase/src/media-engine.ts` (`sanitizeSvgBuffer`)                                 | ✅ testé       |
| Images proxyfiées avec CSP sandbox         | `apps/studio/next.config.ts` (`contentSecurityPolicy`, `attachment`)                          | ✅             |
| Assainissement HTML lecteur                | `packages/ui/src/templates/blocks/ArticleContentBlock.tsx`, `apps/tenants/.../PaywallCut.tsx` | ✅             |
| Aperçu lecteur studio assaini              | `apps/studio/src/lib/sanitize-preview-html.ts` + test                                         | ✅ **passe 1** |
| SVG inline (QR TOTP) contrôlé              | `apps/studio/src/lib/sanitize-inline-svg.ts` + `totp-enrollment` test                         | ✅ **passe 1** |
| Cookie d'espace `Secure` en production     | `apps/studio/src/lib/workspace-cookie.ts` + middleware                                        | ✅ **passe 1** |
| En-têtes app (frame, COOP, XPCDP)          | `apps/studio/src/lib/security-headers.ts` + `next.config.ts`                                  | ✅ **passe 1** |
| Anti-spam (PoW/turnstile, simhash)         | SecGuard, console `/admin/security`, runbook §3                                               | ✅             |
| Scan de secrets au commit                  | gitleaks (hook local + CI)                                                                    | ✅             |

---

## 3. Passe 1 — audit statique du 2026-11-16

Méthode : recherche exhaustive des injections (`dangerouslySetInnerHTML`), des
politiques de cookies, des en-têtes de réponse et des points d'entrée.

| #   | Finding                                                                                              | Sévérité | État                                                             |
| --- | ---------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------- |
| F1  | L'aperçu lecteur du studio injectait le HTML de l'article sans assainissement (session authentifiée) | moyenne  | ✅ corrigé (liste blanche DOMPurify + test)                      |
| F2  | Le QR d'enrôlement TOTP était injecté brut (`dangerouslySetInnerHTML`)                               | moyenne  | ✅ corrigé (`sanitizeInlineSvg`, repli secret/lien, test)        |
| F3  | Cookie `qoe_active_workspace` posé sans `Secure` en production                                       | basse    | ✅ corrigé (`workspaceCookie`, testé prod/dev)                   |
| F4  | En-têtes app incomplets (pas de `X-Frame-Options`, COOP, XPCDP)                                      | basse    | ✅ corrigé (helper testé, consommé par `next.config.ts`)         |
| F5  | Cookie d'espace potentiellement forgé                                                                | info     | ✅ vérifié : Go revérifie l'appartenance et retombe sur PERSONAL |
| F6  | CSP en `Report-Only`, jamais imposée                                                                 | moyenne  | ⬜ ouvert (voir tâche T6)                                        |
| F7  | `apps/admin` garde ses en-têtes inline (pas de helper testable)                                      | basse    | ⬜ ouvert (T5)                                                   |
| F8  | `images.dangerouslyAllowSVG: true` dans le studio                                                    | basse    | ⬜ ouvert (mitigé : CSP sandbox + `attachment`) (T7)             |

**Tests ajoutés en passe 1** — 34 : `security-hardening.test.ts` (24 : en-têtes,
cookie d'espace, locale, HTML, SVG) et `totp-enrollment.test.tsx` (10 : QR refusé,
secret copié, code vérifié/refusé, reprise de facteur, erreur + réessai,
annulation).

---

## 4. Passe 2 — ré-analyse après correctifs

Ce que la passe 1 a rendu visible : les mêmes motifs existent ailleurs. J'ai
donc relu tous les `dangerouslySetInnerHTML` restants et les configurations
d'en-têtes des autres apps.

| #   | Finding                                                                                      | Sévérité | État  |
| --- | -------------------------------------------------------------------------------------------- | -------- | ----- |
| N1  | `apps/admin/src/components/security/step-up.tsx` injecte le QR TOTP brut (même motif que F2) | moyenne  | ⬜ T1 |
| N2  | `apps/core/.../EbookReader.tsx` injecte `chapter.html` sans assainissement visible           | moyenne  | ⬜ T2 |
| N3  | `apps/core/.../ArticleAnnotatorView.tsx` injecte `displayedContent` — à confirmer assaini    | moyenne  | ⬜ T3 |
| N4  | La CSP n'a ni `report-uri` ni `report-to` : les violations sont invisibles                   | basse    | ⬜ T6 |
| N5  | `x-locale` recopié depuis un cookie vers un en-tête de requête sans liste blanche            | basse    | ⬜ T8 |
| N6  | En-têtes dupliqués entre 5 apps Next (aucun test ne les vérifie)                             | basse    | ⬜ T5 |
| N7  | Aucun test ne vérifie que les routes Go protégées refusent un rôle insuffisant               | haute    | ⬜ T4 |

**Nouvelles tâches auto-attribuées (passe 2)**

- [ ] **T1** — Porter `sanitizeInlineSvg` dans un module partagé (`packages/ui`
      ou `packages/utils`) et l'utiliser dans `admin` + `studio` ; test du QR
      hostile côté admin.
- [ ] **T2** — Assainir `chapter.html` dans `EbookReader` (DOMPurify, liste
      blanche du lecteur) + test avec `<script>` et `onerror`.
- [ ] **T3** — Vérifier puis verrouiller l'assainissement de
      `ArticleAnnotatorView` (test de non-régression).
- [ ] **T4** — Table de tests Go `requireCapability` : pour chaque route admin,
      un cas « rôle insuffisant → 403 » et un cas « non authentifié → 401 ».
- [ ] **T5** — Factoriser les en-têtes des 5 apps Next dans un helper unique
      testé (une seule source, valeurs par app).
- [ ] **T6** — Rendre la CSP imposable : nonce Next, `report-to` vers Sentry ou
      un endpoint `/api/csp-report`, puis bascule `Content-Security-Policy`.
- [ ] **T7** — Restreindre `dangerouslyAllowSVG` aux domaines réellement utiles
      (avatars) ou servir les SVG via un transformateur dédié.
- [x] **T8** — Liste blanche de locales (`fr`, `en`, …) avant de recopier
      `x-locale` dans un en-tête — fait : `apps/studio/src/lib/locale-header.ts`
      s'appuie sur `@qoe/i18n/locales` ; toute valeur inconnue retombe sur `fr`
      (test avec tentative d'injection d'en-tête).

---

## 5. Passe 3 — ré-analyse (en cours)

La passe 2 a déplacé le centre de gravité : le rendu est plutôt bien gardé, mais
la **couverture d'autorisation** des routes Go et la **visibilité** des
violations CSP restent faibles. Trois axes ajoutés :

| #   | Finding                                                                            | Sévérité | État   |
| --- | ---------------------------------------------------------------------------------- | -------- | ------ |
| P1  | Aucun test d'intégration ne vérifie `CombinedAuth` sur les routes média            | haute    | ⬜ T4  |
| P2  | Les server actions de mutation ne vérifient pas explicitement l'origine (`Origin`) | moyenne  | ⬜ T9  |
| P3  | Pas d'audit de dépendances dans la CI (`pnpm audit` absent)                        | moyenne  | ⬜ T10 |
| P4  | Les webhooks sortants n'ont pas de test de signature/HMAC côté TS                  | moyenne  | ⬜ T11 |
| P5  | Aucune rotation planifiée documentée pour les clés API média                       | basse    | ⬜ T12 |

- [ ] **T9** — Vérifier `Origin`/`Sec-Fetch-Site` sur les server actions de
      mutation (helper partagé + test) — Next protège partiellement, on veut la
      garantie explicite.
- [ ] **T10** — Ajouter `pnpm audit --prod --audit-level high` au job « Static
      Checks & Guards », avec allowlist versionnée des avis acceptés.
- [ ] **T11** — Tests de signature des webhooks (HMAC, horodatage, rejeu).
- [ ] **T12** — Documenter la rotation des clés API média (procédure + SLO) et
      l'ajouter au runbook.

---

## 6. Comment rejouer l'audit

```bash
# Injections HTML/SVG dans les apps
rg -n "dangerouslySetInnerHTML" apps packages

# En-têtes de sécurité
rg -n "Content-Security-Policy|X-Frame-Options|Cross-Origin-Opener-Policy" apps docker

# Cookies posés côté réponse
rg -n "cookies\.set\(|document\.cookie" apps packages

# Preuves : tests de durcissement
pnpm --filter @qoe/studio test -- security-hardening totp-enrollment
```

---

## 7. Journal des passes

| Date       | Passe | Résultat                                                                                | Commit        |
| ---------- | ----- | --------------------------------------------------------------------------------------- | ------------- |
| 2026-11-16 | 1     | 8 findings, 4 corrigés avec tests (aperçu HTML, QR TOTP, cookie `Secure`, en-têtes app) | _(ce commit)_ |
| 2026-11-16 | 2     | 7 findings, 8 tâches auto-attribuées (admin, core, CSP, routes Go)                      | _(ce commit)_ |
| 2026-11-16 | 3     | 5 findings supplémentaires, 4 tâches (Origin, audit deps, webhooks, rotation)           | _(ce commit)_ |
