export interface AutosaveHashPayload {
  title: string;
  content: string;
  slug?: string;
  published?: boolean;
  status?: string;
  scheduledAt?: string | null;
  isPremium?: boolean;
  categoryId?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  imageUrl?: string | null;
  allowComments?: boolean;
  allowPublicAnnotations?: boolean;
  allowDownload?: boolean;
  attributions?: Array<{
    userId: string;
    role?: string;
    order?: number;
    isVisible?: boolean;
  }>;
}

/**
 * Empreinte déterministe du draft. Volontairement pure et stable :
 * l'initialisation du hash ne doit pas dépendre de l'identité des tableaux
 * (`initialAttributions = []` créait un nouveau tableau à chaque render et
 * réinitialisait le hash, provoquant des sauvegardes fantômes).
 */
export function computePayloadHash(payload: AutosaveHashPayload): string {
  return JSON.stringify({
    t: (payload.title || '').trim(),
    c: payload.content || '',
    s: payload.slug || '',
    pub: Boolean(payload.published),
    st: payload.status || 'DRAFT',
    sch: payload.scheduledAt || null,
    prem: Boolean(payload.isPremium),
    cat: payload.categoryId || null,
    stitle: (payload.seoTitle || '').trim(),
    sdesc: (payload.seoDescription || '').trim(),
    img: payload.imageUrl || null,
    comm: Boolean(payload.allowComments),
    ann: Boolean(payload.allowPublicAnnotations),
    dl: Boolean(payload.allowDownload),
    attr: (payload.attributions || []).map((a) => ({
      u: a.userId,
      r: a.role,
      o: a.order,
      v: a.isVisible,
    })),
  });
}
