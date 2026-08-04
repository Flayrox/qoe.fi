import React, { useState, useEffect, useRef } from 'react';

// --- TYPE DEFINITIONS ---
export type NavTabId = 'search' | 'home' | 'new' | 'radio';

export interface AppleMusicSidebarProps {
  /** Currently active navigation tab */
  activeTab?: NavTabId;
  /** Callback fired when a navigation item is clicked */
  onTabChange?: (tabId: NavTabId) => void;
  /** Callback fired when 'Ouvrir dans Musique' is clicked */
  onOpenInMusic?: () => void;
  /** Custom additional class names for header wrapper */
  className?: string;
  /** Inline style overrides */
  style?: React.CSSProperties;
}

// --- EXACT SVG ICONS FROM APPLE MUSIC WEB ---
const AppleMusicLogoSVG = () => (
  <svg
    height="20"
    viewBox="0 0 83 20"
    width="83"
    xmlns="http://www.w3.org/2000/svg"
    className="logo"
    aria-hidden="true"
    fill="currentColor"
  >
    <path d="M34.752 19.746V6.243h-.088l-5.433 13.503h-2.074L21.711 6.243h-.087v13.503h-2.548V1.399h3.235l5.833 14.621h.1l5.82-14.62h3.248v18.347h-2.56zm16.649 0h-2.586v-2.263h-.062c-.725 1.602-2.061 2.504-4.072 2.504-2.86 0-4.61-1.894-4.61-4.958V6.37h2.698v8.125c0 2.034.95 3.127 2.81 3.127 1.95 0 3.124-1.373 3.124-3.458V6.37H51.4v13.376zm7.394-13.618c3.06 0 5.046 1.73 5.134 4.196h-2.536c-.15-1.296-1.087-2.11-2.598-2.11-1.462 0-2.436.724-2.436 1.793 0 .839.6 1.41 2.023 1.741l2.136.496c2.686.636 3.71 1.704 3.71 3.636 0 2.442-2.236 4.12-5.333 4.12-3.285 0-5.26-1.64-5.509-4.183h2.673c.25 1.398 1.187 2.085 2.836 2.085 1.623 0 2.623-.687 2.623-1.78 0-.865-.487-1.373-1.924-1.704l-2.136-.508c-2.498-.585-3.735-1.806-3.735-3.75 0-2.391 2.049-4.032 5.072-4.032zM66.1 2.836c0-.878.7-1.577 1.561-1.577.862 0 1.55.7 1.55 1.577 0 .864-.688 1.576-1.55 1.576a1.573 1.573 0 0 1-1.56-1.576zm.212 3.534h2.698v13.376h-2.698zm14.089 4.603c-.275-1.424-1.324-2.556-3.085-2.556-2.086 0-3.46 1.767-3.46 4.64 0 2.938 1.386 4.642 3.485 4.642 1.66 0 2.748-.928 3.06-2.48H83C82.713 18.067 80.477 20 77.317 20c-3.76 0-6.208-2.62-6.208-6.942 0-4.247 2.448-6.93 6.183-6.93 3.385 0 5.446 2.213 5.683 4.845h-2.573zM10.824 3.189c-.698.834-1.805 1.496-2.913 1.398-.145-1.128.41-2.33 1.036-3.065C9.644.662 10.848.05 11.835 0c.121 1.178-.336 2.33-1.01 3.19zm.999 1.619c.624.049 2.425.244 3.578 1.98-.096.074-2.137 1.272-2.113 3.79.024 3.01 2.593 4.012 2.617 4.037-.024.074-.407 1.419-1.344 2.812-.817 1.224-1.657 2.422-3.002 2.447-1.297.024-1.73-.783-3.218-.783-1.489 0-1.97.758-3.194.807-1.297.048-2.28-1.297-3.097-2.52C.368 14.908-.904 10.408.825 7.375c.84-1.516 2.377-2.47 4.034-2.495 1.273-.023 2.45.857 3.218.857.769 0 2.137-1.027 3.746-.93z" />
  </svg>
);

const SearchIconSVG = () => (
  <svg height="24" viewBox="0 0 24 24" width="24" aria-hidden="true" fill="currentColor">
    <path
      d="M17.979 18.553c.476 0 .813-.366.813-.835a.807.807 0 0 0-.235-.586l-3.45-3.457a5.61 5.61 0 0 0 1.158-3.413c0-3.098-2.535-5.633-5.633-5.633C7.542 4.63 5 7.156 5 10.262c0 3.098 2.534 5.632 5.632 5.632a5.614 5.614 0 0 0 3.274-1.055l3.472 3.472a.835.835 0 0 0 .6.242zm-7.347-3.875c-2.417 0-4.416-2-4.416-4.416 0-2.417 2-4.417 4.416-4.417 2.417 0 4.417 2 4.417 4.417s-2 4.416-4.417 4.416z"
      fillOpacity=".95"
    />
  </svg>
);

const HomeIconSVG = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" fill="currentColor">
    <path d="M5.93 20.16a1.94 1.94 0 0 1-1.43-.502c-.334-.335-.502-.794-.502-1.393v-7.142c0-.362.062-.688.177-.953.123-.264.326-.529.6-.75l6.145-5.157c.176-.141.344-.247.52-.318.176-.07.362-.105.564-.105.194 0 .388.035.565.105.176.07.352.177.52.318l6.146 5.158c.273.23.467.476.59.75.124.264.177.59.177.96v7.134c0 .59-.159 1.058-.503 1.393-.335.335-.811.503-1.428.503H5.929Zm12.14-1.172c.221 0 .406-.07.547-.212a.688.688 0 0 0 .22-.511v-7.142c0-.177-.026-.344-.087-.459a.97.97 0 0 0-.265-.353l-6.154-5.149a.756.756 0 0 0-.177-.115.37.37 0 0 0-.15-.035.37.37 0 0 0-.158.035l-.177.115-6.145 5.15a.982.982 0 0 0-.274.352 1.13 1.13 0 0 0-.088.468v7.133c0 .203.08.379.23.511a.744.744 0 0 0 .546.212h12.133Zm-8.323-4.7c0-.176.062-.326.177-.432a.6.6 0 0 1 .423-.159h3.315c.176 0 .326.053.432.16s.159.255.159.431v4.973H9.756v-4.973Z" />
  </svg>
);

const NewIconSVG = () => (
  <svg height="24" viewBox="0 0 24 24" width="24" aria-hidden="true" fill="currentColor">
    <path
      d="M9.92 11.354c.966 0 1.453-.487 1.453-1.49v-3.4c0-1.004-.487-1.483-1.453-1.483H6.452C5.487 4.981 5 5.46 5 6.464v3.4c0 1.003.487 1.49 1.452 1.49zm7.628 0c.965 0 1.452-.487 1.452-1.49v-3.4c0-1.004-.487-1.483-1.452-1.483h-3.46c-.974 0-1.46.479-1.46 1.483v3.4c0 1.003.486 1.49 1.46 1.49zm-7.65-1.073h-3.43c-.266 0-.396-.137-.396-.418v-3.4c0-.273.13-.41.396-.41h3.43c.265 0 .402.137.402.41v3.4c0 .281-.137.418-.403.418zm7.634 0h-3.43c-.273 0-.402-.137-.402-.418v-3.4c0-.273.129-.41.403-.41h3.43c.265 0 .395.137.395.41v3.4c0 .281-.13.418-.396.418zm-7.612 8.7c.966 0 1.453-.48 1.453-1.483v-3.407c0-.996-.487-1.483-1.453-1.483H6.452c-.965 0-1.452.487-1.452 1.483v3.407c0 1.004.487 1.483 1.452 1.483zm7.628 0c.965 0 1.452-.48 1.452-1.483v-3.407c0-.996-.487-1.483-1.452-1.483h-3.46c-.974 0-1.46.487-1.46 1.483v3.407c0 1.004.486 1.483 1.46 1.483zm-7.65-1.072h-3.43c-.266 0-.396-.137-.396-.41v-3.4c0-.282.13-.418.396-.418h3.43c.265 0 .402.136.402.418v3.4c0 .273-.137.41-.403.41zm7.634 0h-3.43c-.273 0-.402-.137-.402-.41v-3.4c0-.282.129-.418.403-.418h3.43c.265 0 .395.136.395.418v3.4c0 .273-.13.41-.396.41z"
      fillOpacity=".95"
    />
  </svg>
);

const RadioIconSVG = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" fill="currentColor">
    <path d="M19.359 18.57C21.033 16.818 22 14.461 22 11.89s-.967-4.93-2.641-6.68c-.276-.292-.653-.26-.868-.023-.222.246-.176.591.085.868 1.466 1.535 2.272 3.593 2.272 5.835 0 2.241-.806 4.3-2.272 5.835-.261.268-.307.621-.085.86.215.245.592.276.868-.016zm-13.85.014c.222-.238.176-.59-.085-.86-1.474-1.535-2.272-3.593-2.272-5.834 0-2.242.798-4.3 2.272-5.835.261-.277.307-.622.085-.868-.215-.238-.592-.269-.868.023C2.967 6.96 2 9.318 2 11.89s.967 4.929 2.641 6.68c.276.29.653.26.868.014zm1.957-1.873c.223-.253.162-.583-.1-.867-.951-1.068-1.473-2.45-1.473-3.954 0-1.505.522-2.887 1.474-3.954.26-.284.322-.614.1-.876-.23-.26-.622-.26-.891.039-1.175 1.274-1.827 2.963-1.827 4.79 0 1.82.652 3.517 1.827 4.784.269.3.66.307.89.038zm9.958-.038c1.175-1.267 1.827-2.964 1.827-4.783 0-1.828-.652-3.517-1.827-4.791-.269-.3-.66-.3-.89-.039-.23.262-.162.592.092.876.96 1.067 1.481 2.449 1.481 3.954 0 1.504-.522 2.886-1.481 3.954-.254.284-.323.614-.092.867.23.269.621.261.89-.038zm-8.061-1.966c.23-.26.13-.568-.092-.883-.415-.522-.63-1.197-.63-1.934 0-.737.215-1.413.63-1.943.222-.307.322-.614.092-.875s-.653-.261-.906.054a4.385 4.385 0 0 0-.968 2.764 4.38 4.38 0 0 0 .968 2.756c.253.322.675.322.906.061zm6.18-.061a4.38 4.38 0 0 0 .968-2.756 4.385 4.385 0 0 0-.968-2.764c-.253-.315-.675-.315-.906-.054-.23.261-.138.568.092.875.415.53.63 1.206.63 1.943 0 .737-.215 1.412-.63 1.934-.23.315-.322.622-.092.883s.653.261.906-.061zm-3.547-.967c.96 0 1.789-.814 1.789-1.797s-.83-1.789-1.789-1.789c-.96 0-1.781.806-1.781 1.789 0 .983.821 1.797 1.781 1.797z" />
  </svg>
);

const AppIconSVG = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 114.927 120" aria-hidden="true" fill="currentColor">
    <path d="M39.031 104.974h36.871c8.557 0 15.243-2.491 19.635-6.883 4.547-4.444 6.935-11.141 6.935-19.688V41.595c0-8.546-2.377-15.233-6.935-19.687-4.454-4.454-11.078-6.883-19.635-6.883H39.031c-8.556 0-15.295 2.491-19.687 6.883-4.495 4.444-6.883 11.141-6.883 19.687v36.808c0 8.547 2.377 15.234 6.883 19.688 4.413 4.413 11.131 6.883 19.687 6.883zm0-7.854c-6.09 0-10.808-1.724-13.906-4.759-3.138-3.149-4.811-7.815-4.811-13.958V41.595c0-6.142 1.673-10.808 4.811-13.957 3.046-2.983 7.816-4.759 13.906-4.759h36.871c6.039 0 10.798 1.724 13.895 4.759 3.149 3.149 4.822 7.815 4.822 13.957v36.808c0 6.143-1.673 10.809-4.822 13.958-3.045 2.983-7.856 4.759-13.895 4.759z" />
    <path d="M41.091 86.083c3.593 0 9.188-2.71 9.188-9.874V53.468c0-1.05.146-1.206 1.071-1.404l19.664-4.018c1.05-.197 1.384-.031 1.384.791l.124 15.265c0 1.039-.53 1.766-1.528 1.964l-3.613.81c-5.005 1.111-7.507 3.446-7.507 7.257 0 3.861 3.052 6.623 7.299 6.623 3.592 0 9.063-2.575 9.063-9.801V37.124c0-2.543-1.193-3.322-4.058-2.709l-23.215 4.766c-1.713.363-2.72 1.328-2.72 2.885l.125 27.414c0 1.039-.406 1.59-1.268 1.788l-3.801.747c-4.932.987-7.392 3.551-7.392 7.496 0 3.862 3 6.572 7.184 6.572z" />
  </svg>
);

const ArrowSVG = () => (
  <svg height="16" width="16" viewBox="0 0 16 16" className="native-cta-action" aria-hidden="true" fill="currentColor">
    <path d="M1.559 16 13.795 3.764v8.962H16V0H3.274v2.205h8.962L0 14.441 1.559 16z" />
  </svg>
);

const UserAvatarSVG = () => (
  <svg
    viewBox="0 0 28 28"
    xmlns="http://www.w3.org/2000/svg"
    className="icon"
    data-testid="account-menu-fallback-icon"
    aria-hidden="true"
    fill="currentColor"
  >
    <path d="M14.007 28C6.299 28 0 21.703 0 14S6.299 0 14.007 0C21.7 0 28 6.297 28 14s-6.299 14-13.993 14zm0-9.392c4.253 0 7.49 1.514 8.805 3.216 1.815-2.08 2.899-4.81 2.899-7.824 0-6.54-5.12-11.784-11.704-11.784C7.41 2.216 2.289 7.46 2.289 14c0 3.014 1.084 5.743 2.9 7.824 1.313-1.702 4.55-3.216 8.818-3.216zm-.014-2.297c-2.6-.027-4.646-2.19-4.646-5.095-.014-2.73 2.059-4.986 4.646-4.986 2.601 0 4.647 2.256 4.647 4.986 0 2.906-2.032 5.122-4.647 5.095z" />
  </svg>
);

// --- MAIN SIDEBAR RECREATION COMPONENT ---
export const AppleMusicSidebar: React.FC<AppleMusicSidebarProps> = ({
  activeTab: controlledTab,
  onTabChange,
  onOpenInMusic,
  className = '',
  style,
}) => {
  // Uncontrolled vs Controlled Tab State
  const [internalTab, setInternalTab] = useState<NavTabId>('new');
  const currentTab = controlledTab ?? internalTab;

  // Account Contextual Menu Popover State
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showToast, setShowToast] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  const handleTabClick = (e: React.MouseEvent, tabId: NavTabId) => {
    e.preventDefault();
    setInternalTab(tabId);
    if (onTabChange) onTabChange(tabId);
  };

  const handleNativeCTA = () => {
    if (onOpenInMusic) {
      onOpenInMusic();
    } else {
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    }
  };

  // Close account menu on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setIsAccountOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <>
      {/* INJECTED APPLE MUSIC SIDEBAR STYLES */}
      <style>{`
        .header.svelte-1kouyp3 {
          position: fixed;
          top: 16px;
          left: 16px;
          bottom: 16px;
          width: 250px;
          z-index: 100;
          display: flex;
          flex-direction: column;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif;
          user-select: none;
          box-sizing: border-box;
        }

        .navigation.svelte-6nb0la {
          height: 100%;
          display: flex;
          flex-direction: column;
          background: rgba(30, 30, 32, 0.72);
          backdrop-filter: saturate(180%) blur(25px);
          -webkit-backdrop-filter: saturate(180%) blur(25px);
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
          padding: 16px;
          color: #ffffff;
          box-sizing: border-box;
          position: relative;
        }

        .navigation__header.svelte-6nb0la {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 4px 8px 16px 8px;
        }

        .logo.svelte-1fqg8y5 a {
          display: inline-flex;
          align-items: center;
          color: #ffffff;
          text-decoration: none;
          transition: opacity 0.2s ease;
        }

        .logo.svelte-1fqg8y5 a:hover {
          opacity: 0.85;
        }

        .navigation__content.svelte-6nb0la {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          overflow: hidden;
        }

        .navigation__scrollable-container.svelte-6nb0la {
          flex: 1;
          overflow-y: auto;
          margin-right: -4px;
          padding-right: 4px;
        }

        /* Custom scrollbar for sidebar */
        .navigation__scrollable-container.svelte-6nb0la::-webkit-scrollbar {
          width: 4px;
        }
        .navigation__scrollable-container.svelte-6nb0la::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 4px;
        }

        .navigation-items__list.svelte-1ereiwv {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .navigation-item.svelte-1h5j892 {
          list-style: none;
          margin: 0;
        }

        .navigation-item__link.svelte-1h5j892 {
          display: flex;
          align-items: center;
          text-decoration: none;
          color: rgba(255, 255, 255, 0.72);
          padding: 8px 12px;
          border-radius: 10px;
          transition: background-color 0.15s ease, color 0.15s ease;
          outline: none;
          cursor: pointer;
        }

        .navigation-item__link.svelte-1h5j892:hover {
          background: rgba(255, 255, 255, 0.08);
          color: #ffffff;
        }

        .navigation-item--selected .navigation-item__link.svelte-1h5j892 {
          background: rgba(255, 255, 255, 0.12);
          color: #ffffff;
          font-weight: 600;
        }

        .navigation-item__content.svelte-b3imqj {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
        }

        .navigation-item__icon.svelte-b3imqj {
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(255, 255, 255, 0.75);
          transition: color 0.15s ease;
        }

        /* Selected Icon gets the signature Apple Music red fill/accent */
        .navigation-item--selected .navigation-item__icon.svelte-b3imqj {
          color: #fa2d48;
        }

        .navigation-item__link.svelte-1h5j892:hover .navigation-item__icon.svelte-b3imqj {
          color: #ffffff;
        }

        .navigation-item--selected .navigation-item__link.svelte-1h5j892:hover .navigation-item__icon.svelte-b3imqj {
          color: #fa2d48;
        }

        .navigation-item__label.svelte-b3imqj {
          font-size: 15px;
          letter-spacing: -0.2px;
          line-height: 1.2;
          white-space: nowrap;
        }

        /* Search input expandable slot */
        .sidebar-search-box {
          margin-bottom: 12px;
          position: relative;
        }

        .sidebar-search-input {
          width: 100%;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 8px;
          padding: 6px 10px 6px 30px;
          color: #ffffff;
          font-size: 13px;
          outline: none;
          box-sizing: border-box;
          transition: all 0.2s ease;
        }

        .sidebar-search-input:focus {
          background: rgba(255, 255, 255, 0.14);
          border-color: #fa2d48;
        }

        .sidebar-search-input-icon {
          position: absolute;
          left: 8px;
          top: 50%;
          transform: translateY(-50%);
          color: rgba(255, 255, 255, 0.5);
          pointer-events: none;
        }

        /* Native CTA & Auth */
        .navigation__native-cta {
          padding-top: 14px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .native-cta.svelte-1r74jcm {
          width: 100%;
        }

        .native-cta__button.svelte-1r74jcm {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          padding: 8px 10px;
          color: #ffffff;
          font-family: inherit;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.25, 1, 0.5, 1);
          box-sizing: border-box;
        }

        .native-cta__button.svelte-1r74jcm:hover {
          background: rgba(255, 255, 255, 0.16);
          border-color: rgba(255, 255, 255, 0.2);
        }

        .native-cta__button.svelte-1r74jcm:active {
          transform: scale(0.98);
        }

        .native-cta__app-icon.svelte-1r74jcm {
          width: 22px;
          height: 22px;
          color: #fa2d48;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .native-cta__label.svelte-1r74jcm {
          flex: 1;
          text-align: left;
          margin: 0 8px;
          font-size: 13px;
          font-weight: 500;
          letter-spacing: -0.1px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .native-cta__arrow.svelte-1r74jcm {
          color: rgba(255, 255, 255, 0.45);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: color 0.15s ease;
        }

        .native-cta__button.svelte-1r74jcm:hover .native-cta__arrow.svelte-1r74jcm {
          color: #ffffff;
        }

        .auth-button.svelte-6xe2o {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          position: relative;
        }

        .contextual-menu__trigger {
          background: transparent;
          border: none;
          padding: 4px;
          cursor: pointer;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: rgba(255, 255, 255, 0.7);
          transition: all 0.2s ease;
        }

        .contextual-menu__trigger:hover {
          color: #ffffff;
          background: rgba(255, 255, 255, 0.12);
        }

        .user.svelte-y8jpsp {
          width: 28px;
          height: 28px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        /* Account Dropdown Popover */
        .account-popover {
          position: absolute;
          bottom: 42px;
          right: 0;
          width: 220px;
          background: rgba(36, 36, 38, 0.95);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 12px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
          padding: 6px;
          z-index: 200;
          display: flex;
          flex-direction: column;
          gap: 2px;
          animation: popoverFade 0.15s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes popoverFade {
          from { opacity: 0; transform: translateY(6px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .account-popover-item {
          padding: 8px 12px;
          font-size: 13px;
          color: rgba(255, 255, 255, 0.88);
          border-radius: 6px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: background 0.15s ease, color 0.15s ease;
        }

        .account-popover-item:hover {
          background: #fa2d48;
          color: #ffffff;
        }

        .account-popover-divider {
          height: 1px;
          background: rgba(255, 255, 255, 0.1);
          margin: 4px 0;
        }

        /* Toast notification */
        .apple-music-toast {
          position: fixed;
          bottom: 24px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(250, 45, 72, 0.92);
          color: #ffffff;
          padding: 10px 20px;
          border-radius: 20px;
          font-size: 14px;
          font-weight: 500;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(10px);
          z-index: 1000;
          animation: toastSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes toastSlideUp {
          from { opacity: 0; transform: translate(-50%, 12px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }

        @media (max-width: 768px) {
          .header.svelte-1kouyp3 {
            position: relative;
            width: 100%;
            top: 0;
            left: 0;
            bottom: 0;
            height: auto;
          }
        }
      `}</style>

      {/* HTML RECREATION CONTAINER */}
      <div className={`header svelte-1kouyp3 ${className}`} data-testid="header" style={style}>
        <nav data-testid="navigation" className="navigation svelte-6nb0la">
          <div className="navigation__header svelte-6nb0la">
            <div data-testid="logo" className="logo svelte-1fqg8y5">
              <a
                aria-label="Apple Music"
                role="img"
                href="https://music.apple.com/fr/home"
                className="svelte-1fqg8y5"
                onClick={(e) => handleTabClick(e, 'home')}
              >
                <AppleMusicLogoSVG />
              </a>
            </div>
            <div slot="search"></div>
          </div>

          <div
            data-testid="navigation-content"
            className="navigation__content svelte-6nb0la"
            id="navigation"
            aria-hidden="false"
          >
            <div className="navigation__scrollable-container svelte-6nb0la">
              {/* Optional live search bar inside sidebar */}
              {currentTab === 'search' && (
                <div className="sidebar-search-box">
                  <span className="sidebar-search-input-icon">
                    <svg height="14" width="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.979 18.553c.476 0 .813-.366.813-.835a.807.807 0 0 0-.235-.586l-3.45-3.457a5.61 5.61 0 0 0 1.158-3.413c0-3.098-2.535-5.633-5.633-5.633C7.542 4.63 5 7.156 5 10.262c0 3.098 2.534 5.632 5.632 5.632a5.614 5.614 0 0 0 3.274-1.055l3.472 3.472a.835.835 0 0 0 .6.242zm-7.347-3.875c-2.417 0-4.416-2-4.416-4.416 0-2.417 2-4.417 4.416-4.417 2.417 0 4.417 2 4.417 4.417s-2 4.416-4.417 4.416z" />
                    </svg>
                  </span>
                  <input
                    type="text"
                    className="sidebar-search-input"
                    placeholder="Artistes, titres, paroles..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoFocus
                  />
                </div>
              )}

              <div data-testid="navigation-items-primary" className="navigation-items navigation-items--primary svelte-1ereiwv">
                <ul className="navigation-items__list svelte-1ereiwv">
                  {/* RECHERCHER */}
                  <li
                    className={`navigation-item navigation-item__search svelte-1h5j892 ${
                      currentTab === 'search' ? 'navigation-item--selected' : ''
                    }`}
                    aria-selected={currentTab === 'search'}
                    data-testid="navigation-item"
                  >
                    <a
                      href="https://music.apple.com/fr/search"
                      className="navigation-item__link svelte-1h5j892"
                      role="button"
                      data-testid="search"
                      aria-pressed={currentTab === 'search'}
                      tabIndex={currentTab === 'search' ? 0 : -1}
                      onClick={(e) => handleTabClick(e, 'search')}
                    >
                      <div className="navigation-item__content svelte-b3imqj">
                        <span className="navigation-item__icon svelte-b3imqj">
                          <SearchIconSVG />
                        </span>
                        <span className="navigation-item__label svelte-b3imqj" dir="auto">
                          Rechercher
                        </span>
                      </div>
                    </a>
                  </li>

                  {/* ACCUEIL */}
                  <li
                    className={`navigation-item navigation-item__home svelte-1h5j892 ${
                      currentTab === 'home' ? 'navigation-item--selected' : ''
                    }`}
                    aria-selected={currentTab === 'home'}
                    data-testid="navigation-item"
                  >
                    <a
                      href="https://music.apple.com/fr/home"
                      className="navigation-item__link svelte-1h5j892"
                      role="button"
                      data-testid="home"
                      aria-pressed={currentTab === 'home'}
                      tabIndex={currentTab === 'home' ? 0 : -1}
                      onClick={(e) => handleTabClick(e, 'home')}
                    >
                      <div className="navigation-item__content svelte-b3imqj">
                        <span className="navigation-item__icon svelte-b3imqj">
                          <HomeIconSVG />
                        </span>
                        <span className="navigation-item__label svelte-b3imqj" dir="auto">
                          Accueil
                        </span>
                      </div>
                    </a>
                  </li>

                  {/* NOUVEAUTÉS (SELECTED BY DEFAULT) */}
                  <li
                    className={`navigation-item navigation-item__new svelte-1h5j892 ${
                      currentTab === 'new' ? 'navigation-item--selected' : ''
                    }`}
                    aria-selected={currentTab === 'new'}
                    data-testid="navigation-item"
                  >
                    <a
                      href="https://music.apple.com/fr/new"
                      className="navigation-item__link svelte-1h5j892"
                      role="button"
                      data-testid="new"
                      aria-pressed={currentTab === 'new'}
                      onClick={(e) => handleTabClick(e, 'new')}
                    >
                      <div className="navigation-item__content svelte-b3imqj">
                        <span className="navigation-item__icon svelte-b3imqj">
                          <NewIconSVG />
                        </span>
                        <span className="navigation-item__label svelte-b3imqj" dir="auto">
                          Nouveautés
                        </span>
                      </div>
                    </a>
                  </li>

                  {/* RADIO */}
                  <li
                    className={`navigation-item navigation-item__radio svelte-1h5j892 ${
                      currentTab === 'radio' ? 'navigation-item--selected' : ''
                    }`}
                    aria-selected={currentTab === 'radio'}
                    data-testid="navigation-item"
                  >
                    <a
                      href="https://music.apple.com/fr/radio"
                      className="navigation-item__link svelte-1h5j892"
                      role="button"
                      data-testid="radio"
                      aria-pressed={currentTab === 'radio'}
                      tabIndex={currentTab === 'radio' ? 0 : -1}
                      onClick={(e) => handleTabClick(e, 'radio')}
                    >
                      <div className="navigation-item__content svelte-b3imqj">
                        <span className="navigation-item__icon svelte-b3imqj">
                          <RadioIconSVG />
                        </span>
                        <span className="navigation-item__label svelte-b3imqj" dir="auto">
                          Radio
                        </span>
                      </div>
                    </a>
                  </li>
                </ul>
              </div>
            </div>

            {/* NATIVE CTA & AUTH SECTION */}
            <div className="navigation__native-cta">
              <div slot="native-cta">
                <div data-testid="native-cta" className="native-cta svelte-1r74jcm native-cta--authenticated">
                  <button
                    className="native-cta__button svelte-1r74jcm"
                    data-testid="native-cta-button"
                    onClick={handleNativeCTA}
                  >
                    <span className="native-cta__app-icon svelte-1r74jcm">
                      <div slot="app-icon">
                        <AppIconSVG />
                      </div>
                    </span>
                    <span className="native-cta__label svelte-1r74jcm">Ouvrir dans Musique</span>
                    <span className="native-cta__arrow svelte-1r74jcm">
                      <ArrowSVG />
                    </span>
                  </button>
                </div>

                <div className="auth-button svelte-6xe2o" ref={accountMenuRef}>
                  <div className="auth-content svelte-1idfncr" data-testid="auth-content">
                    <div className="account-menu svelte-y8jpsp account-menu--expanded" data-testid="account-menu">
                      {/* @ts-ignore custom element compatibility */}
                      <amp-contextual-menu-button hydrated="">
                        <button
                          className="contextual-menu__trigger"
                          type="button"
                          aria-label="Mon compte"
                          aria-haspopup="true"
                          aria-expanded={isAccountOpen}
                          onClick={() => setIsAccountOpen(!isAccountOpen)}
                        >
                          <span className="user svelte-y8jpsp" data-testid="account-menu-trigger" slot="trigger-content">
                            <UserAvatarSVG />
                          </span>
                        </button>
                      {/* @ts-ignore custom element compatibility */}
                      </amp-contextual-menu-button>
                    </div>
                  </div>

                  {/* ACCOUNT CONTEXTUAL MENU POPOVER */}
                  {isAccountOpen && (
                    <div className="account-popover">
                      <div className="account-popover-item">
                        <span>Se connecter</span>
                      </div>
                      <div className="account-popover-item">
                        <span>Essai gratuit (1 mois)</span>
                      </div>
                      <div className="account-popover-divider" />
                      <div className="account-popover-item">
                        <span>Réglages de l'application</span>
                      </div>
                      <div className="account-popover-item">
                        <span>Accessibilité</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </nav>
      </div>

      {/* TOAST FEEDBACK */}
      {showToast && (
        <div className="apple-music-toast">
          Opening Apple Music app...
        </div>
      )}
    </>
  );
};

// --- DEMO SHOWCASE ENVIRONMENT ---
// Shows the floating glass sidebar positioned over an authentic Apple Music "Nouveautés" page feed
export const AppleMusicDemoPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavTabId>('new');

  const releases = [
    { id: 1, title: 'THE TORTURED POETS DEPARTMENT', artist: 'Taylor Swift', cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&auto=format&fit=crop', category: 'ALBUM' },
    { id: 2, title: 'HIT ME HARD AND SOFT', artist: 'Billie Eilish', cover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500&auto=format&fit=crop', category: 'ALBUM' },
    { id: 3, title: 'BRAT', artist: 'Charli XCX', cover: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop', category: 'ALBUM' },
    { id: 4, title: 'Short n’ Sweet', artist: 'Sabrina Carpenter', cover: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=500&auto=format&fit=crop', category: 'ALBUM' },
    { id: 5, title: 'COWBOY CARTER', artist: 'Beyoncé', cover: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=500&auto=format&fit=crop', category: 'ALBUM' },
    { id: 6, title: 'Chromakopia', artist: 'Tyler, The Creator', cover: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=500&auto=format&fit=crop', category: 'NOUVEAU' },
  ];

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#000000',
        color: '#ffffff',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
        display: 'flex',
      }}
    >
      {/* THE FLOATING SIDEBAR */}
      <AppleMusicSidebar activeTab={activeTab} onTabChange={(tab) => setActiveTab(tab)} />

      {/* BACKGROUND CONTENT FEED (APPLE MUSIC WEB NOUVEAUTÉS PAGE) */}
      <main style={{ marginLeft: '280px', flex: 1, padding: '32px 48px 120px 48px' }}>
        <header style={{ marginBottom: '32px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '16px' }}>
          <span style={{ color: '#fa2d48', fontSize: '13px', fontWeight: 600, letterSpacing: '0.5px' }}>
            {activeTab.toUpperCase()}
          </span>
          <h1 style={{ fontSize: '36px', fontWeight: 700, margin: '4px 0 0 0', letterSpacing: '-0.5px' }}>
            {activeTab === 'new' && 'Nouveautés'}
            {activeTab === 'home' && 'Accueil'}
            {activeTab === 'search' && 'Recherche'}
            {activeTab === 'radio' && 'Apple Music Radio'}
          </h1>
        </header>

        {/* HERO BANNER */}
        <div
          style={{
            height: '280px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #fa2d48 0%, #700020 100%)',
            padding: '32px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            marginBottom: '40px',
            boxShadow: '0 20px 40px rgba(250, 45, 72, 0.25)',
          }}
        >
          <span style={{ textTransform: 'uppercase', fontSize: '12px', opacity: 0.8, letterSpacing: '1px' }}>
            Événement exclusif
          </span>
          <h2 style={{ fontSize: '32px', fontWeight: 700, margin: '8px 0' }}>Les Hits du Moment sur Apple Music</h2>
          <p style={{ margin: 0, opacity: 0.9, maxWidth: '500px', fontSize: '15px' }}>
            Découvrez toutes les dernières sorties d’albums, singles tendance et playlists exclusives adaptées à vos goûts.
          </p>
        </div>

        {/* ALBUMS GRID */}
        <h3 style={{ fontSize: '22px', fontWeight: 600, marginBottom: '20px' }}>Nouvelles Sorties</h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: '24px',
          }}
        >
          {releases.map((item) => (
            <div
              key={item.id}
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                borderRadius: '12px',
                padding: '12px',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                transition: 'transform 0.2s ease, background 0.2s ease',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
              }}
            >
              <div style={{ aspectRatio: '1/1', borderRadius: '8px', overflow: 'hidden', marginBottom: '12px' }}>
                <img src={item.cover} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              <span style={{ fontSize: '10px', color: '#fa2d48', fontWeight: 700, letterSpacing: '0.5px' }}>
                {item.category}
              </span>
              <div style={{ fontSize: '14px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {item.title}
              </div>
              <div style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.6)', marginTop: '2px' }}>{item.artist}</div>
            </div>
          ))}
        </div>
      </main>

      {/* BOTTOM FLOATING PLAYER BAR */}
      <footer
        style={{
          position: 'fixed',
          bottom: '16px',
          left: '280px',
          right: '16px',
          height: '72px',
          background: 'rgba(28, 28, 30, 0.85)',
          backdropFilter: 'blur(20px)',
          borderRadius: '16px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
          zIndex: 90,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '6px', background: '#fa2d48' }} />
          <div>
            <div style={{ fontSize: '14px', fontWeight: 600 }}>Apple Music Radio Live</div>
            <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)' }}>Écouter gratuitement sur Apple Music</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            style={{
              background: '#fa2d48',
              color: '#ffffff',
              border: 'none',
              padding: '8px 20px',
              borderRadius: '20px',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Lecture
          </button>
        </div>
      </footer>
    </div>
  );
};

export default AppleMusicDemoPage;