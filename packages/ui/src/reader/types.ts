export type FontFamilyOption = 'font-serif' | 'font-sans' | 'font-dyslexic';

export type FontSizeOption = 'sm' | 'base' | 'lg' | 'xl' | '2xl';

export type LineHeightOption = 'compact' | 'normal' | 'relaxed';

export type ReadingWidthOption = 'narrow' | 'normal' | 'wide';

export type PaperThemeOption = 'default' | 'sepia' | 'slate' | 'oled';

export interface ReadingPreferences {
  fontFamily: FontFamilyOption;
  fontSize: FontSizeOption;
  lineHeight: LineHeightOption;
  readingWidth: ReadingWidthOption;
  paperTheme: PaperThemeOption;
  bionicReading: boolean;
  readingRuler: boolean;
  ttsSpeed: number;
}

export const DEFAULT_READING_PREFERENCES: ReadingPreferences = {
  fontFamily: 'font-serif',
  fontSize: 'base',
  lineHeight: 'normal',
  readingWidth: 'normal',
  paperTheme: 'default',
  bionicReading: false,
  readingRuler: false,
  ttsSpeed: 1.0,
};

export interface ReadingPreferencesContextValue {
  preferences: ReadingPreferences;
  update: (patch: Partial<ReadingPreferences>) => void;
  reset: () => void;
}

export interface TTSState {
  isPlaying: boolean;
  isPaused: boolean;
  currentParagraphIndex: number;
  totalParagraphs: number;
  speed: number;
}
