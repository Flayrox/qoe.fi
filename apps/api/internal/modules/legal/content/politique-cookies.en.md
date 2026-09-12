# Cookie and tracker policy

*Last updated: {{updatedAt}}*

This page explains how qoe.fi uses cookies and similar technologies (local storage, pixels, device identifiers). Its nature has changed: **no non-essential tracker is set today**, audience measurement has become anonymous and cookieless, and there is therefore no blocking consent banner any more. The right to **object** to that measurement remains fully available.

## 1. What a cookie is

A cookie is a small file placed on your device by a website. It lets the site recognise your browser, keep your session open, remember your preferences or measure audience. Equivalent technologies (localStorage, sessionStorage, device identifiers) follow the same rules.

## 2. What is actually set today

### 2.1. Strictly necessary — **no consent**

These trackers are essential to the service and cannot be switched off.

| Name | Role | Retention |
|------|------|-----------|
| Authentication session | keep you signed in to your account | session / 30 days with “stay signed in” |
| CSRF token | protect forms against forged requests | session |
| `qoe.theme` / `qoe.locale` | remember light/dark theme and language | until you clear it |
| `qoe_cookie_consent` | remember your possible objection to audience measurement | 6 months |
| Load balancing and security | distribute load, detect abuse | session |

### 2.2. Audience measurement — **exempt from consent**

Audience measurement runs **with no cookie at all** and **never reads or writes browser storage**. The IP address your connection technically requires is **anonymised before any recording**: it is transformed one-way, is never written to our databases and is never kept, not even truncated. Query parameters and URL fragments are not collected, and your browser's “Do Not Track” setting is honoured.

That combination of guarantees (single purpose, no access to your device, prior anonymisation, no crossing with any other processing, no sharing with a third party, aggregated statistics) places it inside the consent-exemption regime of **Article 82(II) of the French Data Protection Act**: you do not have to click anything to benefit from it.

| Name | Purpose | Retention |
|------|---------|-----------|
| Audience measurement (self-hosted in the EU) | count visits, page views and referrers | 12 months (aggregated) |
| Reading aggregates | provide **creators** with statistics on their own publications | 12 months (aggregated) |

The statistics shown to creators are **aggregated** and cannot be used to re-identify an individual reader.

### 2.3. Comfort preferences — **because you ask for them**

| Name | Purpose | Retention |
|------|---------|-----------|
| Language, currency, time zone | display content in the right language and currency | 12 months |
| Reading preferences (size, font, audio player) | reading comfort | 12 months |

These preferences are stored only because **you choose them** (theme, language, text size): they serve the feature you requested, not a tracking purpose.

### 2.4. No behavioural advertising

qoe.fi **runs no behavioural advertising** and sets no third-party advertising tracker. No advertising profile is built or shared with data brokers. An “advertising and social” category stays described — but **empty** — in “Manage my trackers”, so that any future tracker of that kind is attached to it, and would then require prior consent.

## 3. Information, objection, and why the banner is gone

- There is **no consent banner any more**, because no tracker depends on one. A banner asking you to authorise what requires no authorisation would be a fake choice.
- A **notice** appears on your first visit: it explains the anonymous measurement in one sentence and offers **“Object”** in one click.
- **Objecting is as easy as reading**: objecting immediately stops the script in your browser *and* server-side; no further data is transmitted.
- Your objection is kept for **6 months**; after that, anonymous measurement resumes and the notice is offered again.
- You stay in control at any time via **“Manage my cookies”** in the footer, which lists the trackers actually set.
- An **objection expressed under the former banner remains effective**: it is not converted into consent by the change of regime.

Every decision (notice read, objection, re-enabling) is logged with its date, this policy's version and the relevant categories: it is your evidence as much as ours.

## 4. Browser settings

You can also block or delete trackers from your browser settings:

- **Chrome**: Settings → Privacy and security → Cookies and other site data
- **Safari**: Settings → Safari → Privacy & Security
- **Firefox**: Settings → Privacy & Security → Cookies and site data
- **Edge**: Settings → Cookies and site permissions

Blocking strictly necessary cookies prevents you from signing in to your account.

## 5. Third-party trackers

Some third-party services set trackers when the corresponding feature is used:

| Service | Usage | Tracker | Basis |
|---------|-------|---------|-------|
| Stripe | secure subscription payment | payment session and fraud cookies | necessary to the transaction |
| Email provider | delivery of service emails | no tracking pixel | — |
| Host / CDN | serving static files | no persistent tracker | — |

Audience measurement is **not** a third-party service: it is self-hosted on our own infrastructure, within the European Union.

## 6. Retention

No non-essential tracker exists today. Audience measurement aggregates are kept for **12 months**, then deleted. Retention dates are reviewed automatically at each regulatory deadline by our compliance tooling.

## 7. Your rights

You may at any time request access to, rectification of or erasure of data derived from audience measurement, object to that measurement, or withdraw any consent you may have given. Contact: **[EMAIL DPO]**. You may also lodge a complaint with the **CNIL** or your competent supervisory authority.

## 8. Changes

Any significant change to this policy is published as a new version, with a public history. We do not change it silently: the version counter is visible in the preferences centre.
