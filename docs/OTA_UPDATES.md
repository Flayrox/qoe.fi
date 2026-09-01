# 📦 Mises à jour OTA (expo-updates) — auto-hébergées

> ## 🚨 AVANT UN BUILD RELEASE MOBILE (rappel 01/09)
>
> `apps/mobile/app.json` contient actuellement des valeurs de **DEV** :
> - `updates.url: "http://localhost:3999"` (au lieu de `https://updates.qoe.fi`)
> - `NSAppTransportSecurity.NSAllowsArbitraryLoads: true` (ATS désactivé)
>
> **Tant que c'est en place, NE PAS lancer `eas build --profile production`** :
> l'app release chercherait ses updates OTA sur `localhost:3999` (cassé en prod)
> et ATS serait désactivé (régression sécurité). **Reverter ces deux valeurs**
> (URL → `https://updates.qoe.fi`, supprimer le bloc `NSAppTransportSecurity`)
> avant tout build de soumission.

Livrer le **JS** de l'app mobile **sans passer par l'App Store / Play Store**,
via un serveur d'updates maison implémentant le **protocole Expo Updates**.

> ⚠️ Limite fondamentale : l'OTA ne couvre que le **JS/bundle**. Tout
> changement **natif** (nouveau module Swift/Kotlin, bump de SDK Expo,
> plugin natif) impose une vraie mise à jour du store + un bump de
> `runtimeVersion` (voir §4).

---

## 1. Architecture

```
app mobile (build RELEASE)
   │  au lancement : GET https://updates.qoe.fi/api/manifest
   │                 (headers: expo-platform, expo-runtime-version, …)
   ▼
Caddy (updates.qoe.fi, cert on_demand)
   ▼
service docker `updates` (node:22-alpine, zéro dépendance)
   ▼
bind mount ./data/updates  (hôte VPS)
   └─ updates/<runtimeVersion>/<horodatage>/
        ├─ metadata.json        ← `expo export` (dist/metadata.json)
        ├─ _expo/…  assets/…    ← bundle + assets exportés
        ├─ expoConfig.json      ← config Expo publique (extra.expoClient)
        └─ rollback             ← fichier vide = directive rollBackToEmbedded
```

- **Client** : `expo-updates` (~57.0.19) installé dans `apps/mobile`, config
  dans `app.json` (`updates.url`, `runtimeVersion`, `checkAutomatically`).
  En **debug**, expo-updates est désactivé (Metro sert le JS) : l'OTA ne
  s'observe qu'en build **release**.
- **Serveur** : `docker/updates/server.js` (Node pur, aucun npm install au
  build) — endpoints `GET /api/manifest`, `GET /api/assets`, `GET /healthz`.
  Implémentation minimaliste du serveur de référence Expo
  (`expo/custom-expo-updates-server`), **durcie** (pas de traversal :
  les assets hors de l'update courant → 403).
- **Réseau** : `updates.qoe.fi` → Caddy (bloc dédié, _avant_ le wildcard
  `*.qoe.fi`) → service `updates` (réseau `qoefi-public`).

## 2. Publish un update

```bash
# Depuis le poste de dev :
./scripts/publish-update.sh

# Vers le VPS :
UPDATES_TARGET=root@vps:/var/www/qoe/data/updates ./scripts/publish-update.sh
```

Le script : `expo export` (ios + android) → copie dans
`updates/<runtimeVersion>/<horodatage>/` → génère `expoConfig.json` →
rsync vers la cible (par défaut `./data/updates`, le bind mount local).

L'app release télécharge l'update au **prochain démarrage**
(`checkAutomatically: ON_LOAD`, `fallbackToCacheTimeout: 0` — le splash
attend la réponse du serveur ; si le serveur est injoignable, l'app démarre
sur le bundle embarqué).

## 3. Rollback

Sur le serveur, créer un fichier vide dans un répertoire d'update :

```bash
touch data/updates/updates/<runtimeVersion>/<horodatage>/rollback
```

Le serveur renvoie alors la directive `rollBackToEmbedded` (protocole v1) :
les apps déjà sur cet update reviennent au bundle embarqué dans le binaire.
Pour « retirer » un update : déplacez son répertoire (le serveur sert
toujours le **dernier** horodatage du runtimeVersion).

## 4. Runtime version — discipline

`app.json → runtimeVersion` (actuellement `"1.0.0"`, **manuelle**).

- **Update JS seul** (bugfix, nouvelle page, i18n) : AUCUN bump — même
  runtimeVersion, les apps existantes reçoivent l'update.
- **Changement natif** (nouveau module, bump SDK, plugin) : **bump
  obligatoire** + nouvelle build store. Un update avec un runtimeVersion
  inconnu est ignoré silencieusement par les apps (pas de crash).

## 5. Tester en local

```bash
# 1. Build release local (simulateur) — la config updates est celle d'app.json :
cd apps/mobile
npx expo run:ios --configuration Release   # → pointe sur https://updates.qoe.fi

# 2. OU serveur local pour tester hors VPS :
#    (remplacer updates.url par http://localhost:3000 dans app.json + prebuild)
UPDATES_ROOT=/tmp/updates UPDATES_PUBLIC_BASE_URL=http://localhost:3000 \
  node docker/updates/server.js
./scripts/publish-update.sh   # avec UPDATES_TARGET=/tmp/updates
```

> L'API Updates (`checkForUpdateAsync`/`reloadAsync`) n'est disponible qu'en
> build release ; Expo Go et les dev builds l'ignorent (simulation EAS seule).

## 6. Sécurité — code signing (actif)

Les manifests sont **signés RSA-SHA256** : l'app vérifie la signature contre
le certificat embarqué avant d'appliquer un update (anti-tampering ISP/CDN).

- **Clés** : générées par `npx expo-updates codesigning:generate` (10 ans,
  CN « Qoe ») → `apps/mobile/keys/` (**gitignoré**, jamais commité) +
  `apps/mobile/certs/certificate.pem` (**commité** : embarqué dans les
  builds via `updates.codeSigningCertificate` + `codeSigningMetadata`
  `{keyid: "main", alg: "rsa-v1_5-sha256"}` dans app.json).
- **Serveur** : signe à la volée quand le client envoie `expo-expect-signature`
  (clé montée via `UPDATES_SIGNING_KEY`, refuse de démarrer sans elle).
- **Déploiement de la clé** : `scripts/deploy-prod.sh` pousse
  `apps/mobile/keys/private-key.pem` → `data/updates-signing-key.pem` du
  VPS à chaque déploiement (warning si absente localement).
- ⚠️ **Rotation** : notre procédure est automatisée —

  ```bash
  bash scripts/rotate-code-signing-key.sh
  ```

  1. Le script **sauvegarde** l'ancienne paire dans `apps/mobile/keys/backup-<ts>/`
     (⚠️ à copier dans un coffre/KMS — la clé privée est gitignorée et
     n'existe que sur le poste de dev + le VPS), génère une nouvelle paire
     (10 ans, CN « Qoe »), **bump le `runtimeVersion`** (patch : `1.0.0 → 1.0.1`)
     et resynchronise les projets natifs (nouveau certificat embarqué).
  2. **Commit** : `apps/mobile/certs/certificate.pem` (public, committé) +
     `apps/mobile/app.json` (nouveau runtimeVersion).
  3. **Build + soumission store** de la nouvelle version native (seuls les
     nouveaux binaires connaissent le nouveau certificat).
  4. **Déploiement** : `bash scripts/deploy-prod.sh` (scp de la nouvelle clé
     privée → `data/updates-signing-key.pem` du VPS).
  5. **Publish** des updates suivants (`bash scripts/publish-update.sh`) —
     ils portent le nouveau runtimeVersion.

  Un client ancien qui reçoit un update signé avec la nouvelle clé échoue à
  la vérification et **reste sur son bundle embarqué** (pas de crash) ; c'est
  pour ça que le runtimeVersion doit être bumpé : il ignore l'update avant
  même de le télécharger. Ne supprimez le backup qu'une fois tous les
  clients migrés. Sauvegardez `apps/mobile/keys/` (KMS/coffre) : sans la
  clé privée, plus de signature possible.

## 6bis. Limites connues

- **Pas de canaux** (channels EAS) ni de rollout progressif : le serveur
  sert le dernier horodatage à tous. Un futur « channel » = un sous-dossier
  par canal dans le runtimeVersion.
- Serveur **stateless** : pas de base de données — l'historique des updates
  est l'arborescence du volume. Pensez à sauvegarder `data/updates/`.

## 7. Mise en place (infra + déploiement)

Le service `updates` est intégré au déploiement standard :

1. **DNS** (une seule fois) : créer le record `updates.qoe.fi` → IP du VPS.
2. **Image GHCR** : buildée par la CI (`.github/workflows/build-images.yml`,
   matrice `updates` → `ghcr.io/flayrox/qoefi-updates:latest`), pullée par
   `scripts/deploy-prod.sh` comme les autres services.
3. **Déploiement** : `bash scripts/deploy-prod.sh` démarre le service
   (`ALL_SERVICES` inclut `updates` + smoke test `updates.qoe.fi/healthz`).
4. **Premier publish OTA** :
   `bash scripts/deploy-prod.sh --publish-update` — exporte le bundle,
   rsync vers `data/updates` du VPS et vérifie le manifest HTTPS.
   (ou manuellement : `UPDATES_TARGET=root@vps:/var/www/qoe.fi/data/updates
./scripts/publish-update.sh`)
5. **Valider** :
   ```bash
   curl -H "expo-platform: ios" -H "expo-runtime-version: 1.0.0" \
     https://updates.qoe.fi/api/manifest   # → multipart/mixed
   curl https://updates.qoe.fi/healthz     # → {"ok":true,…}
   ```

> La clé privée de code signing (si activée, §6) est montée dans le
> container via `UPDATES_SIGNING_KEY` (voir docker-compose.yml) — jamais
> committée.
