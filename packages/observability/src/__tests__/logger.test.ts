// =====================================================================
// 🧪 Logger structuré — @qoe/observability
// =====================================================================
// 📖 Vérifie :
//    - le format JSON structuré des logs
//    - la redirection error→Sentry quand capture=true et le captureur est défini
//    - l'absence de capture quand capture=false
// =====================================================================

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { logger, setSentryCapture } from '../logger';

describe('logger', () => {
  const consoleSpies = {
    info: vi.spyOn(console, 'info').mockImplementation(() => {}),
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    setSentryCapture(null);
  });

  it('log info en JSON structuré uniquement en production', () => {
    const originalEnv = process.env.NODE_ENV;
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';

    try {
      logger.info('Article published', { articleId: 'a-1' });

      const call = consoleSpies.info.mock.calls[0]?.[0];
      const parsed = JSON.parse(call as string);
      expect(parsed).toMatchObject({
        level: 'info',
        message: 'Article published',
        context: { articleId: 'a-1' },
      });
      expect(parsed.timestamp).toBeTruthy();
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
    }
  });

  it('est silencieux pour info en dev/test (anti-bruit)', () => {
    logger.info('Should be silent', {});
    expect(consoleSpies.info).not.toHaveBeenCalled();
  });

  it('ne capture pas en Sentry sans captureur défini', () => {
    logger.error('Something failed', { articleId: 'a-1' }, { capture: true });
    expect(consoleSpies.error).toHaveBeenCalledTimes(1);
  });

  it('capture en Sentry quand capture=true et captureur injecté', () => {
    const capture = vi.fn();
    setSentryCapture(capture);

    logger.error('Paywall failure', { articleId: 'a-1' }, { capture: true });

    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    expect(capture.mock.calls[0]?.[0].message).toBe('Paywall failure');
    expect(capture.mock.calls[0]?.[1]).toMatchObject({ articleId: 'a-1' });
  });

  it("passe l'erreur réelle du contexte à Sentry si fournie", () => {
    const capture = vi.fn();
    setSentryCapture(capture);
    const realError = new Error('DB connection refused');

    logger.error('DB down', { err: realError }, { capture: true });

    expect(capture.mock.calls[0]?.[0]).toBe(realError);
  });

  it('ne capture pas quand capture=false même avec captureur', () => {
    const capture = vi.fn();
    setSentryCapture(capture);

    logger.error('Just logging', { articleId: 'a-1' });

    expect(capture).not.toHaveBeenCalled();
  });
});
