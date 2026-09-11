# Cookie and tracker policy

*Last updated: {{updatedAt}}*

This page explains how qoe.fi uses cookies and similar technologies (local storage, pixels, device identifiers), and how to **accept, refuse or withdraw** your consent at any time.

## 1. What a cookie is

A cookie is a small file placed on your device by a website. It lets the site recognise your browser, keep your session open, remember your preferences or measure audience. Equivalent technologies (localStorage, sessionStorage, device identifiers) follow the same consent rules.

## 2. Categories in use

### 2.1. Strictly necessary — **no consent required**

These trackers are essential to the service and cannot be switched off.

| Name | Purpose | Duration |
|------|---------|----------|
| Authentication session | keep you signed in | session duration / 30 days with "stay signed in" |
| CSRF token | protect forms against forged requests | session |
| `qoe-docs-theme` | remember the light/dark theme | persistent (localStorage) |
| `qoe_cookie_consent` | remember your tracker choice (so we do not ask on every page) | 6 months |
| Load balancing and security | spread load, detect abuse | session |

### 2.2. Audience measurement

| Name | Purpose | Duration | Legal basis |
|------|---------|----------|-------------|
| Anonymised audience identifier | count unique visitors, measure page views and reading time | 13 months maximum | consent (non-essential tracker) |
| Reading aggregates | feed **creators'** statistics about their own publications | 25 months (aggregated) | consent |

The statistics shown to creators are **aggregated** and cannot be used to re-identify an individual reader.

### 2.3. Functional preferences

| Name | Purpose | Duration |
|------|---------|----------|
| Language, currency, time zone | display content in the right language and currency | 12 months |
| Reading preferences (size, font, audio player) | reading comfort | 12 months |

### 2.4. No behavioural advertising

qoe.fi **does not serve behavioural advertising** and sets no third-party advertising tracker. No advertising profile is built or shared with data brokers.

## 3. Consent

- On your first visit, a banner lets you **accept** or **refuse** non-essential trackers, with the same simplicity for both choices.
- **Refusing is as easy as accepting**: a single "Reject all" button sits at the same visual level.
- No non-essential tracker is set before your choice: the `qoe_cookie_consent` cookie is read server-side and gates whether audience measurement actually loads.
- Your choice is kept for **6 months**; after that we ask again.
- You can change your choice at any time through **"Manage my cookies"** in the footer.

Consent is recorded with its date, version and your choice so that it can be evidenced (Article 7 GDPR).

## 4. Browser settings

You can also block or delete cookies from your browser settings:

- **Chrome**: Settings → Privacy and security → Cookies and other site data
- **Safari**: Settings → Safari → Privacy and security
- **Firefox**: Settings → Privacy & Security → Cookies and Site Data
- **Edge**: Settings → Cookies and site permissions

Blocking strictly necessary cookies prevents you from signing in to your account.

## 5. Third-party cookies

Some third-party services set trackers only when the matching feature is used:

| Service | Purpose | Tracker | Consent |
|---------|---------|---------|---------|
| Stripe | secure subscription payment | fraud and payment-session cookies | necessary for the transaction |
| Email provider | aggregated newsletter open measurement | tracking pixel | consent (audience) |
| Host / CDN | delivery of static files | no persistent tracker | — |

## 6. Retention

No non-essential tracker lasts longer than **13 months**. Data collected through trackers is kept for **25 months** at most, then deleted or anonymised.

## 7. Your rights

You may at any time request access to, rectification of or erasure of data derived from trackers, and withdraw your consent. Contact: **[DPO EMAIL]**. You may also lodge a complaint with the **CNIL** or your competent supervisory authority.

## 8. Changes

Any significant change to this policy triggers a fresh consent request. The version history is public.
