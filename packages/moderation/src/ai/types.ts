// =====================================================================
// 🤖 Types & Contrats du Moteur d'IA de Modération
// =====================================================================

export interface ModerationFlags {
  isNsfw: boolean;
  isCsam: boolean;
  isHate: boolean;
  isViolence: boolean;
  isSelfHarm: boolean;
}

export interface ModerationResult {
  safe: boolean;
  flagged: boolean;
  flags: ModerationFlags;
  reason?: string;
  flaggedCategories: string[];
  scores?: Record<string, number>;
}

export interface ModerateContentInput {
  text?: string;
  imageUrls?: string[];
  imageBase64List?: Array<{ base64: string; mimeType: string }>;
}

export interface IModerationProvider {
  moderate(input: ModerateContentInput): Promise<ModerationResult>;
}
