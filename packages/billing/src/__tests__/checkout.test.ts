import { describe, it, expect, vi } from "vitest";
import { createSubscriptionCheckoutSession, createCustomerPortalSession } from "../checkout";
import { stripe } from "../client";

vi.mock("../client", () => ({
  stripe: {
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({
          id: "cs_test_123",
          url: "https://checkout.stripe.com/c/pay/cs_test_123",
        }),
      },
    },
    billingPortal: {
      sessions: {
        create: vi.fn().mockResolvedValue({
          id: "bps_test_456",
          url: "https://billing.stripe.com/p/session/bps_test_456",
        }),
      },
    },
  },
}));

describe("Stripe Checkout & Billing Portal Sessions", () => {
  it("creates a subscription checkout session with metadata", async () => {
    const session = await createSubscriptionCheckoutSession({
      creatorId: "user_creator_1",
      readerEmail: "reader@example.com",
      stripePriceId: "price_123",
      tierId: "tier_vip_1",
      successUrl: "https://climat.qoe.fi/success",
      cancelUrl: "https://climat.qoe.fi/cancel",
    });

    expect(session.id).toBe("cs_test_123");
    expect(session.url).toBe("https://checkout.stripe.com/c/pay/cs_test_123");
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        line_items: [{ price: "price_123", quantity: 1 }],
        metadata: {
          creatorId: "user_creator_1",
          subscriberEmail: "reader@example.com",
          tierId: "tier_vip_1",
        },
      })
    );
  });

  it("creates a billing portal session", async () => {
    const session = await createCustomerPortalSession({
      stripeCustomerId: "cus_123",
      returnUrl: "https://climat.qoe.fi/account",
    });

    expect(session.id).toBe("bps_test_456");
    expect(session.url).toBe("https://billing.stripe.com/p/session/bps_test_456");
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: "cus_123",
      return_url: "https://climat.qoe.fi/account",
    });
  });
});
