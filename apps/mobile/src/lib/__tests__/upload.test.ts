import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: {
    supabaseUrl: 'https://test-project.supabase.co',
    supabaseAnonKey: 'anon-key-123',
  },
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
}));

vi.mock('../env', () => ({
  env: mocks.env,
}));

vi.mock('../supabase', () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        upload: mocks.upload,
        getPublicUrl: mocks.getPublicUrl,
      })),
    },
  },
}));

import {
  toPublicImageUrl,
  extFromMime,
  sanitizePathSegment,
  uploadProfileImage,
  MAX_UPLOAD_BYTES,
  IMAGES_CDN,
} from '../upload';

describe('mobile upload & CDN utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.supabaseUrl = 'https://test-project.supabase.co';
  });

  describe('toPublicImageUrl', () => {
    it('rewrites supabase storage URL to CDN URL', () => {
      const input =
        'https://test-project.supabase.co/storage/v1/object/public/articles-media/avatars/u1/pic.jpg';
      const output = toPublicImageUrl(input);

      expect(output).toBe(
        `${IMAGES_CDN}/storage/v1/object/public/articles-media/avatars/u1/pic.jpg`
      );
    });

    it('returns original URL if not pointing to supabaseUrl', () => {
      const input = 'https://external-cdn.com/images/avatar.png';
      expect(toPublicImageUrl(input)).toBe(input);
    });

    it('returns original URL if supabaseUrl is empty', () => {
      mocks.env.supabaseUrl = '';
      const input = 'https://test-project.supabase.co/storage/v1/object/public/pic.jpg';
      expect(toPublicImageUrl(input)).toBe(input);
    });

    it('tolerates trailing slash in supabaseUrl', () => {
      mocks.env.supabaseUrl = 'https://test-project.supabase.co/';
      const input =
        'https://test-project.supabase.co/storage/v1/object/public/articles-media/a.webp';
      expect(toPublicImageUrl(input)).toBe(
        `${IMAGES_CDN}/storage/v1/object/public/articles-media/a.webp`
      );
    });
  });

  describe('extFromMime', () => {
    it('normalizes image/jpeg to jpg', () => {
      expect(extFromMime('image/jpeg')).toBe('jpg');
    });

    it('extracts common image extensions', () => {
      expect(extFromMime('image/png')).toBe('png');
      expect(extFromMime('image/webp')).toBe('webp');
      expect(extFromMime('image/gif')).toBe('gif');
    });

    it('falls back to jpg for null, undefined or empty string', () => {
      expect(extFromMime(null)).toBe('jpg');
      expect(extFromMime(undefined)).toBe('jpg');
      expect(extFromMime('')).toBe('jpg');
    });

    it('falls back to jpg for composed or non-image MIME types', () => {
      expect(extFromMime('image/svg+xml')).toBe('jpg');
      expect(extFromMime('application/octet-stream')).toBe('jpg');
      expect(extFromMime('text/html')).toBe('jpg');
    });
  });

  describe('sanitizePathSegment', () => {
    it('keeps healthy segments', () => {
      expect(sanitizePathSegment('usr_123')).toBe('usr_123');
    });

    it('neutralizes traversal', () => {
      const clean = sanitizePathSegment('../../etc');
      expect(clean).not.toContain('/');
      expect(clean).not.toContain('..');
      expect(sanitizePathSegment('')).toBe('shared');
    });
  });

  describe('uploadProfileImage', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      // Mock global fetch for local image URI
      globalThis.fetch = vi.fn().mockResolvedValue({
        blob: vi.fn().mockResolvedValue(new Blob(['fake-image-content'], { type: 'image/png' })),
      } as unknown as Response);
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('throws error when declared fileSize exceeds MAX_UPLOAD_BYTES', async () => {
      const tooLargeImage = {
        uri: 'file:///local/photo.jpg',
        fileSize: MAX_UPLOAD_BYTES + 1,
      };

      await expect(uploadProfileImage(tooLargeImage, 'avatars', 'usr_123')).rejects.toThrow(
        'Image trop volumineuse. Taille maximale : 12 Mo.'
      );
    });

    it('throws error when fetched blob exceeds MAX_UPLOAD_BYTES', async () => {
      const largeBlob = {
        size: MAX_UPLOAD_BYTES + 500,
        type: 'image/jpeg',
      };
      globalThis.fetch = vi.fn().mockResolvedValue({
        blob: vi.fn().mockResolvedValue(largeBlob),
      } as unknown as Response);

      const pickedImage = {
        uri: 'file:///local/large.jpg',
        fileSize: null,
      };

      await expect(uploadProfileImage(pickedImage, 'banners', 'usr_123')).rejects.toThrow(
        'Image trop volumineuse. Taille maximale : 12 Mo.'
      );
    });

    it('uploads image successfully and returns CDN URL', async () => {
      mocks.upload.mockResolvedValue({ error: null });
      mocks.getPublicUrl.mockReturnValue({
        data: {
          publicUrl:
            'https://test-project.supabase.co/storage/v1/object/public/articles-media/avatars/usr_123/avatar.png',
        },
      });

      const pickedImage = {
        uri: 'file:///local/avatar.png',
        mimeType: 'image/png',
        fileSize: 1024 * 50,
      };

      const resultUrl = await uploadProfileImage(pickedImage, 'avatars', 'usr_123');

      expect(mocks.upload).toHaveBeenCalledWith(
        expect.stringMatching(/^avatars\/usr_123\/\d+-[a-z0-9]+\.png$/),
        expect.any(Blob),
        {
          contentType: 'image/png',
          cacheControl: '31536000',
          upsert: false,
        }
      );

      expect(resultUrl).toBe(
        `${IMAGES_CDN}/storage/v1/object/public/articles-media/avatars/usr_123/avatar.png`
      );
    });

    it('throws when storage upload fails', async () => {
      mocks.upload.mockResolvedValue({
        error: { message: 'Bucket quota exceeded' },
      });

      const pickedImage = {
        uri: 'file:///local/banner.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1024 * 100,
      };

      await expect(uploadProfileImage(pickedImage, 'banners', 'usr_456')).rejects.toThrow(
        "Échec de l'upload de l'image : Bucket quota exceeded"
      );
    });

    it('sanitizes hostile ownerId in storage path', async () => {
      mocks.upload.mockResolvedValue({ error: null });
      mocks.getPublicUrl.mockReturnValue({
        data: {
          publicUrl:
            'https://test-project.supabase.co/storage/v1/object/public/articles-media/avatars/x/pic.png',
        },
      });

      await uploadProfileImage(
        { uri: 'file:///local/a.png', mimeType: 'image/png', fileSize: 100 },
        'avatars',
        '../../evil'
      );

      expect(mocks.upload).toHaveBeenCalledWith(
        expect.stringMatching(/^avatars\/[^/]+\/\d+-[a-z0-9]+\.png$/),
        expect.any(Blob),
        expect.anything()
      );
      const usedPath: string = mocks.upload.mock.calls[0][0];
      expect(usedPath).not.toContain('..');
    });
  });
});
