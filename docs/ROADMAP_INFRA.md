# 🗺️ Roadmap infra — chantiers différés (Bunny.net, DNS, certificats)

> Ce doc regroupe les chantiers « quand on s'y met » — pointé depuis
> `docs/VPS_DEPLOYMENT_PREP.md` §14 (Backlog). Rien ici n'est urgent ;
> c'est le mode d'emploi pour le jour où on s'y attaque.

---

## 1. 🐰 Bunny.net — CDN / storage des images

### 1.1 État actuel (audité le 01/09)

```
app (web/mobile) ──upload──▶ supabase.storage (bucket « articles-media »)
        │                        via auth.qoe.fi (Kong)
        ▼
URL publique = getPublicUrl() → https://auth.qoe.fi/storage/v1/object/public/<path>
        ▼
toPublicImageUrl() remplace auth.qoe.fi par IMAGES_CDN
        ▼
URL finale stockée/rendue = https://cdn.qoe.fi/<path>
        ▼
Caddy : cdn.qoe.fi → rewrite * /storage/v1/object/public{path} → supabase-kong
```

- **Constantes centrales** (le point d'impact d'une migration) :
  - `packages/supabase/src/storage.ts` → `IMAGES_CDN = 'https://cdn.qoe.fi'`, `IMAGES_BUCKET = 'articles-media'`, fonction `toPublicImageUrl()`.
  - `apps/mobile/src/lib/upload.ts` → **copie dupliquée** de `IMAGES_CDN` (garder les deux synchronisées).
  - `packages/supabase/src/media-engine.ts` → `getPublicUrl()` (même flux).
- **Whitelist Next.js `images.remotePatterns`** : `cdn.qoe.fi` est déclaré dans `next.config.ts` de `core`, `studio`, `admin`, `tenants`, `hi` → **hostname stable = aucun changement nécessaire**.
- **Base de données** : les URLs de médias sont stockées telles quelles (`https://cdn.qoe.fi/<path>`) — dans les articles, avatars, bannières, etc.
- Le write-path (upload) passe par Supabase Storage (Kong) ; le read-path par `cdn.qoe.fi` (Caddy → Kong).

### 1.2 Cible recommandée : Pull Zone Bunny en origin-pull

**Option A — Pull Zone « origin-pull » (recommandée, ZÉRO migration d'objets)** :
- Le record `cdn.qoe.fi` passe de **A → CNAME** vers `<zone>.bunnycdn.com`.
- La Pull Zone Bunny est configurée avec une **origin URL** qui sert le bucket.
  ⚠️ L'origin ne peut pas être `cdn.qoe.fi` lui-même (boucle CNAME). Deux candidats à valider le jour J :
  (a) `https://auth.qoe.fi/storage/v1/object/public` (Kong public via Caddy) — propre mais fait passer par Caddy ;
  (b) l'IP directe du VPS avec `Host: auth.qoe.fi` (ou une route interne) — à voir selon la politique Bunny.
- Bunny **remplit le cache edge au 1er hit** : les objets existants n'ont pas besoin d'être copiés, les URLs en base restent valides, le code ne change **pas** (le CNAME garde `cdn.qoe.fi`).
- Résultats : bande passante du VPS déchargée, cache edge mondial, cache-control respecté (`cacheControl: '3600'` à l'upload).

**Option B — Bunny Storage Zone + upload direct** : copie réelle des objets + changement du write-path côté code. À n'envisager que si on veut **couper Supabase Storage** un jour. Beaucoup plus lourd (migration des objets existants, upload direct via l'API Bunny/S3, secrets, CORS).

### 1.3 Checklist de bascule (Option A)

- [ ] Créer le compte Bunny + la Pull Zone (origin URL ci-dessus, HTTPS activé).
- [ ] Tester sur un sous-domaine jetable (ex. `cdn-test.qoe.fi` → CNAME) : image existante servie, cache edge, purge.
- [ ] Bascule DNS : passer le TTL de `cdn.qoe.fi` à 60 s la veille, puis A → CNAME `<zone>.bunnycdn.com`.
- [ ] Vérifier : images OK depuis plusieurs réseaux, **uploader une nouvelle image** (write-path intact), URLs en base inchangées.
- [ ] Garder le bloc Caddy `cdn.qoe.fi` en place 48 h (rollback = repasser le record en A → le VPS re-sert instantanément).
- [ ] Optionnel : purge, shield, hotlink protection, monitoring.

### 1.4 Points de vigilance

- **Le chemin doit rester identique sous le CNAME** : les URLs en base sont `https://cdn.qoe.fi/<path>` et Caddy ajoute aujourd'hui `/storage/v1/object/public`. La Pull Zone doit servir **le même path** que ce que les URLs contiennent — sinon 404 en masse.
- **Rollback simple** : c'est un changement DNS pur (A → CNAME), réversible en ~1 min.
- **Constantes** : rien à changer dans le code (CNAME), mais si un jour on change de hostname, penser aux 2 fichiers `storage.ts` + `upload.ts` (mobile) + les 5 `next.config.ts`.

---

## 2. 🌐 DNS — Hetzner Console vs Bunny DNS (+ plan de bascule)

### 2.1 Comparatif (vérifié 01/09)

| Critère | Hetzner Console DNS (actuel) | Bunny DNS |
|---|---|---|
| Coût | Gratuit | **Gratuit** (≤ 500 domaines, requêtes illimitées) |
| Anycast | Oui (Europe surtout) | Oui (global) |
| API (records) | Oui | Oui |
| **DNSSEC** | ❌ **Ne signe pas** (bloque TLSA/DANE) | ✅ **Supporté** |
| Anti-DDoS | Protection réseau Hetzner (datacenter) | Edge CDN (trafic HTTP via Bunny uniquement) |
| Écosystème | — | Consolidation avec le CDN/storage (§1) |

### 2.2 Ce que Bunny DNS apporte / n'apporte PAS

- ✅ **Apporte** : DNSSEC → **débloque l'item TLSA/DANE du mail** (backlog §14 — Gmail applique DANE en dur) ; gratuit ; un seul fournisseur DNS + CDN + storage.
- ❌ **N'apporte pas** : des « IPs qui changent » — les records A/MX pointeront toujours le VPS (le SMTP 25/465/587/993/995 doit rester joignable directement, aucun CDN devant le mail) ; l'anti-DDoS ne couvre que le trafic HTTP qui passe par l'edge Bunny.
- ⚠️ **Conséquence** : si on bouge le DNS chez Bunny, le chantier « DNS-01 Hetzner » (§14) devient caduc → on branche le plugin certbot/Caddy **Bunny DNS** à la place.

### 2.3 Checklist de bascule DNS

- [ ] Créer le compte Bunny → exporter la zone Hetzner (via l'API ou le panneau) : records **A, CNAME, MX, TXT (SPF, DMARC, `_dmarc`), wildcards** (`*.qoe.fi`, `*.admin.qoe.fi`) + NS actuels.
- [ ] Recréer **tous** les records dans Bunny DNS — ne rien oublier (le MX `mail.qoe.fi`, le SPF, `_dmarc.qoe.fi`, les wildcards).
- [ ] (Optionnel, plus tard) Activer **DNSSEC** chez Bunny → déposer les **DS** chez le registrar (Netcup).
- [ ] Passer les TTL à 60 s la veille.
- [ ] Basculer les **NS au registrar (Netcup)** : `helium/hydrogen/oxygen.ns.hetzner.*` → nameservers Bunny.
- [ ] Surveiller la propagation (dnschecker.org, `dig` depuis plusieurs endroits), le MX, la délivrabilité (mail-tester).
- [ ] Après stabilisation : publier le TLSA du mail (avec `certbot --reuse-key` avant, cf. §14) → le DANE devient actif.
- [ ] Rollback : re-basculer les NS vers Hetzner (garder la zone Hetzner à jour pendant la transition).

---

## 3. 🔐 Renouvellement Let's Encrypt — état vérifié + plan de test réel

### 3.1 État vérifié le 01/09

- **Timer** : `certbot.timer` **actif**, 2×/jour (dernière exécution 01/09 16:14, prochaine 02/09 ~06:40).
- **Chaîne complète** :
  - pre-hook `renewal-hooks/pre/stop-caddy.sh` → `docker stop qoefi-caddy` (libère le port 80) ;
  - `authenticator = standalone` (conf `renewal/qoe.fi-0001.conf`) ;
  - deploy hooks : `restart-caddy.sh` (relance Caddy) + `10-stalwart-cert.sh` (copie → `/etc/stalwart/certs/` + restart Stalwart).
- **Cert géré** : `qoe.fi-0001` — SAN `qoe.fi www api auth admin cdn hi mail studio umami`, émis 31/08, **expire 29/11**.
- **Chemin `-0001` corrigé partout le 01/09** (Caddyfile `qoe_cert` + hook Stalwart lisaient `live/qoe.fi` hérité du 21/08 — Caddy aurait servi un cert expiré).
- **Dry-run validé le 01/09** (les 2 certs « all simulated renewals succeeded » ; confs orphelines `base.admin` purgées).
- ⚠️ **Normal** : le timer ne renouvellera **rien** avant ~fin octobre (LE renouvelle à J-60 d'un cert de 90 j). Pas d'alerte si le log est vide d'ici là.

### 3.2 Plan de test de renouvellement RÉEL (à faire mi-octobre, avant J-30)

- [ ] `certbot renew --dry-run` → doit afficher « success » (non destructif).
- [ ] Test réel (émet un NOUVEAU cert) :
      `certbot renew --force-renewal --cert-name qoe.fi-0001`
      → vérifier dans l'ordre : pre-hook (Caddy stoppé) → émission HTTP-01 → deploy hooks (copie Stalwart + restart Caddy).
- [ ] Vérifications :
  - `curl -vI https://qoe.fi/` → nouvelle date d'expiration (+90 j) ;
  - sur le VPS : `echo | openssl s_client -connect 127.0.0.1:587 -starttls smtp` → cert Stalwart mis à jour ;
  - sites publics UP (Caddy relancé par le hook).
- [ ] ⚠️ **Clé** : sans `--reuse-key`, la clé change à chaque émission → si un TLSA/DANE est publié d'ici là, prévoir `--reuse-key` (ou mettre à jour le TLSA). Tant que pas de TLSA, aucune contrainte.
- [ ] Le timer prend le relais automatiquement ensuite.

---

## 4. 📎 Liens utiles

- `docs/VPS_DEPLOYMENT_PREP.md` §14 — backlog (items DNS-01, Bunny Storage, backups Hetzner, TLSA/DANE).
- `docs/CREDENTIALS.md` — accès & secrets.
- `docs/OTA_UPDATES.md` — ⚠️ rappel config mobile dev (`localhost:3999` / ATS) avant build release.
- Caddyfile `docker/caddy/Caddyfile` — blocs `cdn.qoe.fi`, `qoe_cert`.
