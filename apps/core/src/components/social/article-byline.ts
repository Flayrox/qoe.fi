// =====================================================================
// ✍️ article-byline.ts — résolution média/auteur d'un article (source unique)
// =====================================================================
// Le tiroir de lecture et l'annotateur affichent la même signature. Elle était
// écrite deux fois et les deux copies avaient divergé (R132) : le tiroir
// comparait le nom du média à `author.name`, l'annotateur à
// `author.journalist.name` — pour un média dont le compte porte le nom du
// média mais dont le journaliste signe, les deux surfaces ne disaient donc pas
// la même chose. Une seule résolution ici, deux consommateurs : corriger la
// règle, c'est corriger les deux écrans.
// =====================================================================

export interface ArticleBylineJournalist {
  id: string;
  name: string | null;
  username: string | null;
  logoUrl: string | null;
  isCertified?: boolean;
}

export interface ArticleBylineAuthor {
  id?: string | null;
  name?: string | null;
  username?: string | null;
  logoUrl?: string | null;
  subdomain?: string | null;
  isCertified?: boolean;
  type?: string | null;
  journalist?: ArticleBylineJournalist | null;
}

export interface ArticleBylinePublisher {
  id?: string | null;
  type?: string | null;
  name?: string | null;
  slug?: string | null;
  subdomain?: string | null;
  logoUrl?: string | null;
  isCertified?: boolean;
}

export interface ArticleBylineSource {
  publisher?: ArticleBylinePublisher | null;
  author?: ArticleBylineAuthor | null;
}

export interface ArticleByline {
  isMedia: boolean;
  mediaName: string;
  mediaHandle: string;
  mediaLogo: string | null;
  mediaCertified: boolean;
  writerId: string;
  writerName: string;
  writerHandle: string;
  writerAvatar: string | null;
  writerCertified: boolean;
  personalAuthorName: string;
  personalAuthorHandle: string;
  personalAuthorAvatar: string | null;
  personalAuthorCertified: boolean;
  authorName: string;
  authorHandle: string;
  targetFollowId: string | undefined;
  /** Libellé compact du tiroir : « Média · par Journaliste » ou le nom seul. */
  subtitle: string;
}

/**
 * Résout la signature d'un article : émetteur média (nom, handle, logo,
 * certification) et rédacteur (journaliste quand il est connu), plus la forme
 * personnelle et le libellé compact du tiroir. Tolère les deux absences
 * (ni publisher, ni author) sans jeter.
 */
export function resolveArticleByline(article: ArticleBylineSource): ArticleByline {
  const publisher = article.publisher ?? null;
  const author = article.author ?? null;

  // Un article est un article de média si : le publisher est média, ou le
  // compte auteur est média, ou le nom du média diffère de celui du rédacteur
  // (le journaliste signataire quand il est connu — c'est lui qui signe).
  const writerSignature = author?.journalist?.name || author?.name || '';
  const isMedia =
    publisher?.type === 'MEDIA' ||
    author?.type === 'MEDIA' ||
    Boolean(
      publisher?.name &&
      publisher.name.trim().toLowerCase() !== writerSignature.trim().toLowerCase()
    );

  // Émetteur principal pour un média :
  const mediaName = publisher?.name || (author?.type === 'MEDIA' ? author?.name : null) || 'Média';
  const mediaHandle =
    publisher?.subdomain ||
    publisher?.slug ||
    (author?.type === 'MEDIA' ? author?.username || author?.subdomain : null) ||
    '';
  const mediaLogo =
    publisher?.logoUrl || (author?.type === 'MEDIA' ? author?.logoUrl : null) || null;
  const mediaCertified = Boolean(
    publisher?.isCertified || (author?.type === 'MEDIA' && author?.isCertified)
  );

  // Journaliste / rédacteur individuel :
  const writerObj = author?.journalist || (author?.type !== 'MEDIA' ? author : null) || null;
  const writerId =
    writerObj?.id || (author?.name && author.name !== mediaName ? author.id : null) || '';
  const writerName =
    writerObj?.name || (author?.name && author.name !== mediaName ? author.name : null) || 'Auteur';
  const writerHandle =
    writerObj?.username ||
    (author?.username && author.username !== mediaHandle ? author.username : null) ||
    '';
  const writerAvatar =
    writerObj?.logoUrl || (author?.logoUrl !== mediaLogo ? author?.logoUrl : null) || null;
  const writerCertified = Boolean(
    writerObj?.isCertified ??
    (author?.name && author.name !== mediaName ? author?.isCertified : false)
  );

  // Émetteur pour un article personnel (hors média) :
  const personalAuthorName = author?.name || author?.username || 'Auteur';
  const personalAuthorHandle = author?.username || author?.subdomain || '';
  const personalAuthorAvatar = author?.logoUrl || null;
  const personalAuthorCertified = Boolean(author?.isCertified);

  const authorName = isMedia ? mediaName : personalAuthorName;
  const authorHandle = isMedia ? mediaHandle : personalAuthorHandle;
  const targetFollowId = isMedia
    ? publisher?.id || author?.id || undefined
    : author?.id || undefined;

  // Libellé compact du tiroir. Média avec un journaliste distinct : « Média ·
  // par Journaliste » ; média seul : son nom ; personnel : la signature du
  // rédacteur, puis son handle, puis le slug du publisher.
  const drawerMedia = publisher?.name || '';
  const subtitle = isMedia
    ? drawerMedia && writerSignature && drawerMedia !== writerSignature
      ? `${drawerMedia} · par ${writerSignature}`
      : drawerMedia || writerSignature || ''
    : writerSignature || author?.username || publisher?.slug || '';

  return {
    isMedia,
    mediaName,
    mediaHandle,
    mediaLogo,
    mediaCertified,
    writerId,
    writerName,
    writerHandle,
    writerAvatar,
    writerCertified,
    personalAuthorName,
    personalAuthorHandle,
    personalAuthorAvatar,
    personalAuthorCertified,
    authorName,
    authorHandle,
    targetFollowId,
    subtitle,
  };
}
