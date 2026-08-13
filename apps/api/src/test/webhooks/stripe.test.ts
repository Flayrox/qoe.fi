// =====================================================================
// 🧪 Webhooks — /webhooks/stripe
// =====================================================================
// 📖 Le webhook Stripe vérifie la signature, déduplique par jobId BullMQ
//    et queue l'événement pour le worker asynchrone.
// =====================================================================

import { beforeEach, describe, expect, it } from 'vitest';
import type Stripe from 'stripe';
import { createTestApp, type TestContext } from '../helpers/test-app';

function stripeEvent(overrides: Partial<{ id: string; type: string }> = {}): Stripe.Event {
  return {
    id: 'evt_test_1',
    type: 'checkout.session.completed',
    object: 'event',
    api_version: '2025-02-24.acacia',
    created: 1700000000,
    livemode: false,
    pending_webhooks: 1,
    request: { id: 'req_1', idempotency_key: 'key' },
    data: { object: { id: 'cs_test_1' } },
    ...overrides,
  } as unknown as Stripe.Event;
}

describe('POST /webhooks/stripe', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestApp();
  });

  it('renvoie 400 sans en-tête stripe-signature', async () => {
    const res = await ctx.app.request('/webhooks/stripe', {
      method: 'POST',
      body: '{}',
    });
    expect(res.status).toBe(400);
    expect(await res.text()).toBe('Missing signature');
    expect(ctx.stripeQueueAdd).not.toHaveBeenCalled();
  });

  it("queue l'événement via BullMQ avec jobId de déduplication", async () => {
    ctx.verifyWebhook.mockResolvedValue(stripeEvent());

    const res = await ctx.app.request('/webhooks/stripe', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'stripe-signature': 't=1,v1=fake' },
    });

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('Webhook queued successfully');

    expect(ctx.verifyWebhook).toHaveBeenCalledWith('{}', 't=1,v1=fake');
    expect(ctx.stripeQueueAdd).toHaveBeenCalledWith(
      'checkout.session.completed',
      {
        eventId: 'evt_test_1',
        eventType: 'checkout.session.completed',
        data: { id: 'cs_test_1' },
      },
      { jobId: 'evt_test_1' }
    );
  });

  it('renvoie 400 et ne queue rien si la signature est invalide', async () => {
    ctx.verifyWebhook.mockRejectedValue(
      new Error('No signatures found matching the expected signature')
    );

    const res = await ctx.app.request('/webhooks/stripe', {
      method: 'POST',
      body: '{}',
      headers: { 'stripe-signature': 't=1,v1=bad' },
    });

    expect(res.status).toBe(400);
    expect(await res.text()).toBe(
      'Webhook Error: No signatures found matching the expected signature'
    );
    expect(ctx.stripeQueueAdd).not.toHaveBeenCalled();
  });

  it('gère un corps invalide sans crash (error → 400)', async () => {
    ctx.verifyWebhook.mockRejectedValue(new Error('Unexpected token in JSON'));

    const res = await ctx.app.request('/webhooks/stripe', {
      method: 'POST',
      body: 'not-json',
      headers: { 'stripe-signature': 't=1,v1=x' },
    });

    expect(res.status).toBe(400);
  });
});
