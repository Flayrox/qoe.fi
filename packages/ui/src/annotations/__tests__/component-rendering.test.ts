// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";

export interface AnnotationActionCallbacks {
  onHighlightCreate?: (data: { articleId: string; text: string; note?: string; isPublic: boolean }) => Promise<any>;
  onUpvote?: (highlightId: string) => Promise<any>;
  onComment?: (data: { highlightId: string; content: string }) => Promise<any>;
  onTogglePrivacy?: (data: { highlightId: string; isPublic: boolean }) => Promise<any>;
  onDelete?: (highlightId: string) => Promise<any>;
  onUpdateNote?: (data: { highlightId: string; note: string | null }) => Promise<any>;
  onCrosspost?: (data: { articleId: string; text: string; commentary?: string }) => Promise<any>;
}

describe("Tier 1: Component Rendering & Action Callback Contract", () => {
  it("should trigger onHighlightCreate callback when creating an annotation", async () => {
    const onHighlightCreate = vi.fn().mockResolvedValue({ ok: true, data: { id: "hl-new" } });
    const callbacks: AnnotationActionCallbacks = { onHighlightCreate };

    const payload = { articleId: "art-1", text: "Target passage", note: "Author reflection", isPublic: true };
    const res = await callbacks.onHighlightCreate!(payload);

    expect(onHighlightCreate).toHaveBeenCalledWith(payload);
    expect(res).toEqual({ ok: true, data: { id: "hl-new" } });
  });

  it("should trigger onUpvote callback when toggling like on an annotation", async () => {
    const onUpvote = vi.fn().mockResolvedValue({ ok: true, data: { upvotesCount: 4, hasUpvoted: true } });
    const callbacks: AnnotationActionCallbacks = { onUpvote };

    const res = await callbacks.onUpvote!("hl-100");

    expect(onUpvote).toHaveBeenCalledWith("hl-100");
    expect(res.data.upvotesCount).toBe(4);
  });

  it("should trigger onComment callback when commenting in thread", async () => {
    const onComment = vi.fn().mockResolvedValue({
      ok: true,
      data: { id: "cmt-1", content: "Great point!", createdAt: new Date().toISOString() },
    });
    const callbacks: AnnotationActionCallbacks = { onComment };

    const res = await callbacks.onComment!({ highlightId: "hl-100", content: "Great point!" });

    expect(onComment).toHaveBeenCalledWith({ highlightId: "hl-100", content: "Great point!" });
    expect(res.data.content).toBe("Great point!");
  });

  it("should trigger onTogglePrivacy callback when toggling public/private mode", async () => {
    const onTogglePrivacy = vi.fn().mockResolvedValue({ ok: true, data: { isPublic: false } });
    const callbacks: AnnotationActionCallbacks = { onTogglePrivacy };

    const res = await callbacks.onTogglePrivacy!({ highlightId: "hl-100", isPublic: false });

    expect(onTogglePrivacy).toHaveBeenCalledWith({ highlightId: "hl-100", isPublic: false });
    expect(res.data.isPublic).toBe(false);
  });

  it("should trigger onDelete callback when deleting an annotation", async () => {
    const onDelete = vi.fn().mockResolvedValue({ ok: true });
    const callbacks: AnnotationActionCallbacks = { onDelete };

    const res = await callbacks.onDelete!("hl-100");

    expect(onDelete).toHaveBeenCalledWith("hl-100");
    expect(res.ok).toBe(true);
  });

  it("should trigger onCrosspost callback when quoting passage to feed", async () => {
    const onCrosspost = vi.fn().mockResolvedValue({ ok: true });
    const callbacks: AnnotationActionCallbacks = { onCrosspost };

    const payload = { articleId: "art-1", text: "Important excerpt", commentary: "Check this out!" };
    const res = await callbacks.onCrosspost!(payload);

    expect(onCrosspost).toHaveBeenCalledWith(payload);
    expect(res.ok).toBe(true);
  });
});
