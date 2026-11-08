// =====================================================================
// 📱 SURFACES DE L'APPLICATION MOBILE (Expo / React Native)
// =====================================================================
// Même source de vérité que le web : ordre, libellés et routes des onglets
// vivent ici. `app-tabs.tsx` (natif) et `app-tabs.web.tsx` (web) filtrent
// cette liste par plateforme au lieu de redéclarer leurs `Tabs.Screen`.
// =====================================================================

import type { SurfaceDescriptor } from './surfaces';
import { routes } from './routes';

export const MOBILE_SURFACES: readonly SurfaceDescriptor[] = [
  {
    id: 'mobile.profile',
    scope: 'mobile',
    path: routes.mobile.profile(),
    routeName: 'profile',
    iconName: 'CircleUserRound',
    defaultLabel: 'Profil',
    section: 'navigation',
    keywords: ['profil', 'compte', 'menu'],
    showInSidebar: false,
    showInCmdK: false,
    showOnNative: true,
    showOnWeb: false,
    nativeOrder: 0,
  },
  {
    id: 'mobile.explore',
    scope: 'mobile',
    path: routes.mobile.explore(),
    routeName: 'explore',
    iconName: 'Compass',
    defaultLabel: 'Explorer',
    section: 'navigation',
    keywords: ['explorer', 'découverte', 'recherche'],
    showInSidebar: false,
    showInCmdK: false,
    showOnNative: true,
    showOnWeb: true,
    nativeOrder: 1,
    webOrder: 1,
  },
  {
    id: 'mobile.feed',
    scope: 'mobile',
    path: routes.mobile.feed(),
    routeName: 'index',
    iconName: 'Home',
    defaultLabel: 'Feed',
    section: 'navigation',
    keywords: ['feed', 'accueil', 'fil'],
    showInSidebar: false,
    showInCmdK: false,
    showOnNative: true,
    showOnWeb: true,
    nativeOrder: 2,
    webOrder: 0,
  },
  {
    id: 'mobile.notifications',
    scope: 'mobile',
    path: routes.mobile.notifications(),
    routeName: 'notifications',
    iconName: 'Bell',
    defaultLabel: 'Activité',
    section: 'navigation',
    keywords: ['notifications', 'activité', 'alertes'],
    showInSidebar: false,
    showInCmdK: false,
    showOnNative: true,
    showOnWeb: true,
    nativeOrder: 3,
    webOrder: 2,
  },
  {
    id: 'mobile.messages',
    scope: 'mobile',
    path: routes.mobile.messages(),
    routeName: 'messages',
    iconName: 'Mail',
    defaultLabel: 'Messages',
    section: 'navigation',
    keywords: ['messages', 'conversations'],
    showInSidebar: false,
    showInCmdK: false,
    // Fusionné dans « Activité » sur natif ; onglet autonome sur le web.
    showOnNative: false,
    showOnWeb: true,
    webOrder: 3,
  },
];
