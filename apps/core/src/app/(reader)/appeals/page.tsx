// =====================================================================
// ⚖️ Mes recours — contester les mesures visant mon compte (tranche 6)
// =====================================================================
// L'ouverture d'un recours ne lève jamais rien : seule une décision staff
// overturned lève (faux positif avéré). Y compris suspendu : contester
// reste possible (l'auth n'exclut pas les suspendus).
// =====================================================================

import { createClient } from '@qoe/supabase/server';
import { Scale } from 'lucide-react';
import { listMyAppealsAction } from '@qoe/sdk';
import { AppealsApp } from './components/appeals-app';

export const metadata = {
  title: 'Mes recours | qoefi',
  description: 'Contestez les mesures de modération visant votre compte et suivez vos dossiers.',
};

export default async function RecoursPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <div className="max-w-3xl mx-auto p-8 text-center">
        <Scale className="w-8 h-8 mx-auto mb-3 opacity-50 text-muted-foreground" />
        <p className="text-muted-foreground">Connectez-vous pour accéder à vos recours.</p>
      </div>
    );
  }

  const res = await listMyAppealsAction({ limit: 20 });
  const initialItems = res.ok && Array.isArray(res.data?.items) ? res.data.items : [];

  return <AppealsApp userId={user.id} initialItems={initialItems} />;
}
