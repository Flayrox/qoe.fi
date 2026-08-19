# `apps/core`

**Role:** The global platform gateway (`qoe.fi`) integrating the reader feed, bookmarks library, identity management (SSO), and real-time interaction buffering.

## Core Mechanisms

- **Infinite Scrolling:** Leverages React Virtual for high-performance timeline windowing without CLS (Cumulative Layout Shift).
- **Zero Latency Engine:** Integrates `useRealtimeFeedBuffer` from Supabase subscriptions to display live counts and new posts without disrupting scroll position.

## Component Overview Highlights

- `VirtualizedFeedList.tsx`
- `FeedDashboard.tsx`
- `RealtimeFeedPill.tsx`
