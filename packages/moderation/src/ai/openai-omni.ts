// =====================================================================
// 🤖 OpenAI Omni-Moderation Provider — Texte & Images Multimodal
// =====================================================================
// Utilise le modèle universel gratuit `omni-moderation-latest` d'OpenAI.
// Accepte à la fois des segments textuels et des URLs d'images.
// =====================================================================

import type { IModerationProvider, ModerateContentInput, ModerationResult } from './types';

export interface OpenAiModeratorOptions {
  apiKey?: string;
  timeoutMs?: number;
}

export class OpenAiModerator implements IModerationProvider {
  private readonly apiKey: string | undefined;
  private readonly timeoutMs: number;

  constructor(options: OpenAiModeratorOptions = {}) {
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY;
    this.timeoutMs = options.timeoutMs || 4000;
  }

  async moderate(input: ModerateContentInput): Promise<ModerationResult> {
    // Si aucune clé ou clé mock en dev local : autoriser avec log
    if (!this.apiKey || this.apiKey === 'sk-mock' || this.apiKey.startsWith('sk-...')) {
      return {
        safe: true,
        flagged: false,
        flags: {
          isNsfw: false,
          isCsam: false,
          isHate: false,
          isViolence: false,
          isSelfHarm: false,
        },
        flaggedCategories: [],
      };
    }

    // Construction du payload multimodal pour omni-moderation-latest
    const formattedInputs: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];

    if (input.text && input.text.trim()) {
      formattedInputs.push({
        type: 'text',
        text: input.text.trim(),
      });
    }

    if (input.imageUrls && input.imageUrls.length > 0) {
      for (const url of input.imageUrls) {
        if (url) {
          formattedInputs.push({
            type: 'image_url',
            image_url: { url },
          });
        }
      }
    }

    if (input.imageBase64List && input.imageBase64List.length > 0) {
      for (const item of input.imageBase64List) {
        formattedInputs.push({
          type: 'image_url',
          image_url: { url: `data:${item.mimeType};base64,${item.base64}` },
        });
      }
    }

    if (formattedInputs.length === 0) {
      return {
        safe: true,
        flagged: false,
        flags: {
          isNsfw: false,
          isCsam: false,
          isHate: false,
          isViolence: false,
          isSelfHarm: false,
        },
        flaggedCategories: [],
      };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await fetch('https://api.openai.com/v1/moderations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: 'omni-moderation-latest',
          input: formattedInputs,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn('⚠️ Erreur OpenAI Moderation HTTP:', response.status);
        // Fail-safe : en cas d'indisponibilité de l'API externe, on n'interrompt pas le service critique
        return {
          safe: true,
          flagged: false,
          flags: {
            isNsfw: false,
            isCsam: false,
            isHate: false,
            isViolence: false,
            isSelfHarm: false,
          },
          flaggedCategories: [],
        };
      }

      const data = (await response.json()) as {
        results?: Array<{
          flagged: boolean;
          categories: Record<string, boolean>;
          category_scores: Record<string, number>;
        }>;
      };
      const results = data?.results || [];

      // Agrégation des résultats de chaque entrée
      let isFlagged = false;
      let isCsam = false;
      let isNsfw = false;
      let isHate = false;
      let isViolence = false;
      let isSelfHarm = false;
      const flaggedCategoriesSet = new Set<string>();
      const aggregatedScores: Record<string, number> = {};

      for (const res of results) {
        if (res.flagged) {
          isFlagged = true;
          const cats = res.categories || {};
          if (cats['sexual/minors']) isCsam = true;
          if (cats.sexual) isNsfw = true;
          if (cats.hate || cats['hate/threatening']) isHate = true;
          if (cats.violence || cats['violence/graphic']) isViolence = true;
          if (cats['self-harm'] || cats['self-harm/intent']) isSelfHarm = true;

          for (const [catKey, val] of Object.entries(cats)) {
            if (val) flaggedCategoriesSet.add(catKey);
          }
        }

        if (res.category_scores) {
          for (const [catKey, score] of Object.entries(res.category_scores)) {
            aggregatedScores[catKey] = Math.max(aggregatedScores[catKey] || 0, score);
          }
        }
      }

      const flaggedCategories = Array.from(flaggedCategoriesSet);
      const safe = !isFlagged;

      let reason: string | undefined;
      if (!safe) {
        reason = `Contenu non conforme détecté (${flaggedCategories.join(', ')}).`;
      }

      return {
        safe,
        flagged: isFlagged,
        flags: {
          isNsfw,
          isCsam,
          isHate,
          isViolence,
          isSelfHarm,
        },
        flaggedCategories,
        reason,
        scores: aggregatedScores,
      };
    } catch (error) {
      console.error('Erreur appel OpenAI Moderation:', error);
      return {
        safe: true,
        flagged: false,
        flags: {
          isNsfw: false,
          isCsam: false,
          isHate: false,
          isViolence: false,
          isSelfHarm: false,
        },
        flaggedCategories: [],
      };
    }
  }
}
