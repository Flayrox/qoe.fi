# `@qoe/db`

**Role:** The absolute Single Source of Truth for the qoe.fi Data Layer. It contains the Prisma schema, migrations, the generated Prisma Client, and strongly typed repository abstractions.

## File Exhaustive Listing

- `package.json`
- `tsconfig.json`
- `prisma.config.ts`
- `prisma/schema.prisma`
- `prisma/seed.ts`
- `prisma/migrations/migration_lock.toml`
- `src/index.ts`
- `src/client.ts`
- `src/devtools.ts`
- `src/types.ts`
- `src/repositories/articles.ts`
- `src/repositories/users.ts`
- `src/repositories/posts.ts`
- `src/repositories/bookmarks.ts`
- `src/repositories/follows.ts`
- `src/repositories/highlights.ts`
- `src/repositories/recommendations.ts`
- `src/repositories/subscriptions.ts`
- `src/repositories/wallet.ts`
- `src/repositories/articleComments.ts`

## Key Function Signatures

```typescript
// posts.ts
export async function toggleLike(postId: string, userId: string): Promise<{ liked: boolean }>;
export async function toggleRepost(
  postId: string,
  authorId: string
): Promise<{ reposted: boolean; canonicalId: string; post?: any }>;
export async function findThreadById(postId: string, currentUserId?: string | null): Promise<any>;
```
