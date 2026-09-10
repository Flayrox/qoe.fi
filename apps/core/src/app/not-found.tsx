import { NotFoundView } from '@qoe/ui';

export const metadata = {
  title: 'Page introuvable — qoe.fi',
  description: 'Le manuscrit que vous cherchez est introuvable ou a été déplacé.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootNotFound() {
  return <NotFoundView />;
}
