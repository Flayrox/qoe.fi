# Privacy policy

*Last updated: {{updatedAt}}* · *Effective: {{effectiveAt}}*

This policy explains **what data qoe.fi collects, why, for how long and with whom**, in accordance with the General Data Protection Regulation (Regulation (EU) 2016/679, "**GDPR**") and the French Data Protection Act.

## 1. Data controller

The data controller is:

**[COMPANY NAME]** — [ADDRESS]
Represented by [LEGAL REPRESENTATIVE]
Data protection contact: **[DPO EMAIL]**

A data protection officer (DPO) [is appointed / is not appointed] and can be contacted at the address above.

> **Creators and media outlets**: when a creator collects data from their audience themselves (external form, CRM database, newsletter sent from their own tool), they act as an **independent controller**. The Data processing agreement and the list of Sub-processors then govern the relationship.

## 2. Data collected

| Category | Data | Purpose |
|----------|------|---------|
| **Account** | email, password (hashed), display name, username, avatar, language and theme preferences | create and secure the account, personalise the interface |
| **Public profile** | bio, website, social links, logo, banner, subdomain, publications | display the chosen public identity |
| **Content** | articles, thoughts, highlights, comments, drafts, uploaded files | publish, save, synchronise |
| **Audience** | subscriber email addresses, subscription status, sending preferences, unsubscribe lists | deliver newsletters, manage consent |
| **Payment** | Stripe customer ID, subscription ID, amounts, currency, status, card brand and last digits; **never the full number** | collect subscriptions and pay out revenue |
| **Browsing** | IP address (truncated where possible), user agent, pages viewed, reading time, referrer | security, aggregated audience measurement, anti-abuse |
| **Technical** | application logs, errors, request identifiers, device fingerprint for security | diagnostics, fraud and scraping prevention |
| **Support** | content of exchanges with the support team | handle the request |
| **Legal** | timestamp and exact version of accepted documents (ToS, privacy, cookies) | evidence of consent (burden of proof) |

We do **not** collect special category data (health, origin, political opinions, sexual orientation) and do not encourage its publication. We **never** sell your data.

## 3. Legal bases

| Processing | Legal basis (Art. 6 GDPR) |
|------------|---------------------------|
| Account creation and management, provision of the service | performance of the contract (6.1.b) |
| Subscription payment and revenue payout | performance of the contract (6.1.b) + statutory accounting obligation (6.1.c) |
| Transactional email (confirmation, reset, receipts, security alerts) | performance of the contract (6.1.b) |
| Newsletters and marketing notifications | consent (6.1.a), withdrawable at any time |
| Aggregated audience measurement | legitimate interest (6.1.f) in understanding use of the service, with minimisation |
| Fraud, scraping and abuse prevention | legitimate interest (6.1.f) + security obligation (Art. 32) |
| Retention of proof of legal acceptance | legal obligation (6.1.c) |
| Moderation and handling of reports | DSA legal obligation (6.1.c) + legitimate interest |

## 4. Retention periods

| Data | Period |
|------|--------|
| Active account | for as long as the account exists |
| Inactive account (no sign-in or publication) | deleted or anonymised after **36 months** of inactivity, following a warning email |
| Published content | until deleted by the author or the account is closed |
| Backups | 30 rolling days maximum |
| Technical and security logs | 12 months |
| Proof of legal consent | **5 years** after the end of the relationship (civil limitation period) |
| Accounting and tax records | 10 years (legal obligation) |
| Reports and moderation decisions | 3 years |
| Payment data | per Stripe Payments Europe and accounting obligations |

## 5. Recipients and processors

Data is accessible only to:

- authorised members of the qoe.fi team, on a least-privilege basis;
- the technical **processors** listed publicly on the *Sub-processors* page (hosting, storage, email, payment, notification delivery), each bound by a processing agreement (Art. 28 GDPR);
- creators, for the data of **their own** audience (subscribers, reading statistics for their publications), limited to what is necessary;
- administrative or judicial authorities, on valid legal request.

No data is transferred, rented or exchanged for advertising purposes.

## 6. Transfers outside the European Union

Primary hosting is located in the **European Union**. If a processor involves a transfer outside the EU, it is governed by:

- an **adequacy decision** of the European Commission, or
- the **standard contractual clauses** (2021/914) supplemented, where relevant, by additional technical measures (encryption in transit and at rest, minimisation, pseudonymisation).

The list of sub-processors states the location and transfer mechanism for each one.

## 7. Security

Measures implemented, proportionate to the risks:

- encryption in transit (TLS 1.2+) and at rest;
- passwords stored with a resistant derivation algorithm (bcrypt/argon2);
- multi-tenant isolation of publications, segregated by publication identifier;
- API key authentication with scopes (`READ`, `WRITE`, `ANALYTICS`), rotation and immediate revocation;
- audit log of sensitive administrative actions;
- rate limiting, protection against injection and unauthorised access;
- encrypted backups and tested restore procedures;
- least privilege for internal access.

In the event of a data breach likely to result in a high risk to rights and freedoms, the individuals concerned are informed **without undue delay**, and the supervisory authority ([CNIL] or the competent authority) is notified within **72 hours**.

## 8. Your rights

You have the following rights:

| Right | What it means |
|-------|---------------|
| **Access** (Art. 15) | obtain a copy of the data concerning you |
| **Rectification** (Art. 16) | correct inaccurate data |
| **Erasure** (Art. 17) | request deletion, subject to legal obligations |
| **Portability** (Art. 20) | receive your data in a structured, machine-readable format |
| **Restriction** (Art. 18) | freeze processing that is being contested |
| **Objection** (Art. 21) | object to processing based on legitimate interest, including direct marketing |
| **Withdrawal of consent** | at any time, for processing that depends on it, without retroactive effect |
| **Post-mortem instructions** | set out what happens to your data after your death (French law) |

**How to exercise them**: write to **[DPO EMAIL]** or use the account settings (self-service export and deletion). Reply within **1 month**, extendable by 2 months for complex requests, with prior notice.

**Complaint**: you may contact the supervisory authority of your place of residence, in particular the **CNIL** (France) — cnil.fr — or the authority of the Member State where the establishment concerned is located.

## 9. Minors

The service is not intended for people under 16. If we learn that an account was created by a minor under 16 without the authorisation of their legal representative, it is suspended and the data is deleted.

## 10. Cookies and trackers

Cookies and similar technologies are described in the **Cookie policy**, which sets out their purpose, duration and how to withdraw consent at any time.

## 11. Email and deliverability

- **Transactional** email (security, receipts, confirmations) is essential to the service and can only be disabled by closing the account.
- **Audience** email (newsletters, publication notifications) is sent on the basis of consent or legitimate interest depending on the channel, with a **one-click unsubscribe** link compliant with RFC 8058 in every message.
- Open and click statistics are aggregated; creators access them only for their own audience.

## 12. Changes

Any material change is notified at least **30 days** before it takes effect, with the option to refuse by closing your account. The version history remains available on the document's public page.
