// =====================================================================
// 🧑‍💻 Sentry client — apps/studio
// =====================================================================
// 📖 Initialise Sentry côté navigateur (replays inclus).
//    No-op silencieux si SENTRY_DSN n'est pas défini.
// =====================================================================

import { initSentryClient } from '@qoe/observability';

initSentryClient();
