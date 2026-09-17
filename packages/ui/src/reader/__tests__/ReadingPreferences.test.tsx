import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import {
  ReadingPreferencesProvider,
  useReadingPreferences,
  getReaderTypographyClasses,
  getPaperThemeClasses,
} from '../ReadingPreferencesContext';
import { DEFAULT_READING_PREFERENCES } from '../types';

describe('ReadingPreferencesContext', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ReadingPreferencesProvider>{children}</ReadingPreferencesProvider>
  );

  it('fournit les préférences de lecture par défaut', () => {
    const { result } = renderHook(() => useReadingPreferences(), { wrapper });
    expect(result.current.preferences).toEqual(DEFAULT_READING_PREFERENCES);
  });

  it('met à jour les préférences de façon réactive', () => {
    const { result } = renderHook(() => useReadingPreferences(), { wrapper });

    act(() => {
      result.current.update({
        fontSize: '2xl',
        bionicReading: true,
        paperTheme: 'sepia',
        fontFamily: 'font-dyslexic',
      });
    });

    expect(result.current.preferences.fontSize).toBe('2xl');
    expect(result.current.preferences.bionicReading).toBe(true);
    expect(result.current.preferences.paperTheme).toBe('sepia');
    expect(result.current.preferences.fontFamily).toBe('font-dyslexic');
  });

  it('génère les classes CSS adaptées pour la typographie et le thème', () => {
    const classes = getReaderTypographyClasses({
      ...DEFAULT_READING_PREFERENCES,
      fontSize: 'xl',
      fontFamily: 'font-dyslexic',
      readingWidth: 'narrow',
      lineHeight: 'relaxed',
    });

    expect(classes).toContain('font-dyslexic');
    expect(classes).toContain('text-[20px]');
    expect(classes).toContain('leading-loose');
    expect(classes).toContain('max-w-[580px]');

    const sepiaClasses = getPaperThemeClasses('sepia');
    expect(sepiaClasses).toContain('bg-[#FBF0D9]');
    expect(sepiaClasses).toContain('text-[#3D2E1E]');

    const oledClasses = getPaperThemeClasses('oled');
    expect(oledClasses).toContain('bg-[#000000]');
    expect(oledClasses).toContain('text-[#FFFFFF]');
  });

  it('réinitialise aux valeurs par défaut avec reset()', () => {
    const { result } = renderHook(() => useReadingPreferences(), { wrapper });

    act(() => {
      result.current.update({ fontSize: '2xl', bionicReading: true });
    });
    expect(result.current.preferences.bionicReading).toBe(true);

    act(() => {
      result.current.reset();
    });
    expect(result.current.preferences).toEqual(DEFAULT_READING_PREFERENCES);
  });

  it('persiste les préférences dans document.cookie pour la synchronisation multi sous-domaines', () => {
    const { result } = renderHook(() => useReadingPreferences(), { wrapper });

    act(() => {
      result.current.update({ paperTheme: 'sepia', bionicReading: true });
    });

    expect(document.cookie).toContain('qoe_reading_prefs=');
    expect(document.cookie).toContain('sepia');
  });
});
