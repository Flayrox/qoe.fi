import { notFound, redirect } from 'next/navigation';

// 🧪 Entrée courte du lab de développement : /dev → /dev/ui-lab
export default function DevIndexPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  redirect('/dev/ui-lab');
}
