// =====================================================================
// 🧪 MediaProfilePreviewEditor — ne pas écrire ce que la sauvegarde jette
// =====================================================================
// « Email rédactionnel » lisait l'adresse du compte et l'écrivait dans
// l'état local ; or l'enregistrement des réglages ne l'envoie jamais. La
// personne modifiait un champ, voyait « Paramètres enregistrés » et perdait
// sa saisie. Un champ que la sauvegarde ignore ne doit pas être éditable.
// =====================================================================

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@qoe/supabase/storage', () => ({
  uploadImageToRoute: vi.fn(async () => 'https://cdn.example/logo.png'),
  IMAGE_FOLDERS: { banners: 'banners', avatars: 'avatars' },
}));

vi.mock('@qoe/ui/ui/ImageEditorDialog', () => ({
  ImageEditorDialog: () => null,
}));

import { MediaProfilePreviewEditor } from '../MediaProfilePreviewEditor';
import type { CreatorProfile } from '../../types';

const mediaProfile: CreatorProfile = {
  id: 'media-1',
  email: 'equipe@qoefi.media',
  username: 'journal',
  name: 'Le Journal Éco',
  heroText: 'Économie, terrain',
  accentColor: '#EE4B2B',
  fontFamily: 'sans',
  themeMode: 'classic',
  layoutStyle: 'minimal',
  logoUrl: null,
  headerImageUrl: null,
  footerText: null,
  seoTitle: null,
  seoDescription: null,
  allowIndexing: true,
  supportUrl: null,
  subdomain: 'journal',
  customDomain: null,
  navigation: [],
  socialLinks: [],
  articles: [],
  categories: [],
  advancedSettingsMode: false,
  siteOptions: null,
  isMedia: true,
};

describe('MediaProfilePreviewEditor', () => {
  it('n’écrit pas dans l’état un email que l’enregistrement ne persiste pas', async () => {
    const user = userEvent.setup();
    const setCurrent = vi.fn();

    render(<MediaProfilePreviewEditor current={mediaProfile} setCurrent={setCurrent} />);

    await user.click(screen.getByRole('button', { name: /equipe@qoefi\.media/ }));

    const input = screen.queryByLabelText(/email rédactionnel/i);
    if (input) {
      await user.clear(input);
      await user.type(input, 'autre@qoefi.media{Enter}');
    }

    for (const [updater] of setCurrent.mock.calls as Array<
      [(prev: CreatorProfile) => CreatorProfile]
    >) {
      expect(typeof updater).toBe('function');
      expect(updater(mediaProfile).email).toBe(mediaProfile.email);
    }
  });

  it('annonce que l’adresse se change dans les réglages du compte', () => {
    render(<MediaProfilePreviewEditor current={mediaProfile} setCurrent={vi.fn()} />);

    const control = screen.getByRole('button', { name: /equipe@qoefi\.media/ });
    expect(control).toBeDisabled();
    expect(control.getAttribute('title')).toMatch(/compte/i);
  });
});
