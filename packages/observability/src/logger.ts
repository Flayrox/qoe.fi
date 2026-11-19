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

/**
 * Sérialise une entrée de log **sans jamais lever**.
 * `JSON.stringify` explose sur un contexte cyclique (fréquent : erreurs HTTP
 * avec `request`/`response` liés) et sur les BigInt (compteurs pgx) : dans les
 * deux cas le log — et donc l'erreur qu'il décrivait — disparaissait.
 */
function formatEntry(entry: LogEntry): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(entry, (key: string, value: unknown) => {
      // `key` est imposé par la signature du replacer : on ne s'en sert pas.
      void key;
      if (typeof value === 'bigint') {
        return value.toString();
      }
      if (value instanceof Error) {
        return { name: value.name, message: value.message, stack: value.stack };
      }
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      return value;
    });
  } catch {
    // Dernier filet : on garde au moins le squelette de l'entrée.
    return JSON.stringify({
      level: entry.level,
      message: entry.message,
      timestamp: entry.timestamp,
      service: entry.service,
      contextError: 'Contexte non sérialisable',
    });
  }
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
    try {
      sentryCapture(err, context);
    } catch (captureError) {
      // La promesse du logger est de ne jamais casser l'appelant : un
      // captureur qui échoue ne doit pas empêcher le log local.
      console.warn(
        formatEntry({
          level: 'warn',
          message: 'sentry.capture_failed',
          context: {
            message: captureError instanceof Error ? captureError.message : String(captureError),
            original: message,
          },
          timestamp: new Date().toISOString(),
        })
      );
    }
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
