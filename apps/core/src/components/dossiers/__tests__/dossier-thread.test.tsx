// @vitest-environment jsdom
// =====================================================================
// L20c7 — DossierThread : garanties écrites AVANT correctif
// =====================================================================
// Le fil de dossier est partagé par /recours et /support. Deux défauts
// prouvables :
//   1. le bouton d'envoi ne rend qu'une icône `Send`, sans texte ni
//      `aria-label` : au lecteur d'écran, c'est un bouton « bouton » sans
//      nom — impossible de savoir qu'il envoie le message ;
//   2. le composant n'importe pas `t` : « Vous », « Staff » et le
//      placeholder par défaut restent en français dur dans l'UI anglaise.
// =====================================================================

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const { tCalls } = vi.hoisted(() => ({ tCalls: [] as string[] }));

vi.mock('@lingui/core/macro', () => ({
  t: (strings: TemplateStringsArray | string, ...values: unknown[]) => {
    const message = Array.isArray(strings)
      ? strings.reduce((res, str, i) => res + str + (values[i] ?? ''), '')
      : String(strings);
    tCalls.push(message);
    return `[${message}]`;
  },
}));

import { DossierThread } from '../DossierThread';

afterEach(() => {
  cleanup();
  tCalls.length = 0;
});

const SOURCE = readFileSync(
  resolve(process.cwd(), 'src/components/dossiers/DossierThread.tsx'),
  'utf-8'
);

const baseProps = {
  viewerId: 'me',
  canWrite: true,
  closedHint: 'Dossier clos.',
  sending: false,
  onSend: async () => true,
};

describe('DossierThread — nom accessible du bouton d’envoi', () => {
  it('nomme le bouton d’envoi pour les technologies d’assistance', () => {
    render(<DossierThread {...baseProps} messages={[]} />);

    const button = screen.getByRole('button', { name: /Envoyer/ });
    expect(button).toBeTruthy();
  });
});

describe('DossierThread — i18n', () => {
  it('passe « Vous », « Staff » et le placeholder par `t`', () => {
    render(
      <DossierThread
        {...baseProps}
        messages={[
          { id: 'm1', authorId: 'me', body: 'Bonjour', createdAt: '2026-01-01T10:00:00.000Z' },
          { id: 'm2', authorId: 'staff', body: 'Bien reçu', createdAt: '2026-01-01T10:05:00.000Z' },
        ]}
      />
    );

    expect(tCalls).toContain('Vous');
    expect(tCalls).toContain('Staff');
    expect(tCalls).toContain('Écrire au dossier…');
  });

  it('garde de source : aucun libellé français en dur, `t` importé', () => {
    expect(SOURCE).toContain("from '@lingui/core/macro'");
    // Aucun de ces libellés ne doit apparaître hors d'un appel `t`.
    for (const label of ['Vous', 'Staff', 'Écrire au dossier…']) {
      const hardcoded = new RegExp(`(placeholder=|\\(|>\\s*)['"\`]${label}['"\`]`);
      expect(SOURCE).not.toMatch(hardcoded);
      expect(SOURCE).toMatch(new RegExp(`t\`${label}\``));
    }
    expect(SOURCE).toContain('aria-label={t`Envoyer`}');
  });
});

describe('DossierThread — contrat d’envoi', () => {
  it('vide le champ seulement quand l’envoi a réussi', async () => {
    const onSend = vi.fn().mockResolvedValue(false);
    render(<DossierThread {...baseProps} messages={[]} onSend={onSend} />);

    const input = screen.getByPlaceholderText('[Écrire au dossier…]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '  Coucou  ' } });
    fireEvent.click(screen.getByRole('button', { name: /Envoyer/ }));

    expect(onSend).toHaveBeenCalledWith('Coucou');
    await Promise.resolve();
    expect(input.value).toBe('  Coucou  ');
  });
});
