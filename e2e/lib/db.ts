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
    // L'email est unique : si une ancienne ligne porte cet email avec un
    // autre id (ex. nouvel UUID GoTrue), on la retire pour garantir que
    // l'upsert par id passe.
    await this.query(`DELETE FROM "User" WHERE email = $2 AND id <> $1`, [id, email]);
    await this.query(
      `INSERT INTO "User" (id, email, username, name, role, "publicationId", "hasCompletedOnboarding", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $3, $4, $5, $6, now(), now())
       ON CONFLICT (id) DO UPDATE SET role = $4, email = $2, "publicationId" = $5,
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

  /**
   * 🏗️ Fixture hermétique de tenant : garantit l'auteur, la publication
   * (MEDIA ou PERSONAL) et son sous-domaine, sans dépendre du seed.
   *
   * Les specs média/paywall peuvent ainsi écrire leurs propres articles et
   * vérifier un contenu maîtrisé (marqueur de paywall inclus) plutôt que de
   * parier sur l'état d'une base seedée.
   */
  async ensurePublication(opts: {
    id: string;
    subdomain: string;
    name: string;
    type?: 'MEDIA' | 'PERSONAL';
    authorId: string;
    authorEmail: string;
    authorUsername: string;
    authorRole?: string;
    isCertified?: boolean;
    /** Désactive l'indexation si le test veut vérifier le contrat sitemap. */
    allowIndexing?: boolean;
  }): Promise<string> {
    const type = opts.type ?? 'MEDIA';
    await this.query(
      `INSERT INTO "User" (id, email, username, name, role, "hasCompletedOnboarding", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $3, $4, true, now(), now())
       ON CONFLICT (id) DO UPDATE SET email = $2, username = $3, role = $4, "updatedAt" = now()`,
      [opts.authorId, opts.authorEmail, opts.authorUsername, opts.authorRole ?? 'creator']
    );
    await this.query(
      `INSERT INTO "Publication" (id, type, name, slug, subdomain, "isCertified", "allowIndexing", "updatedAt")
       VALUES ($1, $2::"PublicationType", $3, $4, $5, $6, $7, now())
       ON CONFLICT (id) DO UPDATE SET type = $2::"PublicationType", name = $3, slug = $4,
         subdomain = $5, "isCertified" = $6, "allowIndexing" = $7, "updatedAt" = now()`,
      [
        opts.id,
        type,
        opts.name,
        opts.subdomain,
        opts.subdomain,
        opts.isCertified ?? type === 'MEDIA',
        opts.allowIndexing ?? true,
      ]
    );
    return opts.id;
  }

  /**
   * 📝 Fixture hermétique d'article : upsert complet au contenu maîtrisé.
   * Le contenu peut embarquer un marqueur de paywall (`<!--members-only-->`)
   * pour vérifier la coupure zéro-fuite de bout en bout.
   */
  async ensureArticle(opts: {
    id: string;
    publicationId: string;
    authorId: string;
    title: string;
    slug: string;
    content: string;
    published?: boolean;
    isPremium?: boolean;
    visibility?: 'PUBLIC' | 'MEMBERS_ONLY' | 'PAID_SUBSCRIBERS' | 'TIER_SPECIFIC';
    readingTime?: number;
    status?: string;
  }): Promise<string> {
    await this.query(
      `INSERT INTO "Article"
         (id, title, slug, content, published, "isPremium", visibility, "readingTime",
          status, "publicationId", "authorId", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7::"ContentVisibility", $8, $9, $10, $11::uuid, now(), now())
       ON CONFLICT (id) DO UPDATE SET
         title = $2, slug = $3, content = $4, published = $5, "isPremium" = $6,
         visibility = $7::"ContentVisibility", "readingTime" = $8, status = $9,
         "publicationId" = $10, "authorId" = $11::uuid, "updatedAt" = now()`,
      [
        opts.id,
        opts.title,
        opts.slug,
        opts.content,
        opts.published ?? true,
        opts.isPremium ?? false,
        opts.visibility ?? (opts.isPremium ? 'PAID_SUBSCRIBERS' : 'PUBLIC'),
        opts.readingTime ?? 3,
        opts.status ?? (opts.published === false ? 'DRAFT' : 'PUBLISHED'),
        opts.publicationId,
        opts.authorId,
      ]
    );
    return opts.id;
  }

  /** 🧹 Retire une fixture d'article (les FK en cascade nettoient le reste). */
  async deleteArticle(id: string): Promise<void> {
    await this.query(`DELETE FROM "Article" WHERE id = $1`, [id]);
  }

  /** 🧹 Retire une fixture de publication (cascade sur ses dépendances). */
  async deletePublication(id: string): Promise<void> {
    await this.query(`DELETE FROM "Publication" WHERE id = $1`, [id]);
  }

  /** Retourne l'id d'un article seedé par slug. */
  async articleIdBySlug(slug: string): Promise<string | null> {
    const rows = await this.query<{ id: string }>(
      `SELECT id FROM "Article" WHERE slug = $1 LIMIT 1`,
      [slug]
    );
    return rows[0]?.id ?? null;
  }

  /**
   * 📰 Titres réellement publiés, lus en base plutôt que codés en dur
   * (le classement du feed dépend du moteur de recommandation).
   */
  async publishedTitles(): Promise<{ title: string; isPremium: boolean }[]> {
    const rows = await this.query<{ title: string; isPremium: boolean }>(
      `SELECT title, "isPremium" AS "isPremium" FROM "Article" WHERE published = true ORDER BY "createdAt" DESC`
    );
    return rows;
  }
}
