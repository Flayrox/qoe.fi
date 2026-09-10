import { NotFoundView } from '@qoe/ui';

export const metadata = {
  title: 'Page introuvable — qoe.fi',
  description: 'L’article ou la page que vous cherchez est introuvable sur cette publication.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function TenantNotFound() {
  return <NotFoundView />;
}
