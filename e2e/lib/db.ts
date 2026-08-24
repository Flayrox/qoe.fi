// =====================================================================
// 🗄️ e2e/lib/db.ts — client Postgres partagé pour les fixtures E2E.
// Utilisé par les specs tenants/studio/admin pour préparer des données
// déterministes (sous-domaines, users) sans passer par l'API.
// =====================================================================

import { Client } from 'pg';

export class TestDb {
  private client: Client | null = null;

  constructor(private readonly connectionString: string) {}

  async connect(): Promise<void> {
    if (this.client) return;
    this.client = new Client({ connectionString: this.connectionString });
    await this.client.connect();
  }

  async close(): Promise<void> {
    await this.client?.end();
    this.client = null;
  }

  async query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values: unknown[] = []
  ): Promise<T[]> {
    if (!this.client) throw new Error('TestDb: connect() d’abord');
    const res = await this.client.query<T>(text, values);
    return res.rows;
  }

  /**
   * Garantit qu'une publication possède un sous-domaine tenant donné
   * (résolu par GET /v1/publications/by-domain). Renvoie son id.
   */
  async ensureSubdomain(subdomain: string, publicationId: string): Promise<void> {
    await this.query(`UPDATE "Publication" SET subdomain = $1 WHERE id = $2`, [
      subdomain,
      publicationId,
    ]);
  }

  /** Insère (ou met à jour) un user de l'app avec le rôle demandé. */
  async ensureUser(
    id: string,
    email: string,
    role: string,
    opts: { publicationId?: string; hasCompletedOnboarding?: boolean } = {}
  ): Promise<void> {
    await this.query(
      `INSERT INTO "User" (id, email, username, name, role, "publicationId", "hasCompletedOnboarding", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $3, $4, $5, $6, now(), now())
       ON CONFLICT (id) DO UPDATE SET role = $4, "publicationId" = $5,
         "hasCompletedOnboarding" = $6, "updatedAt" = now()`,
      [
        id,
        email,
        email.split('@')[0].replace(/[^a-z0-9_]/gi, '') + String(Date.now()).slice(-4),
        role,
        opts.publicationId ?? null,
        opts.hasCompletedOnboarding ?? true,
      ]
    );
  }

  /** Retourne l'id d'un article seedé par slug. */
  async articleIdBySlug(slug: string): Promise<string | null> {
    const rows = await this.query<{ id: string }>(
      `SELECT id FROM "Article" WHERE slug = $1 LIMIT 1`,
      [slug]
    );
    return rows[0]?.id ?? null;
  }
}
