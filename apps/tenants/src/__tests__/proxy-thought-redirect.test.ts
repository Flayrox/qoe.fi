import { describe, it, expect, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { proxy } from '../proxy';

vi.mock('@qoe/supabase/middleware', () => ({
  updateSession: vi.fn().mockResolvedValue({
    supabaseResponse: new NextResponse(null, { headers: new Headers() }),
    user: null,
  }),
}));

describe('apps/tenants proxy - thought redirects', () => {
  it('redirects /thought/:id on tenant subdomain to the main app', async () => {
    const req = new NextRequest('https://nomdutenant.qoe.fi/thought/wdbuwdw', {
      headers: { host: 'nomdutenant.qoe.fi' },
    });

    const res = await proxy(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://qoe.fi/thought/wdbuwdw');
  });

  it('redirects /:username/thought/:id on tenant subdomain to the main app', async () => {
    const req = new NextRequest('https://nomdutenant.qoe.fi/alex/thought/wdbuwdw', {
      headers: { host: 'nomdutenant.qoe.fi' },
    });

    const res = await proxy(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://qoe.fi/alex/thought/wdbuwdw');
  });

  it('redirects /thought/:id in local development preserving dev port', async () => {
    const req = new NextRequest('http://nomdutenant.lvh.me:15403/thought/wdbuwdw', {
      headers: { host: 'nomdutenant.lvh.me:15403' },
    });

    const res = await proxy(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://lvh.me:15402/thought/wdbuwdw');
  });

  it('does NOT redirect /thoughts (the tenant thoughts feed page)', async () => {
    const req = new NextRequest('https://nomdutenant.qoe.fi/thoughts', {
      headers: { host: 'nomdutenant.qoe.fi' },
    });

    const res = await proxy(req);
    // Rewritten internally, NOT 307 redirected to main app
    expect(res.status).not.toBe(307);
    expect(res.headers.get('x-middleware-rewrite')).toContain('/tenant/nomdutenant/thoughts');
  });
});
