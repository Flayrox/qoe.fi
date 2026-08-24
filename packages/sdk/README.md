# `@qoe/sdk`

**Role:** Houses all API communication logic, TanStack Query keys, portable hooks, and UI Optimistic update engines to ensure consistency across the mono-repo.

## File Exhaustive Listing

- `package.json`
- `tsconfig.json`
- `src/index.ts`
- `src/types.ts`
- `src/query-keys.ts`
- `src/actions/admin/index.ts`
- `src/actions/articles/index.ts`
- `src/actions/auth/index.ts`
- `src/actions/dashboard/index.ts`
- `src/actions/feed/index.ts`
- `src/actions/tenant/index.ts`
- `src/actions/utils/safe-action.ts`
- `src/hooks/useAutoSaveArticle.ts`
- `src/hooks/useInfiniteFeed.ts`
- `src/hooks/useOptimisticBookmark.ts`
- `src/hooks/useOptimisticFollow.ts`
- `src/hooks/useOptimisticLike.ts`
- `src/hooks/useOptimisticRepost.ts`
- `src/hooks/useRecommendations.ts`
- `src/hooks/useSubscriptionCheckout.ts`
- `src/hooks/useSubscriptionStatus.ts`
- `src/utils/authError.ts`

## Key Function Signatures

```typescript
// useOptimisticLike.ts
export function useOptimisticLike(options?: UseOptimisticLikeOptions): UseMutationResult;

// safe-action.ts
export const actionClient: SafeActionClient;
export const authActionClient: SafeActionClient;
```
