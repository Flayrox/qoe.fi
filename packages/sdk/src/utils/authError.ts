interface ErrorLike {
  message?: string;
  code?: string;
  status?: number;
  statusCode?: number;
}

export function isUnauthorizedError(error: unknown): boolean {
  if (!error) return false;
  const e = error as ErrorLike;
  const msg = typeof error === 'string' ? error : e.message || e.code || '';
  const status = e.status || e.statusCode;
  return (
    status === 401 ||
    msg.includes('UNAUTHORIZED') ||
    msg.includes('Non autorisé') ||
    msg.includes('Unauthorized') ||
    msg.includes('401')
  );
}

export function notifyUnauthorized(error?: unknown) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('qoe:unauthorized', {
        detail: { error },
      })
    );
  }
}
