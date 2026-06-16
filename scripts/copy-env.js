// =====================================================================
// 🔄 copy-env.js — Synchronise automatiquement le .env racine vers les apps
// =====================================================================
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const rootEnvPath = path.join(rootDir, '.env');

const apps = ['landing', 'feed', 'dashboard', 'admin', 'web'];

if (!fs.existsSync(rootEnvPath)) {
  console.warn('⚠️  No root .env file found. Copying .env.docker.example as .env...');
  const rootExamplePath = path.join(rootDir, '.env.docker.example');
  if (fs.existsSync(rootExamplePath)) {
    fs.copyFileSync(rootExamplePath, rootEnvPath);
    console.log('✅ Created root .env file.');
  } else {
    console.error('❌ Could not find root .env or .env.docker.example!');
    process.exit(1);
  }
}

apps.forEach((app) => {
  const appEnvDir = path.join(rootDir, 'apps', app);
  if (!fs.existsSync(appEnvDir)) {
    return; // skip if directory doesn't exist
  }
  const appEnvPath = path.join(appEnvDir, '.env');
  try {
    fs.copyFileSync(rootEnvPath, appEnvPath);
    console.log(`✅ Synced .env to apps/${app}/.env`);
  } catch (err) {
    console.error(`❌ Failed to sync .env to apps/${app}/.env:`, err);
  }
});
