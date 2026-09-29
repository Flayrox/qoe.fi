// =====================================================================
// 🎫 Support — aide hors recours (tranche 6)
// =====================================================================
// Compte perdu/restreint, contenu, API, import, livraison, signalement,
// autre. Un dossier ouvert par motif. L'ouverture ne change rien —
// le staff répond et clôt en traçant. Les contestations de mesures
// anti-abus relèvent des recours (/recours), pas d'ici.
// =====================================================================

import { createClient } from '@qoe/supabase/server';
import { LifeBuoy } from 'lucide-react';
import { listMySupportTicketsAction } from '@qoe/sdk';
import { SupportApp } from './components/support-app';

export const metadata = {
  title: 'Support | qoefi',
  description: 'Demandez de l’aide et suivez vos dossiers.',
};

export default async function SupportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <div className="max-w-3xl mx-auto p-8 text-center">
        <LifeBuoy className="w-8 h-8 mx-auto mb-3 opacity-50 text-muted-foreground" />
        <p className="text-muted-foreground">Connectez-vous pour contacter le support.</p>
      </div>
    );
  }

  const res = await listMySupportTicketsAction({ limit: 20 });
  const initialItems = res.ok ? res.data.items : [];

  return <SupportApp initialItems={initialItems} />;
}
