# `@qoe/supabase`

**Role:** Provides isomorphic wrappers and clients for Supabase, managing Auth JWT tokens, Server-Side Rendering (SSR) cookie logic, and middleware integrations.

## File Exhaustive Listing
- `package.json`
- `tsconfig.json`
- `src/index.ts`
- `src/client.ts`
- `src/server.ts`
- `src/middleware.ts`
- `src/broadcast.ts`
- `src/cookie-config.ts`
- `src/sso.ts`

## Key Function Signatures
```typescript
// cookie-config.ts
export function getCookieDomain(hostname?: string): string | undefined;

// client.ts / server.ts / middleware.ts
export function createClient(): SupabaseClient; // Client-side
export function createServerClient(): Promise<SupabaseClient>; // Next.js App Router (Server)
export function createMiddlewareClient(request: NextRequest, response: NextResponse): SupabaseClient;
```
