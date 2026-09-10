import { describe, expect, it } from 'vitest';
import {
  buildThreadTree,
  countThreadDescendants,
  extractHashtags,
  extractMentions,
  extractUrls,
  findThreadAncestors,
  flattenThread,
  formatPollData,
  isNormalizedThought,
  normalizeAuthor,
  normalizeThought,
  resolveDisplay,
  segmentText,
} from '../index';

describe('@qoe/social - facets', () => {
  it('handles empty and plain text', () => {
    expect(segmentText('')).toEqual([]);
    expect(segmentText('Texte simple sans rien')).toEqual([
      { kind: 'text', value: 'Texte simple sans rien' },
    ]);
  });

  it('segments URLs, mentions and hashtags accurately', () => {
    const text = 'Hello @alice et @bob, regardez https://qoe.fi/test #super #tech!';
    const segments = segmentText(text);

    expect(segments).toEqual([
      { kind: 'text', value: 'Hello ' },
      { kind: 'mention', value: '@alice', handle: 'alice' },
      { kind: 'text', value: ' et ' },
      { kind: 'mention', value: '@bob', handle: 'bob' },
      { kind: 'text', value: ', regardez ' },
      { kind: 'link', value: 'https://qoe.fi/test', url: 'https://qoe.fi/test' },
      { kind: 'text', value: ' ' },
      { kind: 'tag', value: '#super', tag: 'super' },
      { kind: 'text', value: ' ' },
      { kind: 'tag', value: '#tech', tag: 'tech' },
      { kind: 'text', value: '!' },
    ]);
  });

  it('extracts unique lists of mentions, hashtags and urls', () => {
    const text = '@alice @bob @alice #news #ai #news https://qoe.fi https://qoe.fi';
    expect(extractMentions(text)).toEqual(['alice', 'bob']);
    expect(extractHashtags(text)).toEqual(['news', 'ai']);
    expect(extractUrls(text)).toEqual(['https://qoe.fi']);
  });

  it('handles overlapping tokens like URLs containing handles', () => {
    const text = 'Check out https://twitter.com/@alice for details';
    const segments = segmentText(text);
    expect(segments.some((s) => s.kind === 'link')).toBe(true);
  });
});

describe('@qoe/social - polls', () => {
  it('returns null for empty raw poll', () => {
    expect(formatPollData(null)).toBeNull();
    expect(formatPollData(undefined)).toBeNull();
  });

  it('calculates totals, percentages and user vote correctly', () => {
    const now = new Date('2026-08-15T12:00:00Z').getTime();
    const rawPoll = {
      id: 'poll-1',
      thoughtId: 'thought-1',
      expiresAt: '2026-08-16T12:00:00Z',
      options: [
        { id: 'opt-1', text: 'Option A', order: 1, _count: { votes: 3 } },
        { id: 'opt-2', text: 'Option B', order: 2, _count: { votes: 1 } },
      ],
      votes: [{ optionId: 'opt-1', userId: 'user-1' }],
    };

    const formatted = formatPollData(rawPoll, 'user-1', now);
    expect(formatted).not.toBeNull();
    expect(formatted?.totalVotes).toBe(4);
    expect(formatted?.isExpired).toBe(false);
    expect(formatted?.userVotedOptionId).toBe('opt-1');
    expect(formatted?.options[0]?.percentage).toBe(75);
    expect(formatted?.options[1]?.percentage).toBe(25);
  });

  it('flags expired poll when now is after expiresAt and handles empty options or missing votes', () => {
    const nowDate = new Date('2026-08-20T12:00:00Z');
    const rawPoll = {
      id: 'poll-2',
      thoughtId: 'thought-2',
      expiresAt: '2026-08-16T12:00:00Z',
    };

    const formatted = formatPollData(rawPoll, 'user-99', nowDate);
    expect(formatted?.isExpired).toBe(true);
    expect(formatted?.totalVotes).toBe(0);
    expect(formatted?.userVotedOptionId).toBeNull();
  });
});

describe('@qoe/social - threads', () => {
  interface TestPost {
    id: string;
    parentId?: string | null;
    content: string;
  }

  const posts: TestPost[] = [
    { id: '1', parentId: null, content: 'Root' },
    { id: '2', parentId: '1', content: 'Reply 1' },
    { id: '3', parentId: '2', content: 'Reply 1 -> Sub 1' },
    { id: '4', parentId: '1', content: 'Reply 2' },
  ];

  it('builds tree and computes depths accurately with and without rootId', () => {
    const tree = buildThreadTree(posts);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('1');
    expect(tree[0].depth).toBe(0);
    expect(tree[0].replies).toHaveLength(2);

    expect(tree[0].replies[0].id).toBe('2');
    expect(tree[0].replies[0].depth).toBe(1);
    expect(tree[0].replies[0].replies).toHaveLength(1);
    expect(tree[0].replies[0].replies[0].id).toBe('3');
    expect(tree[0].replies[0].replies[0].depth).toBe(2);

    expect(tree[0].replies[1].id).toBe('4');
    expect(tree[0].replies[1].depth).toBe(1);

    // With explicit rootId
    const repliesOnly = posts.filter((p) => p.parentId !== null);
    const subTree = buildThreadTree(repliesOnly, '1');
    expect(subTree).toHaveLength(2);
    expect(subTree[0].id).toBe('2');
  });

  it('handles empty input and orphan parents gracefully', () => {
    expect(buildThreadTree([])).toEqual([]);

    const orphanPosts: TestPost[] = [
      { id: 'orphan', parentId: 'unknown-parent', content: 'Orphan' },
    ];
    const tree = buildThreadTree(orphanPosts);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('orphan');
  });

  it('flattens tree in depth-first traversal order', () => {
    const tree = buildThreadTree(posts);
    const flat = flattenThread(tree);
    expect(flat.map((p) => p.id)).toEqual(['1', '2', '3', '4']);
  });

  it('finds ancestors chain for a child item with cycle protection', () => {
    const ancestors = findThreadAncestors(posts, '3');
    expect(ancestors.map((a) => a.id)).toEqual(['1', '2']);

    // Root post has no ancestors
    expect(findThreadAncestors(posts, '1')).toEqual([]);

    // Unknown post
    expect(findThreadAncestors(posts, '999')).toEqual([]);

    // Missing intermediate parent
    const brokenPosts: TestPost[] = [{ id: 'b', parentId: 'missing-parent', content: 'B' }];
    expect(findThreadAncestors(brokenPosts, 'b')).toEqual([]);

    // Cycle detection
    const cyclicPosts: TestPost[] = [
      { id: 'a', parentId: 'b', content: 'A' },
      { id: 'b', parentId: 'a', content: 'B' },
    ];
    const cycleAncestors = findThreadAncestors(cyclicPosts, 'a');
    expect(cycleAncestors).toBeDefined();
  });

  it('counts recursive descendants accurately', () => {
    const tree = buildThreadTree(posts);
    expect(countThreadDescendants(tree[0])).toBe(3);
    expect(countThreadDescendants(tree[0].replies[0])).toBe(1);
    expect(countThreadDescendants(tree[0].replies[1])).toBe(0);
    expect(countThreadDescendants({ replies: undefined })).toBe(0);
    expect(countThreadDescendants({ replies: ['non-object' as unknown as object] })).toBe(1);
  });
});

describe('@qoe/social - normalize', () => {
  it('normalizes authors with safe fallbacks', () => {
    const author = normalizeAuthor({
      id: 'author-1',
      name: 'Alice',
      username: 'alice',
      isCertified: true,
    });
    expect(author.id).toBe('author-1');
    expect(author.name).toBe('Alice');
    expect(author.username).toBe('alice');
    expect(author.isCertified).toBe(true);
    expect(author.isFollowing).toBe(false);
    expect(author.logoUrl).toBeNull();

    const empty = normalizeAuthor(null);
    expect(empty.id).toBe('');
    expect(empty.name).toBeNull();
  });

  it('normalizes thought from FeedPost with counts', () => {
    const rawPost = {
      id: 'post-1',
      content: 'Hello world',
      createdAt: new Date('2026-08-15T12:00:00Z'),
      author: { id: 'user-1', name: 'John' },
      _count: { likes: 5, replies: 2, reposts: 1 },
      liked: true,
      reposted: false,
      isPinned: true,
      isHiddenByAuthor: true,
      replyRestriction: 'followers',
      imageUrl: 'https://cdn.qoe.fi/img.png',
      quotedExcerpt: 'An excerpt',
      quotedArticle: { id: 'art-1' },
      tags: ['test'],
      attachments: [{ type: 'image' }],
    };

    const normalized = normalizeThought(rawPost);
    expect(normalized.id).toBe('post-1');
    expect(normalized.content).toBe('Hello world');
    expect(normalized.likeCount).toBe(5);
    expect(normalized.replyCount).toBe(2);
    expect(normalized.repostCount).toBe(1);
    expect(normalized.liked).toBe(true);
    expect(normalized.reposted).toBe(false);
    expect(normalized.isPinned).toBe(true);
    expect(normalized.isHiddenByAuthor).toBe(true);
    expect(normalized.replyRestriction).toBe('followers');
    expect(normalized.imageUrl).toBe('https://cdn.qoe.fi/img.png');
    expect(normalized.quotedExcerpt).toBe('An excerpt');
    expect(normalized.tags).toEqual(['test']);

    // Idempotency
    expect(isNormalizedThought(normalized)).toBe(true);
    expect(normalizeThought(normalized)).toBe(normalized);

    // Fallbacks
    expect(isNormalizedThought(null)).toBe(false);
    expect(isNormalizedThought('not an object')).toBe(false);
    const minimal = normalizeThought({});
    expect(minimal.id).toBe('');
    expect(minimal.content).toBe('');
    expect(minimal.likeCount).toBe(0);
    expect(minimal.replyRestriction).toBe('everyone');
  });

  it('resolves display for pure reposts and quote posts', () => {
    const original = normalizeThought({
      id: 'orig',
      content: 'Original post',
      author: { id: 'orig-author' },
    });

    // Pure repost (empty content)
    const pureRepost = normalizeThought({
      id: 'repost-1',
      content: '',
      repost: original,
    });
    const pureDisplay = resolveDisplay(pureRepost);
    expect(pureDisplay.isPureRepost).toBe(true);
    expect(pureDisplay.display.id).toBe('orig');
    expect(pureDisplay.quoted).toBeNull();

    // Quote post (content + repost)
    const quotePost = normalizeThought({
      id: 'quote-1',
      content: 'Regardez ceci !',
      repost: original,
    });
    const quoteDisplay = resolveDisplay(quotePost);
    expect(quoteDisplay.isPureRepost).toBe(false);
    expect(quoteDisplay.display.id).toBe('quote-1');
    expect(quoteDisplay.quoted?.id).toBe('orig');
  });
});
