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
export { LoginFormBento, type LoginFormBentoProps } from "./LoginFormBento";
export {
  AuthModalProvider,
  useAuthModal,
  useRequireAuth,
  type AuthModalState,
  type AuthModalContextValue,
} from "./auth/AuthModalContext";
export { GlobalAuthModalProvider } from "./auth/GlobalAuthModalProvider";
export { ArticleCard } from "./ArticleCard";
export * from "./social";
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
export { TextSelectionPopover, type SelectionState, type TextSelectionPopoverProps } from "./TextSelectionPopover";
export * from "./cmdk";
export * from "./ui/dialog";
export * from "./ui/hover-card";
export { HotkeyHelpModal, type HotkeyHelpModalProps } from "./shortcuts/HotkeyHelpModal";
export * from "./annotations";


