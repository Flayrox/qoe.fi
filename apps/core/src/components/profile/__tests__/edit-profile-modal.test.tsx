// @vitest-environment jsdom
// =====================================================================
// 🧪 Formulaire d'édition de profil — étiquettes et fraîcheur des valeurs
// =====================================================================
// Deux garanties : chaque champ porte une étiquette associée (l'écran n'a que
// des `<label>` sans `htmlFor`, donc aucun champ n'a de nom accessible), et le
// formulaire repart des valeurs du profil affiché quand on en change.
// =====================================================================

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const { mockUpdateProfile } = vi.hoisted(() => ({ mockUpdateProfile: vi.fn() }));

vi.mock('@qoe/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@qoe/sdk/actions/feed', () => ({ updateProfileAction: mockUpdateProfile }));
vi.mock('../profile-edit-actions', () => ({
  resolveMediaIdByPublisher: vi.fn(async () => null),
  updateMediaProfileAction: vi.fn(async () => ({ success: true })),
}));
vi.mock('@qoe/supabase/storage', () => ({
  uploadImageToRoute: vi.fn(),
  IMAGE_FOLDERS: { banners: 'banners', avatars: 'avatars' },
}));
vi.mock('@qoe/ui/ui/ImageUploader', () => ({
  ImageUploader: ({ label }: { label: string }) => <div data-uploader={label} />,
}));
vi.mock('@lingui/core/macro', () => ({
  t: (strings: TemplateStringsArray | string, ...values: unknown[]) =>
    Array.isArray(strings)
      ? strings.reduce((res, str, i) => res + str + (values[i] ?? ''), '')
      : String(strings),
}));
vi.mock('@qoe/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));
vi.mock('@qoe/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}));
vi.mock('@qoe/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

import { EditProfileModal } from '../EditProfileModal';

type ModalUser = React.ComponentProps<typeof EditProfileModal>['user'];

function makeUser(overrides: Partial<ModalUser> = {}): ModalUser {
  return {
    id: 'user-1',
    type: 'PERSONAL',
    name: 'Camille',
    username: 'camille',
    logoUrl: null,
    headerImageUrl: null,
    heroText: 'Bio de Camille',
    onboardingText: 'Paris',
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('EditProfileModal — étiquettes', () => {
  it('associe chaque champ à son étiquette', () => {
    render(<EditProfileModal isOpen onClose={vi.fn()} user={makeUser()} />);

    // Champs du profil personnel : aucun n'a de nom accessible aujourd'hui.
    expect(screen.getByLabelText('Nom complet')).toBeTruthy();
    expect(screen.getByLabelText('Pronoms (optionnel)')).toBeTruthy();
    expect(screen.getByLabelText('Bio / Présentation')).toBeTruthy();
    expect(screen.getByLabelText('Localisation / Ville')).toBeTruthy();
    expect(screen.getByLabelText('Site web personnel / Portfolio')).toBeTruthy();
  });
});

describe('EditProfileModal — valeurs du profil affiché', () => {
  it('repart des valeurs du nouveau profil quand la cible change', () => {
    const { rerender } = render(<EditProfileModal isOpen onClose={vi.fn()} user={makeUser()} />);

    expect((screen.getByDisplayValue('Camille') as HTMLInputElement).value).toBe('Camille');

    rerender(
      <EditProfileModal
        isOpen
        onClose={vi.fn()}
        user={makeUser({ id: 'user-2', name: 'Bob', username: 'bob', heroText: 'Bio de Bob' })}
      />
    );

    // Sans resynchronisation, le formulaire renvoie encore « Camille » et sa
    // bio sur le profil de Bob.
    expect((screen.getByDisplayValue('Bob') as HTMLInputElement).value).toBe('Bob');
    expect((screen.getByDisplayValue('Bio de Bob') as HTMLTextAreaElement).value).toBe(
      'Bio de Bob'
    );
  });
});
