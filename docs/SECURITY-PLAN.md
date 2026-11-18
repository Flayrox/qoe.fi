# Plan vivant — Sécurité

> Ce document est la mémoire de la posture sécurité de qoe.fi : modèle de
> menace, contrôles vérifiés, **findings** et **tâches auto-attribuées**, mis à
> jour à chaque passe. Une passe = un audit statique, des correctifs testés, puis
> une **ré-analyse** qui ajoute de nouvelles tâches. Rien ne se coche sans test
> ou vérification rejouable.

- **Passe en cours** : 4 (2026-11-17)
- **Dernier commit de référence** : `c239ab4c` (durcissement studio + création de
  ce document, CI verte sur `dev` et `main`).
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
| Assainissement partagé (article + SVG)     | `packages/ui/src/security/` + `scripts/guard-dangerous-html.mjs`                              | ✅ **passe 4** |
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

- [x] **T1** — Porter `sanitizeInlineSvg` dans un module partagé — fait :
      `packages/ui/src/security/inline-svg.ts`, consommé par l'admin
      (`step-up.tsx`), le studio (`totp-enrollment.tsx`) et le garde CI ; 25
      tests d'attaque/non-régression dans `packages/ui/src/security/__tests__`.
- [x] **T2** — Assainir `chapter.html` dans `EbookReader` — fait :
      `sanitizeArticleHtml` (liste blanche partagée) appliqué au chapitre.
- [x] **T3** — `ArticleAnnotatorView` : assainissement appliqué explicitement
      (HTML brut **et** lecture bionique), plus au bloc `ArticleContentBlock`.
- [x] **T4** — Table de tests d'autorisation Go — fait :
      `internal/permissions/media_matrix_test.go` (rôle × permission, statuts,
      overrides, édition par auteur), `internal/authz/action_matrix_test.go`
      (toutes les actions × tous les rôles),
      `internal/middleware/authz_matrix_test.go` (11 motifs de refus → 403 et
      handler jamais atteint), `internal/adminauthz/roles_matrix_test.go`.
      Mutation vérifiée : `CanMedia → true` fait échouer 128 sous-tests ;
      `if decision.Allowed` rendu toujours vrai fait échouer 11/11 refus.
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

## 5. Passe 3 — ré-analyse (close en passe 4)

La passe 2 a déplacé le centre de gravité : le rendu est plutôt bien gardé, mais
la **couverture d'autorisation** des routes Go et la **visibilité** des
violations CSP restent faibles. Trois axes ajoutés :

| #   | Finding                                                                            | Sévérité | État             |
| --- | ---------------------------------------------------------------------------------- | -------- | ---------------- |
| P1  | Aucun test d'intégration ne vérifie `CombinedAuth` sur les routes média            | haute    | ✅ T4 (passe 4)  |
| P2  | Les server actions de mutation ne vérifient pas explicitement l'origine (`Origin`) | moyenne  | ✅ T9 (passe 4)  |
| P3  | Pas d'audit de dépendances dans la CI (`pnpm audit` absent)                        | moyenne  | ✅ T10 (passe 4) |
| P4  | Les webhooks sortants n'ont pas de test de signature/HMAC côté TS                  | moyenne  | ⬜ T16 (ex-T11)  |
| P5  | Aucune rotation planifiée documentée pour les clés API média                       | basse    | ⬜ T18 (ex-T12)  |

- [x] **T9** — `Origin`/`Sec-Fetch-Site` sur les server actions — fait :
      `packages/utils/src/server-action-origin.ts` (`isCrossOriginServerAction`),
      branché en tête des middlewares `core`, `admin`, `studio` (403 avant toute
      lecture de session) ; 10 tests (même origine, port différent, origine
      opaque, `null`, `file:`, `javascript:`, `Sec-Fetch-Site: cross-site` et
      `same-site`, hôte trompeur `qoe.fi.evil.test`).
- [x] **T10** — Audit de dépendances en CI — fait : `scripts/audit-guard.mjs`
      (cliquet sur les avis **high/critical** de `pnpm audit --prod`, référence
      versionnée `scripts/audit-baseline.json`), branché dans « Static Checks &
      Guards ». Le cliquet bloque une **nouvelle** vulnérabilité ; les avis
      existants restent triés et listés (voir Q11).
- [ ] **T16** (ex-T11) — Tests de signature des webhooks (HMAC, horodatage, rejeu).
- [ ] **T18** (ex-T12) — Documenter la rotation des clés API média (procédure + SLO).

---

## 6. Passe 4 — audit, correctifs, ré-analyse (2026-11-17)

Méthode : reprise des tâches ouvertes dans l'ordre de sévérité (T4 puis T1-T3),
puis élargissement volontaire — chaque correctif a servi de sonde pour chercher
la même classe de défaut ailleurs (`dangerouslySetInnerHTML`, arbres de
dépendances, logs, middleware). Les correctifs numérotés ci-dessous sont ceux
livrés dans cette passe.

### 6.1 Findings

| #   | Finding                                                                                                                                                                                        | Sévérité | État                          |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------- |
| Q1  | `dompurify@3.4.13` portait un avis **critique** (contournement `SAFE_FOR_TEMPLATES`) — c'est la brique d'assainissement de toutes les surfaces HTML                                            | critique | ✅ corrigé (3.4.18, override) |
| Q2  | `EffectivePermissions` ré-ajoutait une permission retirée par un override `-perm`, alors que `CanMedia` gardait le **premier** override : l'interface affichait un droit que le garde refusait | haute    | ✅ corrigé                    |
| Q3  | Trois injections non fermées (QR admin, chapitre d'ebook, corps d'article) **et deux de plus trouvées en élargissant** : `AboutPageContent` (bloc de template) et l'aperçu du CMS juridique    | haute    | ✅ corrigé                    |
| Q4  | L'autorisation Go n'était **prouvée par aucune table de tests** : retirer le contrôle ne cassait rien                                                                                          | haute    | ✅ corrigé (T4)               |
| Q5  | Rien, en CI, n'empêchait une nouvelle injection de HTML brut                                                                                                                                   | moyenne  | ✅ corrigé (garde)            |
| Q6  | Aucun audit de dépendances en CI                                                                                                                                                               | moyenne  | ✅ corrigé (cliquet T10)      |
| Q7  | Aucun contrôle explicite d'origine sur les server actions (Next protège, mais la console mérite une seconde couche)                                                                            | moyenne  | ✅ corrigé (T9)               |
| Q8  | `IsMediaAdmin` répondait « admin » pour un membre invité/suspendu (helper inutilisé — piège pour le prochain appelant)                                                                         | basse    | ✅ corrigé                    |
| Q9  | `subscribers_reconfirm.go` journalisait l'**e-mail** d'un abonné avec l'erreur (PII dans les journaux agrégés)                                                                                 | basse    | ✅ corrigé                    |
| Q10 | Avis Sentry « middleware bypass via tunnel route » : `tunnelRoute` n'est utilisé nulle part                                                                                                    | info     | ✅ non applicable (vérifié)   |
| Q11 | `next@16.2.6` : 7 avis **critiques** (RCE Image Optimization, `next/og`, `use cache`) corrigés en 16.3.6 / 16.4.1                                                                              | critique | ⬜ T13                        |
| Q12 | CSP toujours en `Report-Only`, sans `report-to` : une violation reste invisible                                                                                                                | moyenne  | ⬜ T14 (ex-T6)                |
| Q13 | Les en-têtes de sécurité sont encore recopiés dans 5 apps Next                                                                                                                                 | basse    | ⬜ T15 (ex-T5)                |
| Q14 | `images.dangerouslyAllowSVG: true` (mitigé CSP sandbox + `attachment`)                                                                                                                         | basse    | ⬜ T17 (ex-T7)                |
| Q15 | Limites de taille : plafond global (`MaxBytesReader`) présent, mais aucune limite **par route** ni test de dépassement ciblé                                                                   | basse    | ⬜ T20                        |

Sur Q11 : la correction demande une montée de version **majeure de framework**
sur cinq applications. Elle n'a pas été faite dans une passe de durcissement
(risque de régression fonctionnelle non mesurable ici) ; elle est inscrite en
T13 avec sa sévérité réelle, et le cliquet d'audit la garde visible.

### 6.2 Correctifs livrés (fichiers)

**Assainissement — une seule liste blanche**

| Fichier                                                                  | Rôle                                                                                                                                                                             |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/ui/src/security/article-html.ts`                               | `sanitizeArticleHtml` : balises/attributs autorisés, `script`/`iframe`/`form`/`style`/`link` interdits, `srcset`/`poster`/`srcdoc`/`formaction`/`xlink:href` retirés             |
| `packages/ui/src/security/inline-svg.ts`                                 | `sanitizeInlineSvg` / `isSafeInlineSvg` : SVG refusé en bloc s'il contient script, gestionnaire inline, `javascript:`, URI `data:`, référence distante, `foreignObject`, `style` |
| `packages/ui/src/security/index.ts`                                      | exports (avec `pow-worker`, inchangé)                                                                                                                                            |
| `packages/ui/package.json`                                               | sous-chemin `@qoe/ui/security`                                                                                                                                                   |
| `apps/admin/src/components/security/step-up.tsx`                         | QR TOTP assaini + repli explicite (T1)                                                                                                                                           |
| `apps/core/src/app/(reader)/library/ebooks/[id]/EbookReader.tsx`         | `chapterHtml` assaini (T2)                                                                                                                                                       |
| `apps/core/src/components/social/ArticleAnnotatorView.tsx`               | corps assaini, y compris en lecture bionique (T3)                                                                                                                                |
| `packages/ui/src/templates/blocks/ArticleContentBlock.tsx`               | importe la liste blanche partagée (plus de copie locale)                                                                                                                         |
| `packages/ui/src/templates/blocks/AboutPageContent.tsx`                  | corps de page « à propos » assaini (Q3)                                                                                                                                          |
| `apps/admin/src/app/(admin)/admin/legal/LegalCMS.tsx`                    | aperçu juridique assaini (Q3)                                                                                                                                                    |
| `apps/studio/src/lib/sanitize-preview-html.ts`, `sanitize-inline-svg.ts` | ré-exports du module partagé (chemin local conservé)                                                                                                                             |

**Autorisation Go**

| Fichier                                              | Changement                                                                                                                               |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/internal/permissions/media.go`             | `CanMedia` calcule via `EffectivePermissions` (une seule sémantique, dernier override gagne) ; `IsMediaAdmin` refuse un membre non actif |
| `apps/api/internal/permissions/media_matrix_test.go` | 9 rôles × 16 permissions, statuts, overrides, édition par auteur                                                                         |
| `apps/api/internal/authz/action_matrix_test.go`      | toutes les actions du registre × tous les rôles ; résolution absente ; permission révoquée                                               |
| `apps/api/internal/middleware/authz_matrix_test.go`  | 11 motifs de refus → 403, handler jamais atteint ; cas autorisés → 200                                                                   |
| `apps/api/internal/adminauthz/roles_matrix_test.go`  | matrice rôles de console, capacités superadmin-only documentées                                                                          |

**Garde-fous et dépendances**

| Fichier                                                                       | Rôle                                                                                                           |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `scripts/guard-dangerous-html.mjs` + `pnpm guard:dangerous-html`              | tout `dangerouslySetInnerHTML` doit passer par un assainisseur ou figurer dans une liste d'exemptions motivées |
| `scripts/audit-guard.mjs`, `scripts/audit-baseline.json` + `pnpm audit:guard` | cliquet high/critical sur `pnpm audit --prod`                                                                  |
| `pnpm-workspace.yaml`                                                         | overrides `dompurify ^3.4.17`, `shell-quote ^1.11.0`                                                           |
| `packages/utils/src/server-action-origin.ts` (+ test, + export)               | `isCrossOriginServerAction`                                                                                    |
| `apps/{core,admin,studio}/middleware.ts`                                      | refus 403 des server actions inter-origines avant lecture de session                                           |
| `.github/workflows/ci.yml`                                                    | deux étapes ajoutées dans « Static Checks & Guards »                                                           |
| `apps/api/internal/modules/imports/subscribers_reconfirm.go`                  | plus d'e-mail dans les logs                                                                                    |

### 6.3 Preuves exécutées dans cette passe

- **T4, rouge démontré deux fois.** `CanMedia` remplacé par `return true` →
  **128** sous-tests en échec ; `if decision.Allowed` remplacé par `if true` →
  **11/11** cas de refus en échec (« le handler a été atteint »). Restauration
  puis `go test ./internal/{permissions,authz,middleware,adminauthz}` → ok.
- **Assainissement.** 25 tests dans `packages/ui/src/security/__tests__`
  (script, `on*`, `javascript:`, `iframe`/`object`/`embed`, `srcset`/`poster`,
  formulaire, `style`/`meta`, `srcdoc`/`formaction`, SVG hostile ×11, QR
  légitime préservé).
- **Garde CI éprouvé** : un fichier temporaire injectant `window.name` fait
  échouer `guard:dangerous-html` (code 1), puis est supprimé.
- **Cliquet d'audit** : `dompurify` disparaît de la référence après l'override
  (le seul avis critique corrigeable sans montée majeure).
- **Origin** : 10 tests, dont `https://qoe.fi.evil.test` et `Sec-Fetch-Site:
same-site` refusés.

### 6.4 Tâches restantes (renumérotées, sévérité décroissante)

| Nouveau | Ancien | Sévérité     | Tâche                                                                                                                                 |
| ------- | ------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| T13     | —      | **critique** | Monter Next.js ≥ 16.4.1 sur les 5 apps (avis RCE Q11), valider builds + e2e, puis resserrer le cliquet d'audit                        |
| T14     | T6     | moyenne      | CSP imposable : nonce Next, `report-to` (Sentry ou `/api/csp-report`), puis bascule `Content-Security-Policy`                         |
| T15     | T5     | moyenne      | Factoriser les en-têtes des 5 apps Next dans un helper unique testé                                                                   |
| T16     | T11    | moyenne      | Tests de signature des webhooks sortants (HMAC, horodatage, rejeu)                                                                    |
| T17     | T7     | basse        | Restreindre `dangerouslyAllowSVG` (avatars uniquement ou transformateur dédié)                                                        |
| T18     | T12    | basse        | Rotation des clés API média : procédure + SLO + runbook                                                                               |
| T19     | —      | basse        | Garde anti-PII dans les logs Go : bannir e-mail/téléphone/jeton des `log.Printf` (premier cas corrigé, Q9)                            |
| T20     | —      | basse        | Limites de taille **par route** (upload, import, export) + test de dépassement ; vérifier les permissions des fichiers écrits côté Go |

### 6.5 Ré-analyse — ce que la passe 4 rend visible

1. **Les listes blanches dupliquées étaient le vrai défaut**, pas les trois
   injections : cinq surfaces avaient cinq listes, donc cinq occasions de
   diverger. Le module partagé + le garde CI suppriment la classe entière.
2. **Une permission retirée qui réapparaît** (Q2) est le type de bug qu'aucune
   revue de surface ne trouve : il faut une source unique de calcul. C'est
   désormais `EffectivePermissions`, utilisé par les deux chemins.
3. **Les avis de dépendances ne se trient pas seuls.** Le cliquet transforme
   « 122 vulnérabilités » en « aucune nouvelle, 59 connues et listées » — la
   seule forme de gate qui survit à un trimestre.
4. **La prochaine frontière est la console** : ses server actions révoquent des
   sessions et distribuent des capacités. L'origine est vérifiée (T9), mais il
   reste à prouver par test que chaque action de `apps/admin/src/lib/*-actions.ts`
   exige la bonne capacité (même méthode que T4).
5. **Les journaux restent un angle mort** : un seul cas trouvé en cherchant
   dix minutes ; un garde (T19) vaut mieux qu'une relecture annuelle.

---

## 7. Comment rejouer l'audit

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

## 8. Journal des passes

| Date       | Passe | Résultat                                                                                                   | Commit        |
| ---------- | ----- | ---------------------------------------------------------------------------------------------------------- | ------------- |
| 2026-11-16 | 1     | 8 findings, 4 corrigés avec tests (aperçu HTML, QR TOTP, cookie `Secure`, en-têtes app)                    | _(ce commit)_ |
| 2026-11-16 | 2     | 7 findings, 8 tâches auto-attribuées (admin, core, CSP, routes Go)                                         | _(ce commit)_ |
| 2026-11-16 | 3     | 5 findings supplémentaires, 4 tâches (Origin, audit deps, webhooks, rotation)                              | `c239ab4c`    |
| 2026-11-17 | 4     | 15 findings (1 critique corrigé, 1 critique ouvert), T1-T4/T9/T10 fermées, 4 nouvelles tâches, 2 gardes CI | _(ce commit)_ |
