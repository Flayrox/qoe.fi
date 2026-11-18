// =====================================================================
// 🛡️ sanitize-preview-html — ré-export de l'assainisseur partagé
// =====================================================================
// L'aperçu lecteur injecte du HTML dans une session authentifiée ; il utilise
// exactement la même liste blanche que le lecteur (@qoe/ui/security) pour
// qu'un contenu accepté à l'aperçu ne devienne pas exécutable au studio, et
// inversement.
// =====================================================================

import { sanitizeArticleHtml } from '@qoe/ui/security';

/** Alias historique : le profil de risque est celui du corps d'article. */
export const sanitizePreviewHtml = sanitizeArticleHtml;
