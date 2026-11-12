# Runbook Opérationnel — Sécurité & SLO (`qoe-security-and-slo`)

Ce document décrit les procédures de triage et d'intervention pour les alertes Prometheus définies dans [`infra/monitoring/alerts.yml`](../infra/monitoring/alerts.yml).

---

## 1. `QoeHigh5xxBurnRate` (Critique) {#qoe-high-5xx-burn-rate}

- **Métrique** : `qoe_http_requests_total{status=~"5.."}` (> 1 % sur 5 min)
- **Impact** : Dégradation directe de la disponibilité API pour les lecteurs et créateurs.
- **Triage immédiat** :
  1. Identifier le `route_group` fautif via `sum(rate(qoe_http_requests_total{status=~"5.."}[5m])) by (route_group, method)`.
  2. Vérifier les logs de `apps/api` (panics, timeouts Postgres, erreurs Redis).
  3. Vérifier l'état des dépendances (Postgres, Redis, stockage objet).
- **Actions `/admin/security` & console** :
  - Si un endpoint spécifique est saturé ou compromis, vérifier les coupures d'urgence dans `/admin/security` (ou le registre `apiaccess` / feature flags serveur).
  - Si lié à un déploiement récent, déclencher un rollback immédiat.

---

## 2. `QoeHighP99Latency` (Avertissement) {#qoe-high-p99-latency}

- **Métrique** : `qoe_http_request_duration_ms_bucket` (p99 > 1000 ms pendant 5 min)
- **Impact** : Ralentissement perceptible des pages et risque de saturation des workers HTTP.
- **Triage immédiat** :
  1. Isoler le `route_group` touché dans le label de l'alerte.
  2. Vérifier les requêtes SQL lentes (`pg_stat_activity`) et la saturation du pool `pgx`.
  3. Corréler avec un éventuel pic de trafic (`QoeSecguardSpamSpike`) ou une migration récente.
- **Actions `/admin/security` & console** :
  - Activer le mode strict / défi PoW Altcha dans `/admin/security` si la latence est causée par un scraping ou flood sur un `route_group` public.
  - Vérifier les seuils de rate-limit dans `/admin/security`.

---

## 3. `QoeSecguardSpamSpike` (Avertissement) {#qoe-secguard-spam-spike}

- **Métrique** : `qoe_secguard_rejections_total` (> 5 rejets/s par `action` et `code` pendant 5 min)
- **Impact** : Attaque de spam automatisée (commentaires, inscriptions, publications) ou dérive d'un défi PoW/Turnstile.
- **Triage immédiat** :
  1. Inspecter les labels `action` (ex: `comment`, `auth`, `post`) et `code` (ex: `turnstile_failed`, `pow_required`, `simhash_duplicate`).
  2. Vérifier si les rejets proviennent d'IPs/ASN concentrés ou de comptes nouvellement créés (`qoe_trust_tier_evaluations_total`).
- **Actions `/admin/security`** :
  - Ouvrir `/admin/security` → **SecGuard & Anti-Spam** :
    - Augmenter la difficulté du PoW Altcha ou forcer le défi sur l'action ciblée.
    - Durcir les seuils de confiance (`trust_tier`) pour les nouveaux comptes.
    - Ajouter les plages IP / domaines abusifs en liste de blocage si nécessaire.

---

## 4. `QoeSsrfAttemptBlocked` (Critique) {#qoe-ssrf-attempt-blocked}

- **Métrique** : `qoe_netguard_ssrf_blocked_total` (> 0 sur 5 min)
- **Impact** : Tentative d'exploitation SSRF (Server-Side Request Forgery) vers le réseau interne, loopback ou métadonnées cloud (`169.254.169.254`).
- **Triage immédiat** :
  1. Rechercher les logs `netguard` dans `apps/api` pour identifier l'URL cible, l'utilisateur/workspace source et l'endpoint déclencheur (webhooks, import d'article, fetch OG/avatar).
  2. Confirmer que NetGuard a bien bloqué la connexion (aucune fuite de réponse).
- **Actions `/admin/security`** :
  - Ouvrir `/admin/security` → **Audit & Suspensions** :
    - Suspendre immédiatement le compte ou workspace malveillant s'il s'agit d'une attaque active.
    - Désactiver temporairement la fonctionnalité ou le webhook incriminé si l'abus est massif.

---

## 5. `QoeRateLimitRedisFailOpen` (Critique) {#qoe-ratelimit-redis-fail-open}

- **Métrique** : `qoe_ratelimit_decisions_total{result="fail_open"}` (> 0 sur 5 min)
- **Impact** : Le rate-limiting applicatif ne protège plus les endpoints (bascule fail-open pour préserver la disponibilité). La plateforme est exposée au brute-force et au scraping.
- **Triage immédiat** :
  1. Vérifier la connectivité, la mémoire (`INFO memory`) et la latence de Redis.
  2. Vérifier les logs `ratelimit` dans `apps/api` (timeouts, `EOF`, `OOM`).
- **Actions `/admin/security` & infra** :
  - Restaurer Redis en priorité (redémarrage / purge mémoire / failover).
  - En attendant le rétablissement, renforcer la protection périmétrique (Caddy/Cloudflare) et activer les défis PoW dans `/admin/security` pour les actions sensibles.
