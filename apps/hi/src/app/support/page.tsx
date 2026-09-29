// =====================================================================
// 🎫 /support — formulaire public (vitrine, sans compte requis)
// =====================================================================
// Le cas « compte perdu » : quelqu'un qui ne peut plus se connecter doit
// quand même pouvoir demander de l'aide. Connecté sur hi → dossier au
// compte ; sinon dossier invité lié à l'e-mail (référence à conserver).
// Anti-spam : rate-limit + budget 3/j/adresse côté API (429/409 explicites).
// =====================================================================

import { SupportForm } from './components/support-form';

export const metadata = {
  title: 'Support / Nous contacter | qoefi',
  description:
    'Un problème de compte, de contenu ou de livraison ? Ouvrez un dossier — avec ou sans compte.',
};

export default function SupportPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        Aide / Help
      </p>
      <h1 className="text-3xl font-bold tracking-tight">Support — Nous contacter</h1>
      <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
        Un problème de compte (y compris perdu), de contenu, d&apos;API, d&apos;import ou de
        livraison ? Décrivez-le ici — <strong>sans créer de compte</strong>. Si vous êtes connecté,
        le dossier est ouvert directement sur votre compte. Sinon, il est lié à votre e-mail :
        conservez la référence affichée après l&apos;envoi.
      </p>
      <div className="mt-8">
        <SupportForm />
      </div>
    </main>
  );
}
