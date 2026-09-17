import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { TextToSpeechPlayer } from '../TextToSpeechPlayer';
import { ReadingPreferencesProvider } from '../ReadingPreferencesContext';

vi.mock('@lingui/core/macro', () => ({
  t: (strings: TemplateStringsArray | string, ...values: unknown[]) => {
    if (Array.isArray(strings)) {
      return strings.reduce(
        (res, str, i) => res + str + (values[i] !== undefined ? values[i] : ''),
        ''
      );
    }
    return String(strings || '');
  },
}));

describe('TextToSpeechPlayer', () => {
  let speakMock: ReturnType<typeof vi.fn>;
  let cancelMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    speakMock = vi.fn();
    cancelMock = vi.fn();

    // Mock window.speechSynthesis
    Object.defineProperty(window, 'speechSynthesis', {
      writable: true,
      value: {
        speak: speakMock,
        cancel: cancelMock,
        pause: vi.fn(),
        resume: vi.fn(),
        getVoices: vi.fn().mockReturnValue([]),
      },
    });

    // Mock SpeechSynthesisUtterance
    class MockSpeechSynthesisUtterance {
      text: string;
      lang: string = 'fr-FR';
      rate: number = 1.0;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    // @ts-expect-error - mock class
    window.SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;
  });

  const renderComponent = () => {
    // Setup dummy article content in document
    document.body.innerHTML = `
      <div id="article-content">
        <p>Premier paragraphe de l'article pour le test de lecture.</p>
        <p>Deuxième paragraphe avec des explications supplémentaires.</p>
      </div>
    `;

    return render(
      <ReadingPreferencesProvider>
        <TextToSpeechPlayer articleTitle="Test Article" />
      </ReadingPreferencesProvider>
    );
  };

  it('affiche le bouton déclencheur Écouter', () => {
    renderComponent();
    expect(screen.getByRole('button', { name: /Écouter/i })).toBeDefined();
  });

  it('démarre la lecture vocale et ouvre le lecteur au clic', async () => {
    renderComponent();
    const user = userEvent.setup();

    const listenBtn = screen.getByRole('button', { name: /Écouter/i });
    await user.click(listenBtn);

    expect(speakMock).toHaveBeenCalled();
    expect(screen.getByText('Test Article')).toBeDefined();
    expect(screen.getByText(/Paragraphe 1 \/ 2/i)).toBeDefined();
  });

  it('permet de fermer le lecteur audio flottant', async () => {
    renderComponent();
    const user = userEvent.setup();

    const listenBtn = screen.getByRole('button', { name: /Écouter/i });
    await user.click(listenBtn);

    const closeBtn = screen.getByTitle(/Fermer le lecteur/i);
    await user.click(closeBtn);

    expect(cancelMock).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Écouter/i })).toBeDefined();
  });
});
