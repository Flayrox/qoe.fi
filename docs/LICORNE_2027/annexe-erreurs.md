# 📋 Annexe — inventaire des erreurs prod (lots A2.1 → A2.2)

> **Fenêtre :** 14 derniers jours de logs Docker (`docker logs --since 336h`) relevés le
> 19/09/2026 sur le VPS prod. PII et identifiants expurgés (UUID, timestamps,
> durées). `qoefi-api`, `qoefi-studio`, `qoefi-core`, `qoefi-admin` et
> `qoefi-worker` : **aucune erreur dans la fenêtre** (ou rotation déjà passée —
> à confirmer avec la rétention du lot A6.12).
>
> Légende : 🔴 bug probable · 🟡 à qualifier · 🟢 bénin/surveillance.

| # | Service | Signal (volume / 14 j) | Lecture | Impact | Lot proposé |
| --- | --- | --- | --- | --- | --- |
| E-1 | tenants | 🔴 `Error: Publication ou article introuvable.` — 73× | 404 applicatives : robots sur slugs invalides **ou** vrais articles devenus injoignables (slug renommé, visibilité, bug de résolution) — chemins non qualifiés | Moyen : contenu potentiellement perdu pour des lecteurs réels | A2 : qualifier les chemins (top slugs 404), distinguer bots/lecteurs, alerter sur les pics ; corriger les liens internes morts trouvés |
| E-2 | tenants | 🔴 `Failed to find Server Action "x"/"0"/"1"/"action"` — ~230×/24 h | Clients avec un JS en cache qui appellent des Server Actions d'un déploiement précédent (« older or newer deployment ») : **chaque déploiement casse les sessions ouvertes** jusqu'au refresh | Fort : actions (dont formulaires) qui échouent silencieusement après chaque mise en prod | A2 : invalidation/versionnage du client au déploiement (bandeau « nouvelle version, recharger »), IDs d'actions stables, ou réduire la casse par revalidation douce |
| E-3 | caddy | 🔴 ACME `rateLimited : too many certificates (50) already issued for "qoe.fi"` + tentatives `Obtain` sur des dizaines de sous-domaines suspects (`preview`, `billing`, `wap`, `svn`, `sip`, `sms`…) | TLS on-demand sans liste d'autorisation : n'importe quel sous-domaine (bots, typos, scans) déclenche une émission ; le quota Let's Encrypt est épuisé → **les vrais nouveaux sous-domaines ne peuvent plus obtenir de certificat** | Fort : risque de panne TLS à la création d'un tenant/domaine | A2/A6 : restreindre `on_demand` (`ask` : n'émettre que pour des domaines connus), auditer la persistance du stockage des certificats entre redéploiements |
| E-4 | caddy | 🟡 `PostgREST; error=PGRST205` — 26× | Cache de schéma PostgREST périmé après DDL : les migrations `00024`/`00025` déployées cette semaine ajoutent/suppriment des tables sans rechargement du cache → requêtes PostgREST en échec transitoire | Moyen : lectures Supabase directes (dont mobile) en erreur après chaque migration | A1/A6 : `NOTIFY pgrst, 'reload schema'` post-migration + health check dédié |
| E-5 | caddy | 🔴 `PostgREST; error=42501` (401, `Www-Authenticate: Bearer`) — 425×, **toutes émises par nos propres conteneurs** (`supabase-ssr`, User-Agent `node`) sur `GET /rest/v1/SystemConfig?select=value&key=eq.GLOBAL_ANNOUNCEMENT` | Le layout de `core` (et la console `admin`) lit l'annonce globale **directement en PostgREST** avec le client session, mais la table `SystemConfig` (propriété de l'API Go) n'a aucun droit/RLS pour ces rôles → 401 systématique, erreur avalée par `try/catch` | Fort : **la fonctionnalité d'annonce globale est morte en prod** (jamais affichée) + bruit permanent | A2/A5 : endpoint Go-first public (recommandé, cohérent avec l'architecture) et suppression des lectures PostgREST directes ; à défaut, grant/RLS ciblé sur `key = 'GLOBAL_ANNOUNCEMENT'` |
| E-6 | caddy | 🟢 `reading: context canceled` — 227× | Clients qui ferment la connexion avant la fin de la réponse (navigation, refresh) | Faible : bruit normal, à surveiller seulement en cas d'explosion | A6 : seuil d'alerte, pas d'action |

## Notes de méthode

- Les comptes ci-dessus sous-estiment le réel (rotation des logs Docker non
  auditée — voir lot A6.12) et ne couvrent pas les erreurs purement client
  (console navigateur — voir lot A2.2).
- Règle appliquée (README §3.6) : chaque entrée ci-dessus devient **au plus un
  lot**, avec test de non-régression qui échoue avant le correctif.
- `E-3` et `E-5` sont les deux priorités : panne TLS potentielle d'un côté,
  fonctionnalité morte + 425 erreurs/14 j de l'autre.
