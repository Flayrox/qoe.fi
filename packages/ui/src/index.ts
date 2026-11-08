// =====================================================================
// 📦 @qoe/ui — Re-exports
// =====================================================================
// 📖 Tous les composants UI partagés entre les apps du monorepo.
//    Les apps n'importent QUE depuis @qoe/ui (jamais depuis
//    @qoe/ui/src/SocialIcon ou autre chemin interne).
// =====================================================================

export * from './tokens';
// Le Button public est celui du contrat (`@qoe/ui/button`). L'ancienne
// primitive Base UI (`./ui/button`) a été supprimée une fois ses trois
// derniers consommateurs migrés (calendar, LoginFormBento, OnboardingFlow).
export { Button, type ButtonProps } from './primitives/button/button';
export { PopoverPanel, type PopoverPanelProps } from './primitives/popover/popover-panel';
export {
  Badge,
  badgeClasses,
  type BadgeProps,
  type BadgeSize,
  type BadgeStyleOptions,
  type BadgeVariant,
} from './primitives/badge/badge';
export { Tooltip, type TooltipPlacement, type TooltipProps } from './primitives/tooltip/tooltip';
export {
  Tabs,
  TabList,
  Tab,
  TabPanel,
  type TabsProps,
  type TabListProps,
  type TabProps,
  type TabPanelProps,
  type TabsVariant,
} from './primitives/tabs/tabs';
export {
  TagGroup,
  TagList,
  Tag,
  type TagGroupProps,
  type TagListProps,
  type TagProps,
  type TagSelectionMode,
  type TagSize,
} from './primitives/tag-group/tag-group';
export {
  Input,
  InputGroup,
  Textarea,
  type InputProps,
  type TextareaProps,
} from './primitives/input/input';
// Overlays du contrat : ces noms ne collisionnent pas avec les composants
// historiques de `ui/` (Sheet, toast.*), qui restent exportés séparément.
export { Select, type SelectOption, type SelectProps } from './primitives/select/select';
export {
  Avatar,
  AvatarGroup,
  AvatarStack,
  type AvatarProps,
  type AvatarSize,
} from './primitives/avatar/avatar';
export {
  Accordion,
  AccordionItem,
  type AccordionItemProps,
  type AccordionProps,
} from './primitives/accordion/accordion';
export {
  Checkbox,
  type CheckboxIndicator,
  type CheckboxProps,
  type CheckboxPrimitiveProps,
} from './primitives/checkbox/checkbox';
export { Switch, type SwitchProps } from './primitives/switch/switch';
export {
  RadioGroup,
  RadioCard,
  Radio,
  type RadioGroupProps,
  type RadioCardProps,
  type RadioProps,
  type RadioCardVariant,
} from './primitives/radio-group/radio-cards';
export {
  AnnotationMark,
  type AnnotationMarkProps,
  type AnnotationVariant,
} from './primitives/annotation-mark/annotation-mark';
export { BevelButton, type BevelButtonProps } from './primitives/bevel-button/bevel-button';
export {
  HoldToDeleteButton,
  type HoldToDeleteButtonProps,
} from './primitives/hold-to-delete/hold-to-delete-button';
export { CopyButton, type CopyButtonProps } from './primitives/copy-button/copy-button';
export { SaveButton, type SaveButtonProps } from './primitives/save-button/save-button';
export {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TablePersonCell,
  TableRow,
  TableSelectAllCell,
  TableSelectionCell,
  compareCell,
  selectionToKeySet,
  sortRows,
  type ColumnSort,
  type SelectionLike,
  type SortCell,
  type SortDescriptorLike,
  type SortDirection,
  type SortKind,
  type SortSpec,
  type TableBodyProps,
  type TableCellProps,
  type TableColumnProps,
  type TableHeaderProps,
  type TablePersonCellProps,
  type TableProps,
  type TableRowProps,
} from './primitives/table/table';
export {
  ToggleButton,
  ToggleGroup,
  type ToggleButtonPrimitiveProps,
  type ToggleButtonGroupPrimitiveProps,
} from './primitives/toggle/toggle-button';
export {
  ScrollShadow,
  Toolbar,
  ToolbarGroup,
  ToolbarSeparator,
  type ScrollShadowProps,
  type ToolbarPrimitiveProps,
} from './primitives/toolbar/toolbar';
export {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  type DrawerProps,
  type DrawerSide,
  type DrawerWidth,
} from './primitives/drawer/drawer';
export { ImageUploader } from './ui/ImageUploader';
export { CertifiedBadge, type CertifiedBadgeProps } from './ui/CertifiedBadge';
export { CookieConsentBanner, CookiePreferencesCenter } from './legal/CookieConsentBanner';
export { CookiePreferencesButton } from './legal/CookiePreferencesButton';
export { AnalyticsNotice } from './legal/AnalyticsNotice';
export {
  LegalConsentGate,
  type ConsentItem,
  type LegalConsentGateProps,
} from './legal/LegalConsentGate';

// 🌍 Composants partagés
export { SocialIcon } from './SocialIcon';
export { TenantHeader } from './TenantHeader';
export { SubscribeForm } from './SubscribeForm';
export { RecommendationModal, type RecommendedPublication } from './RecommendationModal';
export { ConfirmDeleteModal, type ConfirmDeleteModalProps } from './social/ConfirmDeleteModal';
export { ReportModal, type ReportModalProps } from './social/ReportModal';
export { Logo, LogoSymbol, LogoWordmark } from './Logo';
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
  AuthModalContext,
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
export * from './cmdk';
export * from './primitives/dialog/dialog';
export * from './ui/hover-card';
export * from './ui/popover';
export { ProgressiveBlur, type ProgressiveBlurProps } from './ui/progressive-blur';
export { ThemeToggle } from './ui/ThemeToggle';
export { HotkeyHelpModal, type HotkeyHelpModalProps } from './shortcuts/HotkeyHelpModal';
export { useSurfaceHotkeys, type UseSurfaceHotkeysOptions } from './shortcuts/useSurfaceHotkeys';
export * from './annotations';
export * from './reader';

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
export {
  InvertedCurveBanner,
  type InvertedCurveBannerProps,
  type AnnouncementType,
} from './notifications/InvertedCurveBanner';

// 🌐 SEO Sémantique & JSON-LD (Schema.org)
export * from './seo/JsonLd';

// 🧭 Page 404 Immersive & Interactive
export { NotFoundView } from './NotFoundView';

// 🛡️ Fonctionnalités à venir / réservées Pro — registre, badge, teaser, interstitiel
export {
  FEATURES,
  FEATURE_KEYS,
  FEATURE_STATUS_COPY,
  DEFAULT_FEATURE_LOCALE,
  getFeature,
  isFeatureKey,
  localize,
  type FeatureAudience,
  type FeatureCta,
  type FeatureDefinition,
  type FeatureKey,
  type FeatureLocale,
  type FeaturePlan,
  type FeatureStatus,
  type LocalizedText,
} from './ui/feature-catalog';
export {
  FeatureTeaser,
  UpcomingBadge,
  FeatureInfoTooltip,
  type FeatureTeaserProps,
  type UpcomingBadgeProps,
  type FeatureInfoTooltipProps,
} from './ui/feature-teaser';
export {
  FeatureInterstitial,
  FeatureAnnouncementProvider,
  useFeatureAnnouncement,
  type FeatureInterstitialProps,
  type FeatureSignal,
  type FeatureAnnouncementProviderProps,
} from './ui/feature-interstitial';

// 🪶 Minimal Craft (Inspiré Rauno / Devouring Details)
export {
  SidebarToggleIcon,
  CraftSidebarDrawer,
  type SidebarToggleIconProps,
  type CraftSidebarDrawerProps,
  type CraftDrawerItem,
} from './ui/craft-sidebar-drawer';

// 📰 Qoefi Template Components (About & People)
export { PersonCard, type PersonCardProps } from './templates/blocks/PersonCard';
export { PeopleSection, type PeopleSectionProps } from './templates/blocks/PeopleSection';
export {
  AboutPageContent,
  type AboutPageContentProps,
  type AboutCustomConfig,
} from './templates/blocks/AboutPageContent';

// 🎨 Color Picker moderne & haute performance
export {
  ColorPicker,
  EDITORIAL_BACKGROUND_PRESETS,
  type ColorPickerProps,
  type ColorPreset,
} from './ui/color-picker';

// 🧭 Interstitiel de redirection externe & intercepteur de liens
export {
  ExitInterstitialModal,
  ExitInterstitialProvider,
  ExternalLinkInterceptor,
  ExitCard,
  useExitInterstitial,
  parseExternalUrl,
  type ExitInterstitialModalProps,
  type ExitInterstitialProviderProps,
  type ExternalLinkInterceptorProps,
  type ExitCardProps,
} from './ui/exit-interstitial';
