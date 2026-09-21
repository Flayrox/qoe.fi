import { NotFoundView } from '@qoe/ui';

export const metadata = {
  title: 'Page introuvable — qoefi',
  description: 'Le manuscrit que vous cherchez est introuvable ou a été déplacé.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function ReaderNotFound() {
  return <NotFoundView />;
}
