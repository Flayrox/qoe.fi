import { describe, expect, it } from "vitest";
import { truncateArticleContentForPaywall } from "../paywall/ast-truncation";

describe("@qoe/billing - Paywall AST Truncation Engine", () => {
  const fullArticle = `
    <p>This is paragraph 1 of the public preview.</p>
    <p>This is paragraph 2 of the public preview.</p>
    <!-- paywall -->
    <p>THIS IS SECRET PREMIUM CONTENT THAT MUST NOT LEAK.</p>
    <p>Secret paragraph 4.</p>
  `;

  it("should return complete content if article is free or user is subscriber", () => {
    const freeRes = truncateArticleContentForPaywall(fullArticle, {
      isPremium: false,
      isSubscriber: false,
    });
    expect(freeRes.isTruncated).toBe(false);
    expect(freeRes.content).toContain("SECRET PREMIUM CONTENT");

    const subRes = truncateArticleContentForPaywall(fullArticle, {
      isPremium: true,
      isSubscriber: true,
    });
    expect(subRes.isTruncated).toBe(false);
    expect(subRes.content).toContain("SECRET PREMIUM CONTENT");
  });

  it("should truncate content physically at paywall divider for non-subscribers", () => {
    const nonSubRes = truncateArticleContentForPaywall(fullArticle, {
      isPremium: true,
      isSubscriber: false,
    });

    expect(nonSubRes.isTruncated).toBe(true);
    expect(nonSubRes.content).toContain("paragraph 1");
    expect(nonSubRes.content).toContain("paragraph 2");
    expect(nonSubRes.content).not.toContain("SECRET PREMIUM CONTENT");
  });

  it("should fallback to paragraph count if no explicit divider exists", () => {
    const noDividerArticle = `
      <p>Paragraph 1</p>
      <p>Paragraph 2</p>
      <p>Paragraph 3 premium</p>
    `;

    const res = truncateArticleContentForPaywall(noDividerArticle, {
      isPremium: true,
      isSubscriber: false,
      fallbackParagraphs: 2,
    });

    expect(res.isTruncated).toBe(true);
    expect(res.content).toContain("Paragraph 1");
    expect(res.content).toContain("Paragraph 2");
    expect(res.content).not.toContain("Paragraph 3 premium");
  });
});
