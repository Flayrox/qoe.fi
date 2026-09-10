import { NotFoundView } from '@qoe/ui';

export const metadata = {
  title: 'Page introuvable — Studio qoe.fi',
  description: 'Cette page du Studio qoe.fi est introuvable ou a été déplacée.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function StudioRootNotFound() {
  return <NotFoundView />;
}
