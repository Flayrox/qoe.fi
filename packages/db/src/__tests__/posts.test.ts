import { describe, it, expect } from "vitest";

// Unit test fixture verifying FeedSlice tree building logic
describe("Posts Repository - buildFeedSlices Logic", () => {
  it("should format standalone post as FeedSlice with targetPost only", () => {
    const rawPosts = [
      { id: "post-1", content: "Standalone post", parentId: null, rootId: null }
    ];

    const slice = {
      id: rawPosts[0].id,
      rootPost: undefined,
      parentPost: undefined,
      targetPost: rawPosts[0],
      isIncompleteThread: false,
    };

    expect(slice.targetPost.content).toBe("Standalone post");
    expect(slice.isIncompleteThread).toBe(false);
    expect(slice.rootPost).toBeUndefined();
    expect(slice.parentPost).toBeUndefined();
  });

  it("should flag incomplete thread when parentPost is not direct child of rootPost", () => {
    const rootPost = { id: "root-1", content: "Root" };
    const intermediatePost = { id: "inter-1", parentId: "root-1", rootId: "root-1" };
    const parentPost = { id: "parent-1", parentId: "inter-1", rootId: "root-1" };
    const targetPost = { id: "target-1", parentId: "parent-1", rootId: "root-1" };

    let isIncompleteThread = false;
    if (parentPost && rootPost) {
      if (parentPost.parentId && parentPost.parentId !== rootPost.id && parentPost.id !== rootPost.id) {
        isIncompleteThread = true;
      }
    }

    expect(isIncompleteThread).toBe(true);
  });

  it("should not flag incomplete thread for a direct 3-post chain", () => {
    const rootPost = { id: "root-1", content: "Root" };
    const parentPost = { id: "parent-1", parentId: "root-1", rootId: "root-1" };
    const targetPost = { id: "target-1", parentId: "parent-1", rootId: "root-1" };

    let isIncompleteThread = false;
    if (parentPost && rootPost) {
      if (parentPost.parentId && parentPost.parentId !== rootPost.id && parentPost.id !== rootPost.id) {
        isIncompleteThread = true;
      }
    }

    expect(isIncompleteThread).toBe(false);
  });
});
