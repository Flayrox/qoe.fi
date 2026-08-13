// =====================================================================
// 🧪 Testcontainers Postgres Setup — @qoe/db integration tests
// =====================================================================
// 📖 Démarre un vrai Postgres + pgvector dans Docker, applique les
//    migrations Prisma, et expose un client Prisma isolé.
//    Contrairement aux tests unitaires (mocks), ici on teste le SQL réel.
//
// 🎯 Singleton : un seul conteneur par exécution de test, partagé entre
//    tous les fichiers d'intégration, reset entre chaque test.
// =====================================================================

import { execSync } from 'node:child_process';
import path from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';

const MIGRATIONS_PATH = path.resolve(__dirname, '../../../prisma/migrations');

let container: StartedPostgreSqlContainer | null = null;
let _client: PrismaClient | null = null;

export async function startDatabase(): Promise<string> {
  if (container) return container.getConnectionUri();

  container = await new PostgreSqlContainer('pgvector/pgvector:pg16')
    .withDatabase('qoe_test')
    .withUsername('qoe')
    .withPassword('qoe')
    .withExposedPorts(5432)
    .start();

  const url = container.getConnectionUri();

  // Synchronise le schéma Prisma complet directement (mieux adapté aux tests
  // que les migrations : celles-ci ne couvrent qu'une partie du schéma).
  // `--accept-data-loss` sans warning pour un conteneur vide.
  execSync('npx prisma db push --schema packages/db/prisma/schema.prisma --accept-data-loss', {
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
    cwd: path.resolve(__dirname, '../../../../../'),
    stdio: 'pipe',
  });

  return url;
}

export function getClient(url: string): PrismaClient {
  if (!_client) {
    _client = new PrismaClient({
      datasources: { db: { url } },
    });
  }
  return _client;
}

export async function stopDatabase(): Promise<void> {
  if (_client) {
    await _client.$disconnect();
    _client = null;
  }
  if (container) {
    await container.stop();
    container = null;
  }
}

// Exposé pour les tests (cleanup par fichier).
export { MIGRATIONS_PATH };
