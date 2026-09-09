// =====================================================================
// 🛡️ @qoe/moderation — Package de Modération Trust & Safety 2026
// =====================================================================
// Fournit les modules :
// - email : Détection anti-jetables (2 500+ domaines) et normalisation anti-alias
// - identity : Protection des pseudos, décodage homoglyphes et leetspeak
// - text : Fast-path synchrone (< 1 ms) et chunker sliding window
// - image : Magic bytes inspection binaire physique
// - ai : Adaptateur OpenAI omni-moderation multimodal (texte & images)
// =====================================================================

export * from './email';
export * from './identity';
export * from './text';
export * from './image';
export * from './ai';
