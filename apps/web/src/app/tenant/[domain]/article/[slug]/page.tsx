// =====================================================================
// 📰 Article tenant — apps/web/src/app/tenant/[domain]/article/[slug]/
// =====================================================================
// 📖 Page de lecture d'un article sur le tenant d'un créateur.
//    Stratégie Phase 2 : on RÉ-EXPORTE depuis l'ancien emplacement.
//
//    Phase 8 (cleanup) : copier physiquement le fichier ici, mettre à
//    jour les imports pour utiliser @qoe/db, @qoe/supabase, etc.
// =====================================================================

// Ré-export du composant principal depuis l'ancien emplacement
export {
  default,
  generateMetadata,
} from "../../../../../../../src/app/tenant/[domain]/article/[slug]/page";
