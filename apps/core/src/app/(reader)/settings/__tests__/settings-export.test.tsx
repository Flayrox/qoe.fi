// @vitest-environment jsdom
// =====================================================================
// 🧪 Données — l'export ne révoque pas son blob avant le téléchargement
// =====================================================================
// Troisième occurrence du défaut corrigé en L20b2b31 (bibliothèque) et
// L20b2b32 (notes) : `link.click()` puis `URL.revokeObjectURL(url)` dans le
// même tick, et un lien jamais attaché au document — Firefox et Safari
// annulent alors le téléchargement.
// =====================================================================

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { mockExport } = vi.hoisted(() => ({ mockExport: vi.fn() }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/settings/data',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));
vi.mock('next-themes', () => ({ useTheme: () => ({ theme: 'light', setTheme: vi.fn() }) }));
vi.mock('@qoe/i18n', () => ({ useI18n: () => ({ getLanguage: () => 'fr' }) }));
vi.mock('@lingui/core/macro', () => ({
  t: (strings: TemplateStringsArray | string, ...values: unknown[]) =>
    Array.isArray(strings)
      ? strings.reduce((res, str, i) => res + str + (values[i] ?? ''), '')
      : String(strings),
}));
vi.mock('@/components/notifications/NotificationSettingsForm', () => ({
  NotificationSettingsForm: () => null,
}));
vi.mock('@/components/providers/ReadingPreferencesProvider', () => ({
  useReadingPreferences: () => ({ update: vi.fn() }),
}));
vi.mock('../SecuritySettings', () => ({ default: () => null }));
vi.mock('../actions', () => ({
  exportAccountDataAction: mockExport,
  cancelAccountDeletionAction: vi.fn(),
  changeEmailAction: vi.fn(),
  changePasswordAction: vi.fn(),
  changeUsernameAction: vi.fn(),
  logoutAccountAction: vi.fn(),
  requestAccountDeletionAction: vi.fn(),
  toggleMutedWordAction: vi.fn(),
  updateAccountSettingsAction: vi.fn(),
  getBlockedUsersAction: vi.fn(),
  getMutedUsersAction: vi.fn(),
  getFollowRequestsAction: vi.fn(),
  acceptFollowRequestAction: vi.fn(),
  rejectFollowRequestAction: vi.fn(),
  toggleBlockedUserAction: vi.fn(),
  toggleMutedUserAction: vi.fn(),
}));

import AccountSettingsPage from '../SettingsPageClient';

const initialData = {
  user: {
    id: 'u1',
    email: 'ada@example.org',
    name: 'Ada',
    username: 'ada',
    logoUrl: null,
    onboardingText: null,
    pronouns: null,
    role: 'user',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  settings: {
    id: 's1',
    userId: 'u1',
    profileVisibility: 'PUBLIC',
    allowMentions: true,
    allowCollaborationInvites: true,
    showSensitiveContent: false,
    likeVisibility: 'PUBLIC',
    autoplayMedia: true,
    reduceMotion: false,
    highContrast: false,
    fontScale: 100,
    defaultFeed: 'FOLLOWING',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  preferences: {},
  deletionRequest: null,
  mutedWords: [],
} as const;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('Réglages — export de données (L20b2b5)', () => {
  it("n'révoque pas l'URL du blob avant que le téléchargement démarre", async () => {
    const createObjectURL = vi.fn(() => 'blob:qoe-export');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
    mockExport.mockResolvedValue('{"user":{"id":"u1"}}');

    render(<AccountSettingsPage initialData={initialData as never} />);
    fireEvent.click(screen.getByText('Exporter mes données'));

    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });
});
