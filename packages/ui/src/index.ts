// =====================================================================
// 📦 @qoe/ui — Re-exports
// =====================================================================
// 📖 Tous les composants UI partagés entre les apps du monorepo.
//    Les apps n'importent QUE depuis @qoe/ui (jamais depuis
//    @qoe/ui/src/SocialIcon ou autre chemin interne).
// =====================================================================

export * from './tokens';
export { Button, buttonVariants } from './ui/button';
export { ImageUploader } from './ui/ImageUploader';
export { CertifiedBadge, type CertifiedBadgeProps } from './ui/CertifiedBadge';

// 🌍 Composants partagés
export { SocialIcon } from './SocialIcon';
export { TenantHeader } from './TenantHeader';
export { SubscribeForm } from './SubscribeForm';
export { Logo } from './Logo';
export { DevtoolsPanel } from './devtools/DevtoolsPanel';
export { ThemeProvider, ThemeSeedScript } from './theme-provider';
export { BentoPlateau, BentoItem } from './ui/BentoPlateau';
export { GuestFloatingBar, type AuthActionContext } from './GuestFloatingBar';
export { LoginModal } from './LoginModal';
export { LoginFormBento, type LoginFormBentoProps } from './LoginFormBento';
export {
  OnboardingFlow,
  type OnboardingFlowProps,
  type OnboardingSubmitData,
  type OnboardingCategory,
  type OnboardingCreator,
  type OnboardingSubtopic,
} from './onboarding/OnboardingFlow';
export { OnboardingModal, type OnboardingModalProps } from './onboarding/OnboardingModal';
export {
  AuthModalProvider,
  useAuthModal,
  useRequireAuth,
  type AuthModalState,
  type AuthModalContextValue,
} from './auth/AuthModalContext';
export { GlobalAuthModalProvider } from './auth/GlobalAuthModalProvider';
export { ArticleCard } from './ArticleCard';
export * from './social';
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
} from './sidebar';
export {
  useOptimisticMutation,
  type UseOptimisticMutationOptions,
} from './hooks/useOptimisticMutation';
export {
  TextSelectionPopover,
  type SelectionState,
  type TextSelectionPopoverProps,
} from './TextSelectionPopover';
export * from './cmdk';
export * from './ui/dialog';
export * from './ui/hover-card';
export { ThemeToggle } from './ui/ThemeToggle';
export { HotkeyHelpModal, type HotkeyHelpModalProps } from './shortcuts/HotkeyHelpModal';
export * from './annotations';

// 🛡️ Composants de Résilience Zéro-Crash & Médias Défensifs
export { SafeAvatar, type SafeAvatarProps } from './SafeAvatar';
export { SafeImage, type SafeImageProps } from './SafeImage';
export { WidgetErrorBoundary, type WidgetErrorBoundaryProps } from './WidgetErrorBoundary';
export { ClientDate, type ClientDateProps } from './ClientDate';
export {
  ZoomableLightbox,
  LightboxProvider,
  useZoomableLightbox,
  type LightboxImageItem,
  type ZoomableLightboxProps,
} from './social/ZoomableLightbox';
export {
  MediaLightbox,
  type MediaLightboxProps,
  type MediaLightboxImage,
} from './social/MediaLightbox';
