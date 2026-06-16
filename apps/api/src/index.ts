// =====================================================================
// 🔌 API Server — apps/api (Hono)
// =====================================================================
// 📖 Hono est un framework web ultra-léger pour Node/Bun/Workers.
//    Plus rapide qu'Express, plus simple que Fastify, type-safe de base.
//
// 🎯 Endpoints prévus :
//    GET  /health          → health check
//    POST /webhooks/stripe → Stripe webhooks
//    POST /webhooks/supabase → Supabase auth webhooks
//    /trpc/*              → tRPC (type-safe API pour le front)
//    /v1/articles         → REST public API (futur)
// =====================================================================

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { verifyWebhook, handleWebhookEvent } from "@qoe/billing";

const app = new Hono();

// ─── Middleware globaux ──────────────────────────────────────
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:3010",
      "http://localhost:3001",
      "https://qoe.fi",
      "https://*.qoe.fi",
      "https://dashboard.qoe.fi",
      "https://admin.qoe.fi",
    ],
    credentials: true,
  })
);

// ─── Health check ────────────────────────────────────────────
app.get("/health", (c) =>
  c.json({
    status: "ok",
    service: "qoe-api",
    timestamp: new Date().toISOString(),
  })
);

// ─── Webhooks ───────────────────────────────────────────────
app.post("/webhooks/stripe", async (c) => {
  const signature = c.req.header("stripe-signature");
  if (!signature) {
    return c.text("Missing signature", 400);
  }

  try {
    const rawBody = await c.req.text();
    const event = await verifyWebhook(rawBody, signature);
    await handleWebhookEvent(event);
    return c.text("Webhook processed successfully", 200);
  } catch (err: any) {
    console.error(`❌ Webhook Error: ${err.message}`);
    return c.text(`Webhook Error: ${err.message}`, 400);
  }
});

app.post("/webhooks/supabase", (c) => c.text("ok", 200));

// ─── Routes principales (à implémenter) ──────────────────────
app.get("/v1/articles", (c) => c.json({ articles: [], message: "TODO Phase 4" }));
app.get("/v1/users/:username", (c) =>
  c.json({ user: null, message: "TODO Phase 4" })
);

// ─── Démarrage ───────────────────────────────────────────────
const port = Number(process.env.PORT) || 3002;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`🔌 API server running on http://localhost:${info.port}`);
});
