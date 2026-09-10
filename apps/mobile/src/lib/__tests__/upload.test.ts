import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: {
    supabaseUrl: 'https://test-project.supabase.co',
    supabaseAnonKey: 'anon-key-123',
  },
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
}));

vi.mock('@/lib/env', () => ({
  env: mocks.env,
}));

vi.mock('@/lib/supabase', () => ({
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
  });
});
