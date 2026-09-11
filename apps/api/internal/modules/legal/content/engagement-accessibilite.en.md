# Accessibility commitment

*Last updated: {{updatedAt}}*

qoe.fi aims for **universal accessibility** of its interfaces, in line with **WCAG 2.2 level AA**, the European Accessibility Act (Directive (EU) 2019/882) and the obligations that apply to a mainstream digital service.

## 1. Our commitment

Accessibility is not optional: a publishing platform that excludes part of its readership fails its mission. We build accessibility into:

- **the design** of interfaces, not as an afterthought;
- **the shared design system** (`@qoe/theme`, `@qoe/ui`): contrast, visible focus, text sizes, touch targets;
- **testing**: automated checks plus manual keyboard and screen-reader walkthroughs;
- **the team's training** in good practice (HTML semantics, ARIA only where useful, text alternatives).

## 2. Measures in place

| WCAG goal | Implementation |
|-----------|----------------|
| Perceivable | text/background contrast meeting AA, text alternatives on images and previews, captions for audio/video produced by the platform, no information conveyed by colour alone |
| Operable | full keyboard navigation, visible focus, logical tab order, touch targets of at least 44 px, back-to-top, no keyboard traps |
| Understandable | explicit labels, precise error messages tied to their fields, declared page language, consistent navigation across pages |
| Robust | semantic HTML, components compatible with screen readers (VoiceOver, NVDA, TalkBack), no reliance on a single input method |

Further measures: light and dark themes following system preferences, respect for `prefers-reduced-motion`, zoom up to 200 % without loss of content, minimum contrast areas respected.

## 3. Compliance status

**Status: [partially compliant / compliant]** with WCAG 2.2 level AA.

### Known non-conformities

| Area | Description | Planned fix |
|------|-------------|-------------|
| Rich text editor | some toolbar commands are only reachable with a mouse | [QUARTER] |
| Theme editor | colour preview is not announced to screen readers | [QUARTER] |
| Third-party content | content embedded by creators (embeds, iframes) is outside our control | guidance + documentation |
| Creator content | alternative text on images published by creators | recommendations and prompts in the editor |
| Analytics dashboard | charts without an equivalent textual description for some metrics | [QUARTER] |

## 4. Content published by creators

Creators remain responsible for the accessibility of **their own content** (text alternatives, captions, readability). The publisher provides them with:

- a mandatory **alternative text** field when inserting an image;
- in-editor reminders and a good-practice guide;
- a per-article accessibility diagnosis (upcoming) flagging the most common gaps.

## 5. Reporting and remedies

- **Report a barrier**: [ACCESSIBILITY EMAIL]
- **Response times**: acknowledgement within **5 working days**, reasoned reply within **1 month**.
- **Workaround**: on request, we provide the requested content in an accessible alternative format (plain text, audio version).
- **Complaint**: failing a solution, you may refer the matter to the **Défenseur des droits** (France) — defenseurdesdroits.fr — or to the competent digital accessibility authority of your Member State.

## 6. Monitoring

An accessibility audit is carried out **at least once a year**, and after every major interface redesign. The results are summarised on this page, which is updated with each notable change.

**Last audit: [DATE]** · **Next audit planned: [DATE]**
