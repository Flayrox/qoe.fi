import { NotFoundView } from '@qoe/ui';

export const metadata = {
  title: 'Page introuvable — qoefi',
  description: 'La page que vous cherchez est introuvable ou a été déplacée.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootNotFound() {
  return <NotFoundView />;
}
