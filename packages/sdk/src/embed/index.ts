// Point d'entrée du module intégrable (fiche 02) : logique pure (embed.ts,
// testable sans navigateur) + couche navigateur (browser.ts, fetch/popup).
export {
  EmbedValidationError,
  buildSubscribePopupUrl,
  buildSubscribeRequest,
  cleanReturnUrl,
  isTrustedPopupOrigin,
  parsePopupResult,
  qoeLogoUrl,
  qoeSubscribeButtonHtml,
  type EmbedSubscribeInput,
  type QoeSubscribePopupInput,
  type QoeSubscribeResult,
} from './embed';
export {
  openQoeSubscribePopup,
  subscribeEmail,
  type PopupOutcome,
  type QoeSubscribePopupOptions,
} from './browser';
