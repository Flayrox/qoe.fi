// =====================================================================
// 🧪 FloatingAudioPlayer — contrôles du lecteur (pause, scrubber, vitesse)
// =====================================================================
// Le lecteur est le seul endroit où l'on peut reprendre une écoute en cours :
// une pause qui relance le paragraphe depuis son début est un vrai défaut
// (on perd sa place), et un chrono qui cumule les articles ment à l'écran.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
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

interface FakeUtterance {
  text: string;
  lang: string;
  rate: number;
  voice: unknown;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
}

let spoken: FakeUtterance[];
let speakMock: ReturnType<typeof vi.fn>;
let cancelMock: ReturnType<typeof vi.fn>;
let pauseMock: ReturnType<typeof vi.fn>;
let resumeMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  spoken = [];
  cancelMock = vi.fn();

  const speech = {
    paused: false,
    speak: vi.fn((utterance: FakeUtterance) => {
      spoken.push(utterance);
    }),
    cancel: cancelMock,
    pause: vi.fn(() => {
      speech.paused = true;
    }),
    resume: vi.fn(() => {
      speech.paused = false;
    }),
    getVoices: vi.fn(() => []),
  };
  speakMock = speech.speak;
  pauseMock = speech.pause;
  resumeMock = speech.resume;

  Object.defineProperty(window, 'speechSynthesis', { writable: true, value: speech });

  class MockUtterance implements FakeUtterance {
    text: string;
    lang = 'fr-FR';
    rate = 1;
    voice: unknown = null;
    onend: (() => void) | null = null;
    onerror: ((event: { error: string }) => void) | null = null;
    constructor(text: string) {
      this.text = text;
    }
  }
  // @ts-expect-error — mock minimal de l'API navigateur
  window.SpeechSynthesisUtterance = MockUtterance;

  document.body.innerHTML = `
    <div id="article-content">
      <p>Premier paragraphe de l'article pour le test de lecture.</p>
      <p>Deuxième paragraphe avec des explications supplémentaires.</p>
    </div>
  `;
});

afterEach(() => {
  vi.useRealTimers();
});

function renderPlayer() {
  return render(
    <ReadingPreferencesProvider>
      <TextToSpeechPlayer articleTitle="Test Article" />
    </ReadingPreferencesProvider>
  );
}

function startListening() {
  fireEvent.click(screen.getByRole('button', { name: /Écouter/i }));
}

describe('FloatingAudioPlayer', () => {
  it('n’affiche aucun lecteur tant que l’écoute n’a pas démarré', () => {
    renderPlayer();
    expect(screen.queryByLabelText('Lecteur audio')).toBeNull();
  });

  it('affiche le titre, le paragraphe courant et le temps restant', () => {
    renderPlayer();
    startListening();

    const player = screen.getByLabelText('Lecteur audio');
    expect(player).toBeDefined();
    expect(screen.getByText('Test Article')).toBeDefined();
    expect(screen.getByText(/Paragraphe 1 \/ 2/)).toBeDefined();
    expect(screen.getByText(/restant/)).toBeDefined();
  });

  it('met en pause sans jeter le paragraphe, puis reprend la même lecture', () => {
    renderPlayer();
    startListening();
    expect(spoken).toHaveLength(1);
    const cancelsBefore = cancelMock.mock.calls.length;

    fireEvent.click(screen.getByTitle('Mettre en pause'));
    expect(pauseMock).toHaveBeenCalledTimes(1);
    // Une pause ne doit pas annuler l'utterance : sinon « reprendre » relit
    // le paragraphe depuis son premier mot.
    expect(cancelMock.mock.calls.length).toBe(cancelsBefore);

    fireEvent.click(screen.getByTitle('Reprendre la lecture'));
    expect(resumeMock).toHaveBeenCalledTimes(1);
    expect(spoken).toHaveLength(1);
    expect(speakMock).toHaveBeenCalledTimes(1);
  });

  it('désactive « précédent » au premier paragraphe et « suivant » au dernier', () => {
    renderPlayer();
    startListening();

    expect((screen.getByTitle('Paragraphe précédent') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTitle('Paragraphe suivant'));

    expect(screen.getByText(/Paragraphe 2 \/ 2/)).toBeDefined();
    expect((screen.getByTitle('Paragraphe suivant') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTitle('Paragraphe précédent') as HTMLButtonElement).disabled).toBe(false);
  });

  it('avance et recule de 15 secondes d’un paragraphe', () => {
    renderPlayer();
    startListening();

    fireEvent.click(screen.getByTitle('Avancer de 15 secondes'));
    expect(screen.getByText(/Paragraphe 2 \/ 2/)).toBeDefined();

    fireEvent.click(screen.getByTitle('Reculer de 15 secondes'));
    expect(screen.getByText(/Paragraphe 1 \/ 2/)).toBeDefined();
    // Reculer depuis le premier paragraphe ne sort pas de l'article.
    expect(spoken).toHaveLength(3);
  });

  it('fait tourner la vitesse de lecture et la transmet à la synthèse', () => {
    renderPlayer();
    startListening();
    const speedButton = () => screen.getByTitle('Changer la vitesse de lecture');
    expect(speedButton().textContent).toContain('1x');

    fireEvent.click(speedButton());
    expect(speedButton().textContent).toContain('1.25x');

    // Relancer la lecture applique la nouvelle vitesse (1,25 → 1,5).
    fireEvent.click(speedButton());
    expect(speedButton().textContent).toContain('1.5x');
    expect(spoken[spoken.length - 1].rate).toBe(1.5);
  });

  it('saute au paragraphe correspondant quand on clique dans la barre de progression', () => {
    renderPlayer();
    startListening();

    const track = screen.getByTitle("Naviguer dans l'article");
    track.getBoundingClientRect = () =>
      ({ left: 0, width: 200, top: 0, height: 8, right: 200, bottom: 8 }) as DOMRect;
    fireEvent.click(track, { clientX: 200 });

    expect(screen.getByText(/Paragraphe 2 \/ 2/)).toBeDefined();
  });

  it('ferme le lecteur et annule la synthèse', () => {
    renderPlayer();
    startListening();

    fireEvent.click(screen.getByTitle('Fermer le lecteur'));

    expect(cancelMock).toHaveBeenCalled();
    expect(screen.queryByLabelText('Lecteur audio')).toBeNull();
    expect(screen.getByRole('button', { name: /Écouter/i })).toBeDefined();
  });

  it('repart de zéro à chaque nouvelle écoute (le chrono ne cumule pas)', () => {
    vi.useFakeTimers();
    renderPlayer();
    startListening();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByText('0:02')).toBeDefined();

    fireEvent.click(screen.getByTitle('Fermer le lecteur'));
    startListening();

    expect(screen.getByText('0:00')).toBeDefined();
  });
});
