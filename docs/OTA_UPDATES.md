# 📦 Mises à jour OTA (expo-updates) — auto-hébergées

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
- **Réseau** : `updates.qoe.fi` → Caddy (bloc dédié, *avant* le wildcard
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

## 6. Sécurité & limites connues

- **Pas de code signing** pour l'instant : le serveur refuse explicitement
  `expo-expect-signature` (400) — il ne servira jamais un manifest non
  signé à un client qui l'exigerait. Ajout possible plus tard
  (`expo/code-signing-certificates` + `updates.codeSigningCertificate`).
- **Pas de canaux** (channels EAS) ni de rollout progressif : le serveur
  sert le dernier horodatage à tous. Un futur « channel » = un sous-dossier
  par canal dans le runtimeVersion.
- Serveur **stateless** : pas de base de données — l'historique des updates
  est l'arborescence du volume. Pensez à sauvegarder `data/updates/`.

## 7. Mise en place restante (infra)

1. DNS : créer le record `updates.qoe.fi` → IP du VPS.
2. Déployer : `docker compose up -d updates` (le service est dans
   docker-compose.yml, l'image buildée localement ou poussée sur GHCR
   `ghcr.io/flayrox/qoefi-updates:latest`).
3. Premier publish : `UPDATES_TARGET=… ./scripts/publish-update.sh`.
4. Valider : `curl -H "expo-platform: ios" -H "expo-runtime-version: 1.0.0" \
   https://updates.qoe.fi/api/manifest` doit renvoyer un multipart/mixed.
