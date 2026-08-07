// =====================================================================
// 📦 @qoe/ui — Re-exports
// =====================================================================
// 📖 Tous les composants UI partagés entre les apps du monorepo.
//    Les apps n'importent QUE depuis @qoe/ui (jamais depuis
//    @qoe/ui/src/SocialIcon ou autre chemin interne).
// =====================================================================

export * from "./tokens";
export { Button, buttonVariants } from "./button";
export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "./card";

// 🌍 Composants partagés
export { SocialIcon } from "./SocialIcon";
export { TenantHeader } from "./TenantHeader";
export { SubscribeForm } from "./SubscribeForm";
export { Logo } from "./Logo";
export { DevtoolsPanel } from "./devtools/DevtoolsPanel";
export { ThemeProvider } from "./theme-provider";
export { BentoPlateau, BentoItem } from "./BentoPlateau";
export { GuestFloatingBar, type AuthActionContext } from "./GuestFloatingBar";
export { LoginModal } from "./LoginModal";
export { ArticleCard } from "./ArticleCard";
export { MicroPostCard } from "./MicroPostCard";
export {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarItem,
  SidebarFooter,
  useSidebarContext,
  type SidebarItemData,
  type SidebarProps,
} from "./sidebar";
export { useOptimisticMutation, type UseOptimisticMutationOptions } from "./hooks/useOptimisticMutation";
export * from "./cmdk";
