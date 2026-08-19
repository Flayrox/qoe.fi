import { NextResponse } from 'next/server';
import { getMonorepoUrl } from '@qoe/config';

/**
 * 🔀 Route Handler pour /login sur apps/studio (port 3020)
 * Redirige proprement vers la page de connexion centrale de l'application.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get('host') || url.host;

  const loginBase = `${getMonorepoUrl('feed', host)}/login`;
  const search = url.search;

  let redirectTarget: string;
  if (search) {
    redirectTarget = `${loginBase}${search}`;
  } else {
    const dashboardBase = getMonorepoUrl('dashboard', host);
    redirectTarget = `${loginBase}?redirect=${encodeURIComponent(`${dashboardBase}/`)}`;
  }

  return NextResponse.redirect(new URL(redirectTarget));
}
