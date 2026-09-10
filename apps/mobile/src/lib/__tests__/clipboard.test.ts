import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Platform, Share } from 'react-native';
import { copyText } from '../clipboard';

vi.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
  },
  Share: {
    share: vi.fn(),
  },
}));

describe('mobile clipboard copyText', () => {
  const originalNavigatorDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

  beforeEach(() => {
    vi.clearAllMocks();
    Platform.OS = 'ios';
  });

  afterEach(() => {
    if (originalNavigatorDesc) {
      Object.defineProperty(globalThis, 'navigator', originalNavigatorDesc);
    }
  });

  it('delegates to Share.share on native platform and returns false', async () => {
    Platform.OS = 'ios';
    vi.mocked(Share.share).mockResolvedValueOnce({ action: 'sharedAction' });

    const result = await copyText('Hello from Qoe native');

    expect(Share.share).toHaveBeenCalledWith({ message: 'Hello from Qoe native' });
    expect(result).toBe(false);
  });

  it('handles user canceling share gracefully and returns false', async () => {
    Platform.OS = 'android';
    vi.mocked(Share.share).mockRejectedValueOnce(new Error('User cancelled'));

    const result = await copyText('Cancelled text');

    expect(Share.share).toHaveBeenCalledWith({ message: 'Cancelled text' });
    expect(result).toBe(false);
  });

  it('uses navigator.clipboard.writeText on web and returns true on success', async () => {
    Platform.OS = 'web';
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        clipboard: {
          writeText: writeTextMock,
        },
      },
      configurable: true,
      writable: true,
    });

    const result = await copyText('Web copied text');

    expect(writeTextMock).toHaveBeenCalledWith('Web copied text');
    expect(result).toBe(true);
    expect(Share.share).not.toHaveBeenCalled();
  });

  it('falls back to Share.share on web if clipboard.writeText fails', async () => {
    Platform.OS = 'web';
    const writeTextMock = vi.fn().mockRejectedValue(new Error('Permission denied'));
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        clipboard: {
          writeText: writeTextMock,
        },
      },
      configurable: true,
      writable: true,
    });

    vi.mocked(Share.share).mockResolvedValueOnce({ action: 'sharedAction' });

    const result = await copyText('Fallback text');

    expect(writeTextMock).toHaveBeenCalledWith('Fallback text');
    expect(Share.share).toHaveBeenCalledWith({ message: 'Fallback text' });
    expect(result).toBe(false);
  });
});
