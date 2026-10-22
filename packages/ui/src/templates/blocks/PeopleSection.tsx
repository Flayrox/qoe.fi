'use client';

// =====================================================================
// PeopleSection.tsx — Section Équipe / Contributeurs (Standard Éditorial Qoefi)
// =====================================================================
// Affiche :
// - Titre de section "Équipe" ou "Contributeurs"
// - Grille responsive compacte de cartes PersonCard (320px)
// - État propre mettant en valeur le créateur fondateur ou l'équipe
// =====================================================================

import React from 'react';
import { cn } from '@qoe/utils';
import { PersonCard } from './PersonCard';
import type { TemplateTeamMember, TemplatePublicationContext } from '../schema';

export interface PeopleSectionProps {
  publication?: TemplatePublicationContext | null;
  members?: TemplateTeamMember[];
  title?: string;
  description?: string;
  className?: string;
  testId?: string;
}

export function PeopleSection({
  publication,
  members,
  title = 'Équipe & Contributeurs',
  description,
  className,
  testId = 'people-section',
}: PeopleSectionProps) {
  // Résolution des membres : passés en props OU depuis publication.team OU fallback sur l'auteur
  const resolvedMembers: TemplateTeamMember[] = (() => {
    if (members && members.length > 0) return members;
    if (publication?.team && publication.team.length > 0) return publication.team;

    // Repli gracieux : auteur principal / propriétaire de la publication
    const authorName = publication?.author?.name || publication?.name || 'Auteur';
    const authorUsername = publication?.author?.username || null;
    const authorLogo = publication?.author?.avatarUrl || publication?.logoUrl || null;
    const authorBio = publication?.author?.bio || publication?.bio || null;

    return [
      {
        id: publication?.id || 'owner',
        name: authorName,
        username: authorUsername,
        logoUrl: authorLogo,
        bio: authorBio,
        role: 'Fondateur & Auteur',
        isCertified: Boolean(publication?.author?.name),
      },
    ];
  })();

  if (resolvedMembers.length === 0) return null;

  return (
    <section data-testid={testId} className={cn('space-y-4', className)}>
      <div className="space-y-1">
        <h2 className="text-base sm:text-lg font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {description && <p className="text-xs sm:text-sm text-muted-foreground">{description}</p>}
      </div>

      <div className="flex flex-wrap gap-3.5">
        {resolvedMembers.map((member) => (
          <PersonCard
            key={member.id || member.username || member.name}
            id={member.id}
            name={member.name}
            username={member.username}
            avatarUrl={member.logoUrl}
            bio={member.bio}
            role={member.role}
            isCertified={member.isCertified}
            publicationName={publication?.name}
            publicationLogoUrl={publication?.logoUrl}
            publicationDomain={publication?.domain || publication?.subdomain || null}
            publicationId={publication?.id}
          />
        ))}
      </div>
    </section>
  );
}
