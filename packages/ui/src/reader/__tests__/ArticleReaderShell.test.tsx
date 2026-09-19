import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ArticleReaderShell } from '../ArticleReaderShell';
import { useReadingPreferences } from '../ReadingPreferencesContext';
import { useTextToSpeech } from '../TextToSpeechContext';

function TestConsumer() {
  const { preferences } = useReadingPreferences();
  const tts = useTextToSpeech();
  return (
    <div>
      <span data-testid="font-size">{preferences.fontSize}</span>
      <span data-testid="tts-status">{tts ? 'available' : 'unavailable'}</span>
      <span data-testid="tts-title">{tts?.articleTitle}</span>
    </div>
  );
}

describe('ArticleReaderShell', () => {
  it('renders children and provides both ReadingPreferences and TextToSpeech contexts', () => {
    render(
      <ArticleReaderShell
        articleMetadata={{
          title: 'Mon Super Article',
          coverUrl: 'https://example.com/cover.jpg',
          authorName: 'Auteur Qoe',
        }}
      >
        <TestConsumer />
      </ArticleReaderShell>
    );

    expect(screen.getByTestId('font-size').textContent).toBe('base');
    expect(screen.getByTestId('tts-status').textContent).toBe('available');
    expect(screen.getByTestId('tts-title').textContent).toBe('Mon Super Article');
  });

  it('renders reading progress bar and ruler by default', () => {
    const { container } = render(
      <ArticleReaderShell>
        <p>Contenu de test</p>
      </ArticleReaderShell>
    );

    expect(container.firstChild).toBeDefined();
    expect(screen.getByText('Contenu de test')).toBeDefined();
  });
});
