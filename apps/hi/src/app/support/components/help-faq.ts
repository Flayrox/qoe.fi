// =====================================================================
// 🎫 Contenu du centre d'aide (module pur, sans JSX — testable vitest).
// Points déjà traités, bilingues. Évolution : générer depuis les dossiers
// résolus — pas avant le volume (contenu statique versionné en code).
// =====================================================================

interface FaqEntry {
  id: string;
  qFr: string;
  aFr: string;
  qEn: string;
  aEn: string;
  link?: { href: string; labelFr: string; labelEn: string };
}

const FAQ: FaqEntry[] = [
  {
    id: 'compte-perdu',
    qFr: 'Je ne peux plus me connecter à mon compte',
    aFr: "Utilisez le formulaire ci-dessous (motif « Compte perdu ») avec l'e-mail du compte : le staff vérifie et vous répond. Ne recréez pas de second compte.",
    qEn: 'I can no longer log in to my account',
    aEn: 'Use the form below (“Lost account”) with the account email: staff will verify and reply. Do not create a second account.',
  },
  {
    id: 'confirmation',
    qFr: "Je n'ai pas reçu l'e-mail de confirmation",
    aFr: 'Vérifiez vos spams, puis cliquez à nouveau sur votre lien : la page propose « Recevoir un nouveau lien ». Chaque demande invalide la précédente.',
    qEn: 'I did not receive the confirmation email',
    aEn: 'Check your spam folder, then click your link again: the page offers “Send me a new link”. Each request invalidates the previous one.',
  },
  {
    id: 'desabonnement',
    qFr: 'Comment me désabonner d’une newsletter ?',
    aFr: 'Chaque e-mail contient un lien de désabonnement en un clic (en bas de page). Il agit immédiatement, sans connexion.',
    qEn: 'How do I unsubscribe from a newsletter?',
    aEn: 'Every email contains a one-click unsubscribe link (at the bottom). It acts immediately, no login needed.',
  },
  {
    id: 'mesure',
    qFr: 'Une mesure vise mon compte (limitation, suspension)',
    aFr: 'Contestez depuis votre espace (recours) : déposer ne lève rien à lui seul, le staff revoit chaque dossier. Sans compte accessible, utilisez le formulaire ci-dessous.',
    qEn: 'A measure targets my account (limitation, suspension)',
    aEn: 'Appeal from your space (recours): filing alone lifts nothing, staff reviews every case. Without accessible account, use the form below.',
  },
  {
    id: 'contenu',
    qFr: 'Signaler un contenu ou un compte',
    aFr: 'Utilisez le bouton de signalement sur le contenu lui-même (pris en compte pour la revue). Pour un suivi, ouvrez un dossier ci-dessous (motif « Signalement »).',
    qEn: 'Report content or an account',
    aEn: 'Use the report button on the content itself (used for review). For follow-up, open a case below (“Report”).',
  },
  {
    id: 'import',
    qFr: "J'ai reçu un e-mail d'une publication à laquelle je ne suis pas abonné",
    aFr: "C'est un envoi encadré après import de contacts : vous n'êtes abonné à rien. Ignorez-le, ou répondez « stop » — aucun abonnement ne sera créé sans votre clic.",
    qEn: 'I received an email from a publication I never subscribed to',
    aEn: 'This is a supervised sending after contact import: you are subscribed to nothing. Ignore it — no subscription is ever created without your click.',
  },
  {
    id: 'api',
    qFr: "Demande d'accès API refusée ou en attente",
    aFr: "Ouvrez un dossier ci-dessous (motif « Accès API ») en précisant l'usage prévu : le staff instruit les demandes au cas par cas.",
    qEn: 'API access request refused or pending',
    aEn: 'Open a case below (“API access”) describing the intended use: staff reviews requests individually.',
  },
  {
    id: 'delai',
    qFr: 'En combien de temps aurai-je une réponse ?',
    aFr: 'Chaque dossier est lu par un humain. Le délai varie selon la charge (visible dans la console staff) — relancer ne fait pas avancer plus vite, écrire dans le dossier ouvert, si.',
    qEn: 'How long until I get an answer?',
    aEn: 'Every case is read by a human. Delay varies with load — bumping does not help, writing in the open case does.',
  },
];

// filterFaq : recherche insensible à la casse, FR+EN mélangés — un
// anglophone trouve avec ses mots, et inversement. Exporté pour les tests.
export function filterFaq(entries: FaqEntry[], query: string): FaqEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((e) => `${e.qFr} ${e.aFr} ${e.qEn} ${e.aEn}`.toLowerCase().includes(q));
}

// ManagedArticle : article publié servi par l'API (console staff).
export interface ManagedArticle {
  slug: string;
  titleFr: string;
  titleEn: string;
  bodyFr: string;
  bodyEn: string;
}

// mergeFaq combine statique + gérés : les gérés d'abord (ordre API =
// position voulue par le staff), puis les statiques NON surchargés. Même
// slug qu'une entrée statique = la version console la REMPLACE (le staff
// corrige sans redéployer) ; API injoignable = statique seul (repli).
export function mergeFaq(managed: ManagedArticle[]): FaqEntry[] {
  const bySlug = new Map(managed.map((m) => [m.slug, m]));
  const out: FaqEntry[] = managed.map((m) => ({
    id: m.slug,
    qFr: m.titleFr,
    aFr: m.bodyFr,
    qEn: m.titleEn,
    aEn: m.bodyEn,
  }));
  for (const e of FAQ) {
    if (!bySlug.has(e.id)) out.push(e);
  }
  return out;
}

// defaultFaq : le statique seul (repli quand l'API est injoignable).
export function defaultFaq(): FaqEntry[] {
  return FAQ;
}
