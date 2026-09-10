import { describe, expect, it } from 'vitest';
import {
  articleTitleSchema,
  centsSchema,
  createReportSchema,
  createThoughtSchema,
  emailSchema,
  postContentSchema,
  replyToPostSchema,
  slugSchema,
  updateProfileSchema,
  usernameSchema,
  uuidSchema,
} from '../index';

describe('@qoe/schemas - common', () => {
  it('validates and normalizes emails', () => {
    expect(emailSchema.parse('  User@Example.COM ')).toBe('user@example.com');
    expect(() => emailSchema.parse('invalid-email')).toThrow();
  });

  it('validates slugs', () => {
    expect(slugSchema.parse('mon-super-article-2026')).toBe('mon-super-article-2026');
    expect(() => slugSchema.parse('invalid slug with spaces')).toThrow();
    expect(() => slugSchema.parse('Invalid_Slug!')).toThrow();
  });

  it('validates uuids', () => {
    const validUuid = '123e4567-e89b-12d3-a456-426614174000';
    expect(uuidSchema.parse(validUuid)).toBe(validUuid);
    expect(() => uuidSchema.parse('not-a-uuid')).toThrow();
  });

  it('validates usernames', () => {
    expect(usernameSchema.parse('alice_99')).toBe('alice_99');
    expect(usernameSchema.parse('bob-dev')).toBe('bob-dev');
    expect(() => usernameSchema.parse('ab')).toThrow(); // < 3 chars
    expect(() => usernameSchema.parse('a'.repeat(31))).toThrow(); // > 30 chars
    expect(() => usernameSchema.parse('user@invalid')).toThrow(); // invalid chars
  });

  it('validates cents amounts', () => {
    expect(centsSchema.parse(0)).toBe(0);
    expect(centsSchema.parse(4250)).toBe(4250);
    expect(() => centsSchema.parse(-10)).toThrow();
    expect(() => centsSchema.parse(10.5)).toThrow();
    expect(() => centsSchema.parse(2_000_000_00)).toThrow(); // > max
  });
});

describe('@qoe/schemas - thought', () => {
  it('validates postContentSchema', () => {
    expect(postContentSchema.parse('Hello')).toBe('Hello');
    expect(() => postContentSchema.parse('')).toThrow();
  });

  it('validates createThoughtSchema with text, image, repost or parent', () => {
    // With content
    const withText = createThoughtSchema.parse({
      content: 'Une pensée captivante',
    });
    expect(withText.content).toBe('Une pensée captivante');
    expect(withText.visibility).toBe('public');

    // With image only
    const withImage = createThoughtSchema.parse({
      content: '',
      imageUrl: 'https://cdn.qoe.fi/img.png',
    });
    expect(withImage.imageUrl).toBe('https://cdn.qoe.fi/img.png');

    // With repost only
    const withRepost = createThoughtSchema.parse({
      content: '',
      repostId: 'thought-123',
    });
    expect(withRepost.repostId).toBe('thought-123');

    // With parent only (reply)
    const withParent = createThoughtSchema.parse({
      content: '',
      parentId: 'thought-456',
    });
    expect(withParent.parentId).toBe('thought-456');

    // Empty without anything
    expect(() =>
      createThoughtSchema.parse({
        content: '   ',
        imageUrl: null,
      })
    ).toThrow();
  });

  it('validates replyToPostSchema', () => {
    const valid = replyToPostSchema.parse({
      postId: 'post-1',
      content: 'Bien dit !',
    });
    expect(valid.postId).toBe('post-1');
    expect(() => replyToPostSchema.parse({ postId: '', content: 'Hi' })).toThrow();
    expect(() => replyToPostSchema.parse({ postId: 'post-1', content: '  ' })).toThrow();
  });
});

describe('@qoe/schemas - profile', () => {
  it('validates updateProfileSchema', () => {
    const valid = updateProfileSchema.parse({
      name: 'Alice Wonder',
      username: 'alice_w',
      heroText: 'Journaliste & autrice',
      logoUrl: 'https://cdn.qoe.fi/avatar.jpg',
      headerImageUrl: 'https://cdn.qoe.fi/header.jpg',
    });
    expect(valid.name).toBe('Alice Wonder');
    expect(valid.username).toBe('alice_w');

    // Invalid username chars
    expect(() =>
      updateProfileSchema.parse({
        name: 'Alice',
        username: 'alice space',
      })
    ).toThrow();

    // Short name
    expect(() =>
      updateProfileSchema.parse({
        name: 'A',
        username: 'alice',
      })
    ).toThrow();
  });
});

describe('@qoe/schemas - moderation', () => {
  it('validates createReportSchema', () => {
    const valid = createReportSchema.parse({
      targetId: 'thought-1',
      reason: 'spam',
      details: 'Spam publicitaire répété',
    });
    expect(valid.targetId).toBe('thought-1');
    expect(valid.targetType).toBe('thought');
    expect(valid.reason).toBe('spam');

    expect(() => createReportSchema.parse({ targetId: '' })).toThrow();
  });
});

describe('@qoe/schemas - article', () => {
  it('validates articleTitleSchema', () => {
    expect(articleTitleSchema.parse('Mon premier article')).toBe('Mon premier article');
    expect(() => articleTitleSchema.parse('Ab')).toThrow();
    expect(() => articleTitleSchema.parse('A'.repeat(201))).toThrow();
  });
});
