// =====================================================================
// 🔍 Logger structuré — @qoe/observability
// =====================================================================
// 📖 Logger JSON structuré, inspiré des bonnes pratiques Bluesky
//    (logger avec safeMessage, pas de PII) et Ghost (niveaux JSON).
//
// 🎯 Garanties :
//    - Sortie JSON lisible (1 ligne par log) en prod, lisible en dev
//    - `context` = données structurées SANS PII (safeMessage)
//    - `capture: true` sur error → envoie aussi à Sentry (si init)
//    - jamais de throw silencieux, jamais de crash
// =====================================================================

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogContext = Record<string, unknown>;

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: LogContext;
  timestamp: string;
  service?: string;
}

/**
 * Pointeur vers le captureur Sentry actif. Rempli par `setSentryCapture`
 * (appelé par l'init Sentry de chaque app). Injectable = testable, et
 * n'impose aucune dépendance statique sur @sentry/* dans le package.
 */
type SentryCapture = (error: unknown, context?: LogContext) => void;

let sentryCapture: SentryCapture | null = null;

export function setSentryCapture(capture: SentryCapture | null) {
  sentryCapture = capture;
}

export function getSentryCapture(): SentryCapture | null {
  return sentryCapture;
}

function isProd(): boolean {
  return process.env.NODE_ENV === 'production';
}

function formatEntry(entry: LogEntry): string {
  return JSON.stringify(entry);
}

function write(level: LogLevel, message: string, context?: LogContext, capture = false) {
  const entry: LogEntry = {
    level,
    message,
    context,
    timestamp: new Date().toISOString(),
    service: process.env.NEXT_PUBLIC_APP_NAME || process.env.SERVICE_NAME,
  };

  if (level === 'error' && capture && sentryCapture) {
    const err = context?.err instanceof Error ? context.err : new Error(message);
    sentryCapture(err, context);
  }

  if (isProd() || level === 'error' || level === 'warn') {
    console[level](formatEntry(entry));
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => write('debug', message, context),
  info: (message: string, context?: LogContext) => write('info', message, context),
  warn: (message: string, context?: LogContext) => write('warn', message, context),
  error: (message: string, context?: LogContext, opts?: { capture?: boolean }) =>
    write('error', message, context, opts?.capture),
};

export type { LogLevel };
