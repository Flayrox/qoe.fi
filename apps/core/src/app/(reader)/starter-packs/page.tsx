import { StarterPacksGallery } from '@/components/social/StarterPacksGallery';

export const metadata = {
  title: 'Starter Packs | qoe.fi',
  description: "Découvrez les listes d'abonnements thématiques en 1-clic sur qoe.fi.",
};

export default function StarterPacksPage() {
  return (
    <main className="w-full min-h-screen border-r border-border bg-background">
      <div className="p-4 border-b border-border flex items-center justify-between sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <h1 className="text-xl font-bold text-foreground">Starter Packs</h1>
      </div>
      <StarterPacksGallery />
    </main>
  );
}
