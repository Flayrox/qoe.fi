import { NotFoundView } from '@qoe/ui';

export const metadata = {
  title: 'Page introuvable — qoefi',
  description: 'La page que vous cherchez n’existe pas ou a été déplacée.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function HiNotFound() {
  return <NotFoundView />;
}
