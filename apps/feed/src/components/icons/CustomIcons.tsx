import React from "react"

interface IconProps extends React.SVGProps<SVGSVGElement> {
  className?: string
}

export const TimelineIcon = ({ className, ...props }: IconProps) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} {...props}>
    <path d="M1.5 8H4.5L6.5 3.5L9.5 12.5L11.5 8H14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const BookmarksIcon = ({ className, ...props }: IconProps) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} {...props}>
    <path d="M3.5 2.5C3.5 1.94772 3.94772 1.5 4.5 1.5H11.5C12.0523 1.5 12.5 1.94772 12.5 2.5V14.5L8 10.5L3.5 14.5V2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const HighlightsIcon = ({ className, ...props }: IconProps) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} {...props}>
    <path d="M12.5 1.5L14.5 3.5L6.5 11.5H4.5V9.5L12.5 1.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2.5 14.5H13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

export const WalletIcon = ({ className, ...props }: IconProps) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} {...props}>
    <path d="M1.5 4.5C1.5 3.39543 2.39543 2.5 3.5 2.5H12.5C13.6046 2.5 14.5 3.39543 14.5 4.5V11.5C14.5 12.6046 13.6046 13.5 12.5 13.5H3.5C2.39543 13.5 1.5 12.6046 1.5 11.5V4.5Z" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="11" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.5" />
    <path d="M1.5 6.5H4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

export const SettingsIcon = ({ className, ...props }: IconProps) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} {...props}>
    <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5" />
    <path d="M8 1.5V3M8 13V14.5M1.5 8H3M13 8H14.5M3.4 3.4L4.5 4.5M11.5 11.5L12.6 12.6M3.4 12.6L4.5 11.5M11.5 4.5L12.6 3.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

export const ProfileIcon = ({ className, ...props }: IconProps) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} {...props}>
    <path d="M8 8.5C10.2091 8.5 12 6.70914 12 4.5C12 2.29086 10.2091 0.5 8 0.5C5.79086 0.5 4 2.29086 4 4.5C4 6.70914 5.79086 8.5 8 8.5Z" stroke="currentColor" strokeWidth="1.5" />
    <path d="M1.5 14.5C1.5 11.5 4.5 10.5 8 10.5C11.5 10.5 14.5 11.5 14.5 14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

export const LikeIcon = ({ className, ...props }: IconProps) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} {...props}>
    <path d="M8 14.5C8 14.5 1.5 10 1.5 5C1.5 2.5 3.5 1 5.5 1C6.8 1 7.5 1.8 8 2.5C8.5 1.8 9.2 1 10.5 1C12.5 1 14.5 2.5 14.5 5C14.5 10 8 14.5 8 14.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const CommentIcon = ({ className, ...props }: IconProps) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} {...props}>
    <path d="M1.5 8C1.5 4.41015 4.41015 1.5 8 1.5C11.5899 1.5 14.5 4.41015 14.5 8C14.5 11.5899 11.5899 14.5 8 14.5C6.70778 14.5 5.50294 14.1237 4.49 13.48L1.5 14.5L2.5 11.51C1.87634 10.4971 1.5 9.29222 1.5 8Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const RepostIcon = ({ className, ...props }: IconProps) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} {...props}>
    <path d="M11 4.5H2.5M11 4.5L8.5 2M11 4.5L8.5 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5 11.5H13.5M5 11.5L7.5 9M5 11.5L7.5 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const ShareIcon = ({ className, ...props }: IconProps) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} {...props}>
    <path d="M11.5 4.5C12.6046 4.5 13.5 3.60457 13.5 2.5C13.5 1.39543 12.6046 0.5 11.5 0.5C10.3954 0.5 9.5 1.39543 9.5 2.5C9.5 2.7121 9.53303 2.91646 9.59398 3.10842L5.49397 5.15842C4.98144 4.75053 4.32977 4.5 3.625 4.5C2.02335 4.5 0.725 5.79835 0.725 7.4C0.725 9.00165 2.02335 10.3 3.625 10.3C4.32977 10.3 4.98144 10.0495 5.49397 9.64158L9.59398 11.6916C9.53303 11.8835 9.5 12.0879 9.5 12.3C9.5 13.4046 10.3954 14.3 11.5 14.3C12.6046 14.3 13.5 13.4046 13.5 12.3C13.5 11.1954 12.6046 10.3 11.5 10.3C10.7952 10.3 10.1436 10.5505 9.63103 9.95842L5.53102 7.90842C5.59197 7.71646 5.625 7.5121 5.625 7.3C5.625 7.0879 5.59197 6.88354 5.53102 6.69158L9.63103 4.64158C10.1436 5.24947 10.7952 5.5 11.5 5.5" stroke="currentColor" strokeWidth="1.5" />
  </svg>
)

export const LayoutDashboardIcon = ({ className, ...props }: IconProps) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} {...props}>
    <path d="M1.5 1.5H6.5V6.5H1.5V1.5Z" stroke="currentColor" strokeWidth="1.5" />
    <path d="M9.5 1.5H14.5V6.5H9.5V1.5Z" stroke="currentColor" strokeWidth="1.5" />
    <path d="M1.5 9.5H6.5V14.5H1.5V9.5Z" stroke="currentColor" strokeWidth="1.5" />
    <path d="M9.5 9.5H14.5V14.5H9.5V9.5Z" stroke="currentColor" strokeWidth="1.5" />
  </svg>
)

export const ShieldAlertIcon = ({ className, ...props }: IconProps) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} {...props}>
    <path d="M8 1.5L14.5 4.5V9.5C14.5 12.5 11.5 14 8 14.5C4.5 14 1.5 12.5 1.5 9.5V4.5L8 1.5Z" stroke="currentColor" strokeWidth="1.5" />
    <path d="M8 5V8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="8" cy="11" r="0.75" fill="currentColor" />
  </svg>
)
