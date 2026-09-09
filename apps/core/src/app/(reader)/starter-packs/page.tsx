import { StarterPacksGallery } from '@/components/social/StarterPacksGallery';

export const metadata = {
  title: 'Starter Packs | qoe.fi',
  description: "Découvrez les listes d'abonnements thématiques en 1-clic sur qoe.fi.",
};

export default function StarterPacksPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between pb-4 mb-6 border-b border-border/40">
        <div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
            Starter Packs
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Découvrez et abonnez-vous à des sélections d'auteurs thématiques en un clic.
          </p>
        </div>
      </div>
      <StarterPacksGallery />
    </div>
  );
}
