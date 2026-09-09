// ═══════════════════════════════════════════════════════════════════
// 🌐 @qoe/brand — index.ts (Cible Web React)
// Composants SVG React Web purs et re-exports universels.
// ═══════════════════════════════════════════════════════════════════

import React from 'react';
import { BRAND_LOGOS, BRAND_BADGES, BRAND_AVATAR_FALLBACKS, BRAND_SOCIAL_ICONS } from './paths';

export * from './paths';
export * from './avatars';
export * from './studio';

// ─── Types des composants Web ───
export interface LogoProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
  fillColor?: string;
}

export interface CertifiedBadgeProps {
  size?: number | string;
  className?: string;
  title?: string;
}

export interface SocialIconProps extends React.SVGProps<SVGSVGElement> {
  platform: string;
  className?: string;
  fillColor?: string;
}

/**
 * 🏷️ LogoSymbol — Glyphe officiel « Q » de qoe.fi (lettre Q emblématique).
 * Utilisé pour les favicons, logomarks, avatars système et headers compacts.
 */
export function LogoSymbol({ className = 'w-auto h-7', fillColor, ...props }: LogoProps) {
  const { viewBox, path, defaultColor } = BRAND_LOGOS.symbol;
  return (
    <svg
      viewBox={viewBox}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="qoe.fi"
      {...props}
    >
      <path d={path} fill={fillColor || defaultColor} />
    </svg>
  );
}

/**
 * Alias de compatibilité pour le logo symbole (utilisé dans les apps existantes).
 */
export const Logo = LogoSymbol;

/**
 * 🏷️ LogoWordmark — Logotype complet typographique « qoe.fi ».
 * Utilisé pour les headers desktop, marketing, splash et écrans d'accueil.
 */
export function LogoWordmark({ className = 'w-auto h-7', fillColor, ...props }: LogoProps) {
  const { viewBox, path, defaultColor } = BRAND_LOGOS.wordmark;
  return (
    <svg
      viewBox={viewBox}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="qoe.fi"
      {...props}
    >
      <path d={path} fill={fillColor || defaultColor} fillRule="evenodd" />
    </svg>
  );
}

/**
 * 🏅 CertifiedBadge — Badge officiel de certification auteur (Cercle vermillon + coche blanche).
 * Rendu vectoriel ultra-net et accessible.
 */
export function CertifiedBadge({
  size = 14,
  className = '',
  title = 'Auteur certifié',
}: CertifiedBadgeProps) {
  const { viewBox, bgCircle, checkPath, checkColor, strokeWidth } = BRAND_BADGES.certified;

  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 align-middle ${className}`}
      title={title}
      aria-label={title}
    >
      <svg
        width={size}
        height={size}
        viewBox={viewBox}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
      >
        <circle cx={bgCircle.cx} cy={bgCircle.cy} r={bgCircle.r} fill={bgCircle.color} />
        <path
          d={checkPath}
          stroke={checkColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/**
 * 📰 MediaBadge — Badge officiel pour les comptes Média / Publications vérifiées.
 */
export function MediaBadge({
  size = 14,
  className = '',
  title = 'Publication vérifiée',
}: CertifiedBadgeProps) {
  const { viewBox, bgRect, iconPath, iconColor } = BRAND_BADGES.media;

  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 align-middle ${className}`}
      title={title}
      aria-label={title}
    >
      <svg
        width={size}
        height={size}
        viewBox={viewBox}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
      >
        <rect
          x={bgRect.x}
          y={bgRect.y}
          width={bgRect.width}
          height={bgRect.height}
          rx={bgRect.rx}
          fill={bgRect.color}
        />
        <path
          d={iconPath}
          stroke={iconColor}
          strokeWidth={1.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/**
 * 🧑 UserSilhouette — Silhouette humaine minimale pour fallback d'avatar personnel.
 */
export function UserSilhouette({
  size = 20,
  className = '',
  ...props
}: React.SVGProps<SVGSVGElement> & { size?: number }) {
  const { viewBox, headCircle, bodyPath } = BRAND_AVATAR_FALLBACKS.userSilhouette;
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <circle cx={headCircle.cx} cy={headCircle.cy} r={headCircle.r} />
      <path d={bodyPath} />
    </svg>
  );
}

/**
 * 📰 MediaEmblem — Emblème éditorial minimal pour fallback d'avatar média.
 */
export function MediaEmblem({
  size = 20,
  className = '',
  ...props
}: React.SVGProps<SVGSVGElement> & { size?: number }) {
  const { viewBox, paths } = BRAND_AVATAR_FALLBACKS.mediaEmblem;
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {paths.map((d, index) => (
        <path key={index} d={d} />
      ))}
    </svg>
  );
}

/**
 * 🌐 SocialIcon — Composant universel pour les logos de réseaux sociaux et intégrations.
 */
export function SocialIcon({
  platform,
  className = 'w-5 h-5',
  fillColor = 'currentColor',
  ...props
}: SocialIconProps) {
  const key = platform.toLowerCase().trim();
  const icon = BRAND_SOCIAL_ICONS[key];

  if (!icon) {
    // Fallback générique si plateforme non répertoriée
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke={fillColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
        {...props}
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    );
  }

  return (
    <svg
      viewBox={icon.viewBox}
      fill={fillColor}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label={platform}
      {...props}
    >
      <path d={icon.path} fillRule={icon.fillRule || 'nonzero'} />
    </svg>
  );
}
