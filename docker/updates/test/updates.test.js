// =====================================================================
// 🧪 Tests du serveur d'updates OTA (docker/updates/server.js)
// =====================================================================
// node:test — zéro dépendance, comme le serveur lui-même.
// Le serveur est lancé en sous-processus avec un fixture dans un tmpdir :
//   <tmp>/1.0.0/<horodatage>/   ← 2 horodatages pour tester « le dernier gagne »
// Chaque groupe de tests monte son propre serveur (contexte isolé).
//
// Lancement :  node --test test/   (depuis docker/updates)
// =====================================================================

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const SERVER = path.join(__dirname, '..', 'server.js');

// ── Helpers ──────────────────────────────────────────────────────────

/** Port TCP libre (écoute sur 127.0.0.1 puis ferme). */
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/**
 * Démarre le serveur en sous-processus. Résout l'URL de base une fois
 * qu'il écoute ; arrête le process à la fin du test (t.after).
 */
async function startServer(t, { root, signingKey = '' } = {}) {
  const port = await freePort();
  const child = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      PORT: String(port),
      UPDATES_ROOT: root,
      PUBLIC_BASE_URL: `http://127.0.0.1:${port}`,
      PRIVATE_KEY_PATH: signingKey,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout.on('data', (d) => {
    output += d;
  });
  child.stderr.on('data', (d) => {
    output += d;
  });

  const ready = new Promise((resolve, reject) => {
    const watchdog = setTimeout(
      () => reject(new Error(`serveur non démarré en 5s. Sortie : ${output}`)),
      5000
    );
    child.once('exit', (code) => {
      clearTimeout(watchdog);
      reject(new Error(`serveur arrêté (code ${code}). Sortie : ${output}`));
    });
    const check = (data) => {
      output += data;
      if (output.includes('listening on')) {
        clearTimeout(watchdog);
        child.stdout.off('data', check);
        resolve();
      }
    };
    child.stdout.on('data', check);
  });

  await ready;
  t.after(() => {
    child.kill('SIGTERM');
  });
  return `http://127.0.0.1:${port}`;
}

/**
 * Écrit un update complet dans un répertoire : metadata.json + bundle
 * ios/android + assets. Le contenu distinct du bundle ios sert à
 * prouver que c'est bien le bon update qui est servi.
 */
async function writeUpdate(dir, { mark = 'V1' } = {}) {
  await fsp.mkdir(path.join(dir, 'assets'), { recursive: true });
  await fsp.writeFile(path.join(dir, 'bundle.ios'), Buffer.from(`IOS-BUNDLE:${mark}`));
  await fsp.writeFile(path.join(dir, 'bundle.android'), Buffer.from(`ANDROID-BUNDLE:${mark}`));
  const assets = {
    'assets/logo.png': Buffer.from(`PNG:${mark}`),
    'assets/cover.jpg': Buffer.from(`JPG:${mark}`),
  };
  for (const [rel, content] of Object.entries(assets)) {
    const p = path.join(dir, rel);
    await fsp.mkdir(path.dirname(p), { recursive: true });
    await fsp.writeFile(p, content);
  }
  const metadata = {
    version: 0,
    fileMetadata: {
      ios: {
        bundle: 'bundle.ios',
        assets: Object.entries(assets).map(([rel, content]) => ({
          path: rel,
          ext: path.extname(rel).slice(1),
          md5: crypto.createHash('md5').update(content).digest('hex'),
        })),
      },
      android: {
        bundle: 'bundle.android',
        assets: [],
      },
    },
  };
  await fsp.writeFile(path.join(dir, 'metadata.json'), JSON.stringify(metadata, null, 2));
}

const NOW = Date.now();

/** Arborescence runtime 1.0.0 avec deux horodatages (le plus récent gagne). */
async function fixtureTree(root) {
  await writeUpdate(path.join(root, '1.0.0', '20260101000000'), { mark: 'OLD' });
  await writeUpdate(path.join(root, '1.0.0', '20260102000000'), { mark: 'NEW' });
}

/** Fetch + lecture texte (headers par défaut du client expo-updates). */
async function api(base, route, headers = {}) {
  const res = await fetch(base + route, {
    headers: {
      'expo-platform': 'ios',
      'expo-runtime-version': '1.0.0',
      ...headers,
    },
  });
  const body = await res.text();
  return { status: res.status, headers: res.headers, body };
}

/** Décode une réponse multipart/mixed en { parties: [{headers, content}] }. */
function parseMultipart(body, contentType) {
  const match = /boundary=([^\s;]+)/.exec(contentType);
  assert.ok(match, `content-type multipart attendue, reçu : ${contentType}`);
  const boundary = match[1];
  const sections = body.split(`--${boundary}`);
  const parts = [];
  for (const section of sections) {
    const s = section.replace(/^--/, '');
    if (s.trim() === '') continue;
    const trimmed = s.startsWith('\r\n') ? s.slice(2) : s;
    const headerEnd = trimmed.indexOf('\r\n\r\n');
    assert.ok(headerEnd !== -1, 'partie multipart sans en-têtes');
    parts.push({
      headers: trimmed.slice(0, headerEnd),
      content: trimmed.slice(headerEnd + 4).replace(/\r\n$/, ''),
    });
  }
  return parts;
}

const partName = (p) => /name="([^"]+)"/.exec(p.headers)?.[1];
const partHeader = (p, name) => {
  const re = new RegExp(`^${name}:\\s*(.+)$`, 'im');
  return re.exec(p.headers)?.[1];
};

// ── Sans clé de code signing ─────────────────────────────────────────

test('healthz', async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'qoe-upd-'));
  await fixtureTree(root);
  const base = await startServer(t, { root });

  const res = await fetch(`${base}/healthz`);
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(await res.text()), { ok: true, service: 'qoe-updates' });
});

test('manifest protocol v0 — multipart/mixed avec manifest + extensions', async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'qoe-upd-'));
  await fixtureTree(root);
  const base = await startServer(t, { root });

  const { status, headers, body } = await api(base, '/api/manifest', {
    'expo-protocol-version': '0',
  });
  assert.equal(status, 200);
  assert.equal(headers.get('expo-protocol-version'), '0');
  assert.match(headers.get('content-type'), /^multipart\/mixed; boundary=/);

  const parts = parseMultipart(body, headers.get('content-type'));
  assert.deepEqual(parts.map(partName), ['manifest', 'extensions'], 'ordre et noms des parties');

  const manifest = JSON.parse(parts[0].content);
  assert.match(manifest.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.equal(manifest.runtimeVersion, '1.0.0');
  assert.equal(manifest.metadata && typeof manifest.metadata, 'object');
  assert.equal(manifest.launchAsset.contentType, 'application/javascript');
  assert.match(manifest.launchAsset.url, /^http:\/\/127\.0\.0\.1:\d+\/api\/assets\?/);
  assert.equal(manifest.launchAsset.url.includes('bundle.ios'), true);
  // L'update le plus récent est servi (contentType png pour logo.png).
  const logo = manifest.assets.find((a) => a.key);
  assert.equal(logo.contentType, 'image/png');
  assert.equal(
    partHeader(parts[0], 'expo-signature'),
    undefined,
    'pas de signature sans expect-signature'
  );

  const extensions = JSON.parse(parts[1].content);
  assert.equal(typeof extensions.assetRequestHeaders, 'object');
});

test('le dernier horodatage gagne — id du manifest = sha256 du metadata.json le plus récent', async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'qoe-upd-'));
  await fixtureTree(root);
  const base = await startServer(t, { root });

  const { headers, body } = await api(base, '/api/manifest');
  const parts = parseMultipart(body, headers.get('content-type'));
  const manifest = JSON.parse(parts[0].content);

  const newestMetadata = await fsp.readFile(
    path.join(root, '1.0.0', '20260102000000', 'metadata.json')
  );
  const hex = crypto.createHash('sha256').update(newestMetadata).digest('hex');
  const expectedId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  assert.equal(manifest.id, expectedId);
});

test('directive noUpdateAvailable quand le client est déjà à jour (protocole v1)', async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'qoe-upd-'));
  await fixtureTree(root);
  const base = await startServer(t, { root });

  // 1. Récupère l'id de l'update courant.
  const first = await api(base, '/api/manifest', { 'expo-protocol-version': '1' });
  const manifest = JSON.parse(
    parseMultipart(first.body, first.headers.get('content-type'))[0].content
  );

  // 2. Le client déclare être sur cet update → directive, pas de manifest.
  const second = await api(base, '/api/manifest', {
    'expo-protocol-version': '1',
    'expo-current-update-id': manifest.id,
  });
  assert.equal(second.status, 200);
  const parts = parseMultipart(second.body, second.headers.get('content-type'));
  assert.equal(parts.length, 1);
  assert.equal(partName(parts[0]), 'directive');
  assert.deepEqual(JSON.parse(parts[0].content), { type: 'noUpdateAvailable' });
});

test('erreurs d’entrée — plateforme invalide, runtime inconnu, identifiants manquants', async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'qoe-upd-'));
  await fixtureTree(root);
  const base = await startServer(t, { root });

  const badPlatform = await api(base, '/api/manifest', { 'expo-platform': 'web' });
  assert.equal(badPlatform.status, 400);

  const noRuntime = await fetch(`${base}/api/manifest`, { headers: { 'expo-platform': 'ios' } });
  assert.equal(noRuntime.status, 400);

  const unknownRuntime = await api(base, '/api/manifest', { 'expo-runtime-version': '9.9.9' });
  assert.equal(unknownRuntime.status, 404);

  const noAsset = await api(base, '/api/assets?runtimeVersion=1.0.0&platform=ios');
  assert.equal(noAsset.status, 400);

  const noPlatform = await api(base, '/api/assets?asset=/x&runtimeVersion=1.0.0');
  assert.equal(noPlatform.status, 400);
});

test('anti-traversal — jamais servir hors du répertoire de l’update courant', async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'qoe-upd-'));
  await fixtureTree(root);
  const base = await startServer(t, { root });

  // Fichier système.
  const etc = await api(base, '/api/assets?asset=/etc/passwd&runtimeVersion=1.0.0&platform=ios');
  assert.equal(etc.status, 403);

  // Traversal encodé.
  const trav = await api(
    base,
    '/api/assets?asset=' +
      encodeURIComponent('../../../../etc/passwd') +
      '&runtimeVersion=1.0.0&platform=ios'
  );
  assert.equal(trav.status, 403);

  // Chemin absolu dans un AUTRE update du même runtime (l'ancien) → interdit.
  const oldAsset = path.join(root, '1.0.0', '20260101000000', 'assets', 'logo.png');
  const oldReq = await api(
    base,
    `/api/assets?asset=${encodeURIComponent(oldAsset)}&runtimeVersion=1.0.0&platform=ios`
  );
  assert.equal(oldReq.status, 403, "l'asset d'un update plus ancien ne doit pas être servi");

  // Fichier inexistant DANS l'update courant → 404, pas 403.
  const missing = await api(
    base,
    `/api/assets?asset=${encodeURIComponent(path.join(root, '1.0.0', '20260102000000', 'nope.js'))}&runtimeVersion=1.0.0&platform=ios`
  );
  assert.equal(missing.status, 404);
});

test('assets — l’URL du manifest sert le bon contenu avec le bon content-type', async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'qoe-upd-'));
  await fixtureTree(root);
  const base = await startServer(t, { root });

  const { headers, body } = await api(base, '/api/manifest');
  const manifest = JSON.parse(parseMultipart(body, headers.get('content-type'))[0].content);

  // Launch asset : bundle du dernier update.
  const launch = await fetch(manifest.launchAsset.url);
  assert.equal(launch.status, 200);
  assert.equal(launch.headers.get('content-type'), 'application/javascript');
  assert.equal(await launch.text(), 'IOS-BUNDLE:NEW');

  // Asset image : content-type + contenu du dernier update.
  const logo = manifest.assets.find((a) => a.url.includes('logo'));
  const img = await fetch(logo.url);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/png');
  assert.equal(await img.text(), 'PNG:NEW');
});

// ── Code signing ─────────────────────────────────────────────────────

function generateKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    publicPem: publicKey.export({ type: 'spki', format: 'pem' }),
  };
}

test('manifest signé — expo-signature vérifiable avec la clé publique (RSA-SHA256)', async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'qoe-upd-'));
  const keys = generateKeyPair();
  await fixtureTree(root);
  const keyPath = path.join(root, 'private-key.pem');
  await fsp.writeFile(keyPath, keys.privatePem);
  const base = await startServer(t, { root, signingKey: keyPath });

  const { status, headers, body } = await api(base, '/api/manifest', {
    'expo-protocol-version': '1',
    'expo-expect-signature': 'sig, keyid="main", alg="rsa-v1_5-sha256"',
  });
  assert.equal(status, 200);

  const parts = parseMultipart(body, headers.get('content-type'));
  const manifestPart = parts.find((p) => partName(p) === 'manifest');
  assert.ok(manifestPart, 'partie manifest présente');

  const signature = partHeader(manifestPart, 'expo-signature');
  assert.ok(signature, 'en-tête expo-signature présent');
  const sig = /sig="([^"]+)"/.exec(signature)?.[1];
  assert.ok(sig, 'signature base64 extraite');
  assert.match(signature, /keyid="main"/);

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(manifestPart.content, 'utf8');
  verifier.end();
  assert.equal(
    verifier.verify(keys.publicPem, sig, 'base64'),
    true,
    'la signature doit être valide'
  );
});

test('expect-signature demandée sans clé configurée → 400 explicite', async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'qoe-upd-'));
  await fixtureTree(root);
  const base = await startServer(t, { root });

  const res = await api(base, '/api/manifest', { 'expo-expect-signature': 'sig' });
  assert.equal(res.status, 400);
  assert.match(res.body, /no private key/i);
});

test('serveur refuse de démarrer si PRIVATE_KEY_PATH est illisible', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'qoe-upd-'));
  const port = await freePort();
  const child = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      PORT: String(port),
      UPDATES_ROOT: root,
      PRIVATE_KEY_PATH: path.join(root, 'absent.pem'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (d) => {
    output += d;
  });
  child.stderr.on('data', (d) => {
    output += d;
  });
  const exit = await new Promise((resolve) => child.once('exit', resolve));
  assert.equal(exit, 1);
  assert.match(output, /PRIVATE_KEY_PATH/i);
});

// ── Rollback ─────────────────────────────────────────────────────────

test('rollback — directive rollBackToEmbedded (protocole v1)', async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'qoe-upd-'));
  const updateDir = path.join(root, '1.0.0', '20260103000000');
  await writeUpdate(updateDir, { mark: 'ROLLBACK' });
  await fsp.writeFile(path.join(updateDir, 'rollback'), '');

  // Le serveur calcule commitTime depuis le birthtime du fichier rollback.
  const now = new Date();
  await fsp.utimes(path.join(updateDir, 'rollback'), now, now);

  const base = await startServer(t, { root });

  // Client sur l'embedded (current != embedded) → directive rollBackToEmbedded.
  const res = await api(base, '/api/manifest', {
    'expo-protocol-version': '1',
    'expo-embedded-update-id': 'embedded-0000-0000-0000-000000000000',
    'expo-current-update-id': 'current-1111-1111-1111-111111111111',
  });
  assert.equal(res.status, 200);
  const parts = parseMultipart(res.body, res.headers.get('content-type'));
  assert.equal(partName(parts[0]), 'directive');
  const directive = JSON.parse(parts[0].content);
  assert.equal(directive.type, 'rollBackToEmbedded');
  assert.ok(directive.parameters.commitTime);

  // Client déjà sur l'embedded → noUpdateAvailable.
  const same = await api(base, '/api/manifest', {
    'expo-protocol-version': '1',
    'expo-embedded-update-id': 'embedded-0000-0000-0000-000000000000',
    'expo-current-update-id': 'embedded-0000-0000-0000-000000000000',
  });
  const sameParts = parseMultipart(same.body, same.headers.get('content-type'));
  assert.deepEqual(JSON.parse(sameParts[0].content), { type: 'noUpdateAvailable' });

  // Protocole v0 → refus explicite.
  const v0 = await api(base, '/api/manifest', {
    'expo-protocol-version': '0',
    'expo-embedded-update-id': 'embedded-0000-0000-0000-000000000000',
    'expo-current-update-id': 'current-1111-1111-1111-111111111111',
  });
  assert.equal(v0.status, 400);

  // Header embedded manquant → 400.
  const missing = await api(base, '/api/manifest', {
    'expo-protocol-version': '1',
    'expo-current-update-id': 'current-1111-1111-1111-111111111111',
  });
  assert.equal(missing.status, 400);
});
