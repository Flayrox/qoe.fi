import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mon journal — front personnalisé',
  description: "Propulsé par l'API créateur qoe.fi",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
