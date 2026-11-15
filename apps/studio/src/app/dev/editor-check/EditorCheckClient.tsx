'use client';

import { Editor } from '@/features/editor/components/Editor';

const IMAGE_PLACEHOLDER =
  "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='450'%3E%3Crect width='800' height='450' fill='%23e5e7eb'/%3E%3C/svg%3E";

const FIXTURE = `
  <p>Le banc monte le vrai éditeur, sans session ni API. Il vérifie le badge
  alt, le compteur et le panneau de raccourcis à chaque exécution.</p>
  <img src="${IMAGE_PLACEHOLDER}" alt="">
  <img src="${IMAGE_PLACEHOLDER}" alt="Une image correctement décrite">
  <div data-image-gallery="true">
    <img data-gallery-image="true" src="${IMAGE_PLACEHOLDER}" alt="">
  </div>
  <p>Fin du fixture.</p>
`;

export function EditorCheckClient() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <Editor
        initialTitle="Banc de non-régression de l'éditeur"
        initialContent={FIXTURE}
        initialCanEdit
        onSave={async () => undefined}
      />
    </main>
  );
}
