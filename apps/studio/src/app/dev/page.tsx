import { notFound, redirect } from 'next/navigation';
import { devRoutesEnabled } from '@/lib/dev-routes';

// 🧪 Entrée courte du lab de développement : /dev → /dev/ui-lab
export default function DevIndexPage() {
  if (!devRoutesEnabled()) notFound();

  redirect('/dev/ui-lab');
}
