# 🚀 PHASE 2 HANDOFF & REMAINING TASKS DIRECTIVE — qoe.fi

> **Context**: This handoff document provides a 100% complete, self-contained technical specification of what has been accomplished in **Phase 2 (Central Reader Feed Engine)** and what remains to be finalized in the new agent conversation before triggering **Phase 3 (Dashboard / Studio Créateur)**.

---

## ✅ 1. WORK ACCOMPLISHED SO FAR IN PHASE 2

All foundational code, hooks, components, and tests for Phase 2 have been implemented and verified passing **18/18 workspace packages** with **0 TypeScript errors** and **9/9 Vitest unit tests**:

### Step 2.0 — Safety Net & CI Workflow

- Created `.github/workflows/ci.yml` running `pnpm install` -> `pnpm prisma:generate` -> `pnpm typecheck` -> `pnpm lint` -> `pnpm test` -> `pnpm build`.
- Configured Vitest test harness in `packages/api-client` and `vitest.config.ts`.

### Step 2.1 — Infinite Feed Data Layer (`@qoe/api-client` & `packages/db`)

- Standardized `ApiResponse<T>` envelope in `packages/db/src/types.ts` and `@qoe/api-client`.
- Enforced keyset cursor pagination (`createdAt` + `id` compound ordering) in `packages/db/src/repositories/posts.ts` and `apps/feed/src/app/(reader)/home/page.tsx`.
- Enforced soft-delete (`deletedAt: null`) and author moderation filters (`isShadowbanned: false`, `isSuspended: false`).
- Created portable `useInfiniteFeed` React Query hook (`staleTime: 2m`, `gcTime: 10m`).

### Step 2.2 — Virtualized Scroll Components

- Installed `@tanstack/react-virtual` in `@qoe/feed`.
- Created [`ThoughtCardSkeleton.tsx`](file:///d:/Files/DEV/Main/qoe.fi/apps/feed/src/components/social/ThoughtCardSkeleton.tsx) with exact dimension parity (zero CLS).
- Created [`VirtualizedFeedList.tsx`](file:///d:/Files/DEV/Main/qoe.fi/apps/feed/src/components/feed/VirtualizedFeedList.tsx) supporting dynamic element height measurement, bounded DOM node windowing, and infinite scroll fetching.

### Step 2.3 — Optimistic Mutation Engine

- Implemented portable optimistic hooks in `@qoe/api-client`:
  - [`useOptimisticLike.ts`](file:///d:/Files/DEV/Main/qoe.fi/packages/api-client/src/hooks/useOptimisticLike.ts)
  - [`useOptimisticRepost.ts`](file:///d:/Files/DEV/Main/qoe.fi/packages/api-client/src/hooks/useOptimisticRepost.ts)
  - [`useOptimisticBookmark.ts`](file:///d:/Files/DEV/Main/qoe.fi/packages/api-client/src/hooks/useOptimisticBookmark.ts)
  - [`useOptimisticFollow.ts`](file:///d:/Files/DEV/Main/qoe.fi/packages/api-client/src/hooks/useOptimisticFollow.ts)
- Created unit tests in `packages/api-client/src/hooks/__tests__/` (9 passing tests).

### Step 2.4 — Non-Intrusive Realtime Buffer

- Created [`useRealtimeFeedBuffer.ts`](file:///d:/Files/DEV/Main/qoe.fi/apps/feed/src/hooks/useRealtimeFeedBuffer.ts) listening to Supabase Realtime `Thought` table changes (appends new items to an unread buffer without displacing the visible scroll viewport).
- Created [`RealtimeFeedPill.tsx`](file:///d:/Files/DEV/Main/qoe.fi/apps/feed/src/components/feed/RealtimeFeedPill.tsx) (floating pill _"X nouvelles pensées ↑"_ with smooth scroll and flush trigger).

---

## ⏳ 2. REMAINING TASKS TO FINALIZE PHASE 2

The incoming agent session must execute the following final wiring, audit, and verification steps:

### Task A — Final Dashboard Wiring (`apps/feed`)

- Wire [`VirtualizedFeedList.tsx`](file:///d:/Files/DEV/Main/qoe.fi/apps/feed/src/components/feed/VirtualizedFeedList.tsx) and [`RealtimeFeedPill.tsx`](file:///d:/Files/DEV/Main/qoe.fi/apps/feed/src/components/feed/RealtimeFeedPill.tsx) directly inside [`FeedDashboard.tsx`](<file:///d:/Files/DEV/Main/qoe.fi/apps/feed/src/app/(reader)/home/FeedDashboard.tsx>).
- Connect optimistic action handlers (`useOptimisticLike`, `useOptimisticRepost`, `useOptimisticBookmark`, `useOptimisticFollow`) to `ThoughtCard` action buttons in `FeedDashboard`.

### Task B — Final Phase 2 Multi-Agent Quality Gate Audit

Deploy a fleet of specialized Auditor Sub-Agents:

1. **`Feed-Data-Layer-Inspector`**: Audits `posts.ts` and `home/page.tsx` for cursor pagination, `deletedAt: null`, and moderation filters.
2. **`Virtualization-Auditor`**: Audits `VirtualizedFeedList.tsx` and `ThoughtCardSkeleton.tsx` for zero CLS and bounded DOM windowing.
3. **`Optimistic-Coherence-Guardian`**: Audits multi-cache updating and rollback safety across all 4 optimistic hooks in `@qoe/api-client`.
4. **`Realtime-Buffer-Watcher`**: Audits `useRealtimeFeedBuffer.ts` channel subscription, unread buffer isolation, and unmount cleanup.

### Task C — Empirical Verification Commands

Execute real terminal verification commands:

- `pnpm test` (Verify all Vitest tests pass).
- `pnpm typecheck` (Verify 18/18 workspace packages pass with 0 errors).
- `pnpm lint` (Verify clean workspace linting).

---

## 📋 3. READY-TO-PASTE PROMPT FOR THE NEW CONVERSATION

Copy and paste the prompt below into your new conversation window:

```markdown
# 🚀 PHASE 2 FINALIZATION & QUALITY GATE DIRECTIVE (qoe.fi)

## 📌 CONTEXT & INSTRUCTIONS

Read `PHASE_2_HANDOFF.md` in the root directory. Phase 2 steps 2.0 through 2.4 have all foundational code implemented in `packages/db`, `@qoe/api-client`, and `apps/feed`.

You must execute the remaining Phase 2 finalization tasks strictly following `.agents/skills/masterclass-prompt-expansion/SKILL.md`:

1. **Wire Components in `FeedDashboard.tsx`**:
   - Integrate `VirtualizedFeedList` and `RealtimeFeedPill` into `apps/feed/src/app/(reader)/home/FeedDashboard.tsx`.
   - Wire optimistic hooks (`useOptimisticLike`, `useOptimisticRepost`, `useOptimisticBookmark`, `useOptimisticFollow`) to `ThoughtCard` actions.

2. **Deploy Phase 2 Final Sub-Agent Audit Fleet**:
   - Deploy 4 specialized auditor sub-agents (`Feed-Data-Layer-Inspector`, `Virtualization-Auditor`, `Optimistic-Coherence-Guardian`, `Realtime-Buffer-Watcher`).

3. **Run Verification Commands**:
   - Execute `pnpm test` and `pnpm typecheck` to confirm 100% clean compilation across all 18 monorepo packages.

4. **Submit Phase 2 Final Gate Report**:
   - Present the concise Gate report and request explicit authorization to begin Phase 3 (Dashboard / Studio Créateur).
```
