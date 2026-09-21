import { NotFoundView } from '@qoe/ui';

export const metadata = {
  title: 'Page introuvable — Studio qoefi',
  description: 'Cette page du Studio qoefi est introuvable ou a été déplacée.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function StudioRootNotFound() {
  return <NotFoundView />;
}
