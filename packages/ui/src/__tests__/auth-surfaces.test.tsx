import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
// Le formulaire bento est un écran entier (fetch de configuration, OAuth…) :
// on teste ici la boîte de dialogue qui le porte, pas son contenu.
vi.mock('../LoginFormBento', () => ({
  LoginFormBento: () => <div>formulaire de connexion</div>,
}));

import { GuestFloatingBar } from '../GuestFloatingBar';
import { LoginModal } from '../LoginModal';

describe('LoginModal', () => {
  it('expose une vraie boîte de dialogue nommée', () => {
    render(<LoginModal isOpen onClose={() => {}} />);

    // Sans `role="dialog"` + nom accessible, un lecteur d'écran poursuit sa
    // lecture dans la page derrière la modale.
    const dialog = screen.getByRole('dialog', { name: /se connecter/i });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('se ferme avec Échap et rend la main à l’appelant', () => {
    const onClose = vi.fn();
    render(<LoginModal isOpen onClose={onClose} />);

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });

  it('offre un bouton de fermeture nommé', () => {
    render(<LoginModal isOpen onClose={() => {}} />);

    expect(screen.getByRole('button', { name: 'Fermer' })).toBeTruthy();
  });

  it('ne rend rien quand elle est fermée', () => {
    render(<LoginModal isOpen={false} onClose={() => {}} />);

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('GuestFloatingBar', () => {
  it('nomme le bouton-icône et remonte le contexte d’action', () => {
    const onOpenAuth = vi.fn();
    render(<GuestFloatingBar onOpenAuth={onOpenAuth} />);

    const bookmark = screen.getByRole('button', { name: /enregistrer dans le sanctuaire/i });
    fireEvent.click(bookmark);

    expect(onOpenAuth).toHaveBeenCalledWith({ mode: 'signup', actionContext: 'bookmark' });
  });

  it('expose les deux actions comme des boutons nommés', () => {
    render(<GuestFloatingBar onOpenAuth={() => {}} />);

    expect(screen.getByRole('button', { name: /rejoindre qoefi/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /connexion/i })).toBeTruthy();
    expect(screen.getByRole('group', { name: /rejoindre qoefi/i })).toBeTruthy();
  });
});
