#!/usr/bin/env node
// =====================================================================
// 📦 Serveur d'updates OTA — protocole « Expo Updates »
// =====================================================================
// Implémentation minimaliste et sans dépendance du serveur de référence
// d'Expo (github.com/expo/custom-expo-updates-server), pour héberger nos
// propres updates expo-updates sur l'infra Qoe (souveraineté : pas d'EAS).
//
// Layout des updates (volume monté sur /app/updates) :
//   updates/<runtimeVersion>/<horodatage>/
//     metadata.json     ← sortie de `npx expo export` (dist/metadata.json)
//     _expo/…, assets/… ← fichiers exportés
//     expoConfig.json   ← config Expo (optionnel, pour extra.expoClient)
//   updates/<runtimeVersion>/<horodatage>/rollback   ← fichier vide = rollback
//
// Endpoints :
//   GET /api/manifest          → multipart/mixed (manifest ou directive)
//   GET /api/assets?asset=…    → un asset du bundle (path ABSOLU du container)
//   GET /healthz               → santé (utilisé par docker healthcheck)
//
// Pas de code signing (le client n'est pas configuré avec un certificat) :
// la signature RSA n'est pas implémentée — `expo-expect-signature` renvoie
// une 400 explicite pour ne JAMAIS servir un manifest non signé quand le
// client l'exige.
// =====================================================================

'use strict';

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const PORT = Number(process.env.PORT || 3000);
const UPDATES_ROOT = process.env.UPDATES_ROOT || '/app/updates';
// URL publique par laquelle l'app joint ce serveur (assets + manifest).
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`).replace(
  /\/$/,
  ''
);

// ── Mime types des assets exportés par expo (extensions communes) ──────
const MIME_BY_EXT = {
  js: 'application/javascript',
  json: 'application/json',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  mp4: 'video/mp4',
  webm: 'video/webm',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  html: 'text/html',
  txt: 'text/plain',
  mp3: 'audio/mpeg',
  mov: 'video/quicktime',
};

function mimeType(ext) {
  return MIME_BY_EXT[(ext || '').toLowerCase().replace(/^\./, '')] || 'application/octet-stream';
}

function base64Url(input) {
  return input.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function md5Hex(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

/** metadata.json (sha256 hex) → UUID canonique expo-updates. */
function sha256HashToUUID(hex) {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Dernier répertoire d'update (tri numérique décroissant des horodatages). */
async function latestUpdateDirForRuntimeVersion(runtimeVersion) {
  const dir = path.join(UPDATES_ROOT, runtimeVersion);
  if (!/^[0-9a-zA-Z._-]+$/.test(runtimeVersion)) {
    throw new HttpError(400, 'Invalid runtime version.');
  }
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    throw new HttpError(404, `Unsupported runtime version: ${runtimeVersion}`);
  }
  const dirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort((a, b) => Number(b) - Number(a));
  if (dirs.length === 0) {
    throw new HttpError(404, `No update found for runtime version: ${runtimeVersion}`);
  }
  return path.join(dir, dirs[0]);
}

/** Lit metadata.json + calcule id (sha256) et createdAt (birthtime). */
async function readMetadata(updateDir) {
  const metadataPath = path.join(updateDir, 'metadata.json');
  let buffer;
  try {
    buffer = await fsp.readFile(metadataPath);
  } catch {
    throw new HttpError(404, `No metadata.json in update: ${updateDir}`);
  }
  const stat = await fsp.stat(metadataPath);
  return {
    metadataJson: JSON.parse(buffer.toString('utf8')),
    createdAt: new Date(stat.birthtime).toISOString(),
    id: sha256Hex(buffer),
  };
}

/** Métadonnées d'un asset (hash base64url, key md5, URL de fetch). */
async function assetMetadata({
  updateDir,
  filePath,
  ext,
  isLaunchAsset,
  runtimeVersion,
  platform,
}) {
  const absPath = path.join(updateDir, filePath);
  const content = await fsp.readFile(absPath);
  const keyExt = isLaunchAsset ? 'bundle' : ext;
  return {
    hash: base64Url(crypto.createHash('sha256').update(content).digest('base64')),
    key: md5Hex(content),
    fileExtension: `.${keyExt}`,
    contentType: isLaunchAsset ? 'application/javascript' : mimeType(ext),
    url: `${PUBLIC_BASE_URL}/api/assets?asset=${encodeURIComponent(absPath)}&runtimeVersion=${encodeURIComponent(runtimeVersion)}&platform=${encodeURIComponent(platform)}`,
  };
}

/** Construit le manifest expo-updates à partir de metadata.json. */
async function buildManifest({ updateDir, runtimeVersion, platform }) {
  const { metadataJson, createdAt, id } = await readMetadata(updateDir);
  const fileMetadata = metadataJson.fileMetadata && metadataJson.fileMetadata[platform];
  if (!fileMetadata) {
    throw new HttpError(404, `No ${platform} bundle in metadata.json`);
  }

  let expoConfig = {};
  try {
    expoConfig = JSON.parse(await fsp.readFile(path.join(updateDir, 'expoConfig.json'), 'utf8'));
  } catch {
    // optionnel — le client fonctionne sans extra.expoClient
  }

  const assets = await Promise.all(
    (fileMetadata.assets || []).map((asset) =>
      assetMetadata({
        updateDir,
        filePath: asset.path,
        ext: asset.ext,
        isLaunchAsset: false,
        runtimeVersion,
        platform,
      })
    )
  );

  const launchAsset = await assetMetadata({
    updateDir,
    filePath: fileMetadata.bundle,
    ext: null,
    isLaunchAsset: true,
    runtimeVersion,
    platform,
  });

  return {
    id: sha256HashToUUID(id),
    createdAt,
    runtimeVersion,
    assets,
    launchAsset,
    metadata: {},
    extra: { expoClient: expoConfig },
  };
}

// ── Multipart/mixed (même format que EAS Update / serveur de référence) ──
function multipartResponse(res, protocolVersion, parts) {
  const boundary = `----qoe-expo-updates-${crypto.randomBytes(8).toString('hex')}`;
  const chunks = [];
  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    chunks.push(
      Buffer.from(
        `content-disposition: form-data; name="${part.name}"\r\n` +
          `content-type: ${part.contentType}\r\n` +
          (part.extraHeaders || '') +
          '\r\n'
      )
    );
    chunks.push(Buffer.from(part.body));
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));

  res.writeHead(200, {
    'content-type': `multipart/mixed; boundary=${boundary}`,
    'expo-protocol-version': String(protocolVersion),
    'expo-sfv-version': '0',
    'cache-control': 'private, max-age=0',
  });
  res.end(Buffer.concat(chunks));
}

async function handleManifest(req, res, url) {
  const protocolVersion = Number(req.headers['expo-protocol-version'] ?? '0');
  const platform = req.headers['expo-platform'] || url.searchParams.get('platform');
  const runtimeVersion =
    req.headers['expo-runtime-version'] || url.searchParams.get('runtime-version');

  if (req.headers['expo-expect-signature']) {
    throw new HttpError(400, 'Code signing requested but not configured on this server.');
  }
  if (platform !== 'ios' && platform !== 'android') {
    throw new HttpError(400, 'Unsupported platform. Expected ios or android.');
  }
  if (!runtimeVersion || typeof runtimeVersion !== 'string') {
    throw new HttpError(400, 'No runtimeVersion provided.');
  }

  const updateDir = await latestUpdateDirForRuntimeVersion(runtimeVersion);
  const isRollback = fs.existsSync(path.join(updateDir, 'rollback'));

  if (isRollback) {
    if (protocolVersion !== 1) {
      throw new HttpError(400, 'Rollbacks not supported on protocol version 0.');
    }
    const embeddedUpdateId = req.headers['expo-embedded-update-id'];
    const currentUpdateId = req.headers['expo-current-update-id'];
    if (!embeddedUpdateId || typeof embeddedUpdateId !== 'string') {
      throw new HttpError(400, 'Invalid Expo-Embedded-Update-ID request header specified.');
    }
    if (currentUpdateId === embeddedUpdateId) {
      multipartResponse(res, protocolVersion, [
        {
          name: 'directive',
          contentType: 'application/json; charset=utf-8',
          body: JSON.stringify({ type: 'noUpdateAvailable' }),
        },
      ]);
      return;
    }
    const stat = await fsp.stat(path.join(updateDir, 'rollback'));
    multipartResponse(res, protocolVersion, [
      {
        name: 'directive',
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({
          type: 'rollBackToEmbedded',
          parameters: { commitTime: new Date(stat.birthtime).toISOString() },
        }),
      },
    ]);
    return;
  }

  const manifest = await buildManifest({ updateDir, runtimeVersion, platform });

  // Déjà à jour (protocole v1 uniquement) → directive noUpdateAvailable.
  if (req.headers['expo-current-update-id'] === manifest.id && protocolVersion === 1) {
    multipartResponse(res, protocolVersion, [
      {
        name: 'directive',
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({ type: 'noUpdateAvailable' }),
      },
    ]);
    return;
  }

  const assetRequestHeaders = {};
  for (const asset of [...manifest.assets, manifest.launchAsset]) {
    assetRequestHeaders[asset.key] = {};
  }

  multipartResponse(res, protocolVersion, [
    {
      name: 'manifest',
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(manifest),
    },
    {
      name: 'extensions',
      contentType: 'application/json',
      body: JSON.stringify({ assetRequestHeaders }),
    },
  ]);
}

async function handleAssets(req, res, url) {
  const assetName = url.searchParams.get('asset');
  const runtimeVersion = url.searchParams.get('runtimeVersion');
  const platform = url.searchParams.get('platform');

  if (!assetName) throw new HttpError(400, 'No asset name provided.');
  if (platform !== 'ios' && platform !== 'android')
    throw new HttpError(400, 'No platform provided.');
  if (!runtimeVersion) throw new HttpError(400, 'No runtimeVersion provided.');

  const updateDir = await latestUpdateDirForRuntimeVersion(runtimeVersion);
  const resolved = path.resolve(assetName);
  // 🔒 Harden : on ne sert JAMAIS en dehors du répertoire de l'update courant.
  const updateRoot = `${path.resolve(updateDir)}${path.sep}`;
  if (!resolved.startsWith(updateRoot) && resolved !== path.resolve(updateDir)) {
    throw new HttpError(403, 'Access denied.');
  }

  let content;
  try {
    content = await fsp.readFile(resolved);
  } catch {
    throw new HttpError(404, 'Asset not found.');
  }

  const relative = path.relative(updateDir, resolved);
  const { metadataJson } = await readMetadata(updateDir);
  const fileMetadata = metadataJson.fileMetadata[platform];
  const assetMeta = (fileMetadata.assets || []).find((a) => a.path === relative);
  const isLaunchAsset = fileMetadata.bundle === relative;
  const contentType = isLaunchAsset
    ? 'application/javascript'
    : assetMeta
      ? mimeType(assetMeta.ext)
      : mimeType(path.extname(relative));

  res.writeHead(200, {
    'content-type': contentType,
    'cache-control': 'public, max-age=31536000, immutable',
  });
  res.end(content);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, PUBLIC_BASE_URL);
  const route = url.pathname;
  (async () => {
    try {
      if (req.method === 'GET' && route === '/api/manifest') {
        await handleManifest(req, res, url);
      } else if (req.method === 'GET' && route === '/api/assets') {
        await handleAssets(req, res, url);
      } else if (req.method === 'GET' && (route === '/healthz' || route === '/')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, service: 'qoe-updates' }));
      } else {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status >= 500) console.error('[updates]', err);
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: err.message || 'Internal server error' }));
    }
  })();
});

server.listen(PORT, () => {
  console.log(`[qoe-updates] listening on :${PORT} (root: ${UPDATES_ROOT})`);
});
