export function isUnauthorizedError(error: any): boolean {
  if (!error) return false
  const msg = typeof error === 'string' ? error : error.message || error.code || ''
  const status = error.status || error.statusCode
  return (
    status === 401 ||
    msg.includes('UNAUTHORIZED') ||
    msg.includes('Non autorisé') ||
    msg.includes('Unauthorized') ||
    msg.includes('401')
  )
}

export function notifyUnauthorized(error?: any) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('qoe:unauthorized', {
        detail: { error },
      })
    )
  }
}
