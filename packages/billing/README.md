# `@qoe/billing`

**Role:** Manages Stripe integrations, webhook asynchronous processing, subscription logic, and the critical server-side Paywall Content Truncation AST engine.

## File Exhaustive Listing

- `package.json`
- `tsconfig.json`
- `src/index.ts`
- `src/client.ts`
- `src/checkout.ts`
- `src/plans.ts`
- `src/webhooks.ts`
- `src/paywall/ast-truncation.ts`

## Key Function Signatures

```typescript
// ast-truncation.ts
export function truncateArticleContentForPaywall(
  contentHtml: string,
  options: TruncateOptions
): TruncatedArticleResult;

// webhooks.ts
export async function verifyWebhook(rawBody: string, signature: string): Promise<Stripe.Event>;
export async function handleWebhookEvent(event: Stripe.Event): Promise<void>;
```
