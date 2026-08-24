import { ContentVisibility } from '@qoe/config';

export interface UserEntitlements {
  isMember: boolean; // Registered free subscriber (has provided email)
  isPaidSubscriber: boolean; // Active paid subscriber
  tierId?: string | null; // Optional specific subscription tier ID
}

export interface PaywallMeta {
  visibility: ContentVisibility;
  teaserParagraphsCount: number;
  requiredTierId?: string | null;
  totalLengthBytes: number;
  previewLengthBytes: number;
}

export interface PaywallCutResult {
  content: string;
  isTruncated: boolean;
  accessGranted: boolean;
  paywallMeta: PaywallMeta | null;
}

// Markers for paywall breaks across various editor outputs (Ghost, Lexical, TipTap, HTML comments)
const PAYWALL_MARKERS = [
  '<!--members-only-->',
  '<!--paywall-->',
  '<!--kg-gated-block:begin-->',
  '<!--qoe-paywall-->',
  'data-node-type="paywall"',
  'data-node-type="paywall-divider"',
  'data-type="paywall-divider"',
  'class="qoe-paywall-divider"',
  'class="paywall-divider"',
];

/**
 * Checks whether user entitlements meet the required content visibility rules.
 */
export function checkContentAccess(
  visibility: ContentVisibility = ContentVisibility.PUBLIC,
  entitlements: UserEntitlements,
  requiredTierId?: string | null
): boolean {
  if (visibility === ContentVisibility.PUBLIC) {
    return true;
  }

  if (visibility === ContentVisibility.MEMBERS_ONLY) {
    return entitlements.isMember || entitlements.isPaidSubscriber;
  }

  if (visibility === ContentVisibility.PAID_SUBSCRIBERS) {
    return entitlements.isPaidSubscriber;
  }

  if (visibility === ContentVisibility.TIER_SPECIFIC) {
    if (!entitlements.isPaidSubscriber) return false;
    if (!requiredTierId) return true;
    return entitlements.tierId === requiredTierId;
  }

  return true;
}

/**
 * Server-side zero-leak AST/HTML paywall truncation engine.
 * Ensures paid content bytes above the paywall marker are NEVER transmitted over the wire
 * to non-authorized visitors.
 */
export function sliceContentAtPaywall(
  rawContent: string,
  entitlements: UserEntitlements,
  visibility: ContentVisibility = ContentVisibility.PUBLIC,
  requiredTierId?: string | null
): PaywallCutResult {
  const totalLengthBytes = Buffer.byteLength(rawContent || '', 'utf-8');
  const accessGranted = checkContentAccess(visibility, entitlements, requiredTierId);

  // If access is granted, return full content
  if (accessGranted || !rawContent) {
    return {
      content: rawContent || '',
      isTruncated: false,
      accessGranted: true,
      paywallMeta: null,
    };
  }

  // Search for the first matching paywall marker
  let paywallIndex = -1;

  for (const marker of PAYWALL_MARKERS) {
    const index = rawContent.indexOf(marker);
    if (index !== -1 && (paywallIndex === -1 || index < paywallIndex)) {
      paywallIndex = index;
    }
  }

  let previewContent = '';
  let teaserParagraphsCount = 0;

  if (paywallIndex !== -1) {
    // Slice cleanly at the marker
    previewContent = rawContent.slice(0, paywallIndex).trim();
    // Count paragraph blocks in the preview
    const paragraphMatches = previewContent.match(/<\/p>/g);
    teaserParagraphsCount = paragraphMatches ? paragraphMatches.length : 1;
  } else {
    // Fallback: If no paywall marker is found in gated content, truncate to first 2 paragraphs
    const paragraphMatches = Array.from(rawContent.matchAll(/<\/p>/g));
    if (paragraphMatches.length >= 2 && paragraphMatches[1].index) {
      const cutEnd = paragraphMatches[1].index + 4; // Include </p>
      previewContent = rawContent.slice(0, cutEnd).trim();
      teaserParagraphsCount = 2;
    } else if (paragraphMatches.length === 1 && paragraphMatches[0].index) {
      const cutEnd = paragraphMatches[0].index + 4;
      previewContent = rawContent.slice(0, cutEnd).trim();
      teaserParagraphsCount = 1;
    } else {
      // If no paragraph tags, take first 500 characters
      previewContent = rawContent.slice(0, 500).trim();
      teaserParagraphsCount = 1;
    }
  }

  const previewLengthBytes = Buffer.byteLength(previewContent, 'utf-8');

  return {
    content: previewContent,
    isTruncated: true,
    accessGranted: false,
    paywallMeta: {
      visibility,
      teaserParagraphsCount,
      requiredTierId,
      totalLengthBytes,
      previewLengthBytes,
    },
  };
}
