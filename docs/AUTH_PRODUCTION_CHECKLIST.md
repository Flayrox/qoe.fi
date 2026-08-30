# Production checklist — Supabase Auth

## Required environment

- `NEXT_PUBLIC_SUPABASE_URL` must be the public Kong/Auth base URL used by browsers (for example `https://auth.qoe.fi`).
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` is safe for browser use; never put `SUPABASE_SERVICE_ROLE_KEY` in a `NEXT_PUBLIC_*` variable.
- `SUPABASE_AUTH_URL` must be reachable by the Go API and expose `auth/v1/.well-known/jwks.json`.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only and must be injected through the API runtime secret store.
- `NEXT_PUBLIC_APP_URL` must be the canonical HTTPS reader URL.

## OAuth and MFA

- Configure the exact production callback URL in every provider and in GoTrue's `additional_redirect_urls`.
- Keep local HTTP callback URLs out of the production allow-list.
- Keep `skip_nonce_check = false` in production for every OAuth provider.
- Enable TOTP enrollment and verification in the effective GoTrue configuration.
- Supabase does not currently issue recovery codes. Recommend a second TOTP factor on a separate device; do not implement recovery codes in application tables.
- Test OAuth linking and unlinking with an account that has another verified sign-in method.

## Cookies and domains

- Use HTTPS everywhere in production.
- The shared cookie domain must be `.qoe.fi` when Core and Studio share a session across subdomains.
- Confirm the browser sends the cookie to Core, Studio, and the configured callback origin, with `Secure`, `HttpOnly`, and `SameSite=Lax` attributes.
- Never share cookies across unrelated parent domains.

## Session operations

- Keep access-token lifetime, refresh-token rotation, reuse interval, time-box, and inactivity timeout aligned with the risk policy.
- Treat `signOut({ scope: 'global' })` as the supported native GoTrue global revocation operation.
- Do not read or mutate `auth.sessions` directly.
- Verify global sign-out in a second browser/device during release testing.

## Release gates

1. Deploy configuration to a staging GoTrue instance.
2. Verify `/auth/v1/health`, JWKS, password login, OAuth callback, MFA enrollment, MFA verification, and global sign-out.
3. Confirm no service-role key appears in browser bundles, rendered HTML, logs, or client requests.
4. Run the smoke tests again after the production DNS/TLS cutover.
5. Rotate any secret that was exposed during debugging or local development.
