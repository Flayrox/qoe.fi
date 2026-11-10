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
import type { TemplateTeamMember, TemplatePublisherContext } from '../schema';

export interface PeopleSectionProps {
  publisher?: TemplatePublisherContext | null;
  members?: TemplateTeamMember[];
  title?: string;
  description?: string;
  className?: string;
  testId?: string;
}

export function PeopleSection({
  publisher,
  members,
  title = 'Équipe & Contributeurs',
  description,
  className,
  testId = 'people-section',
}: PeopleSectionProps) {
  // Résolution des membres : passés en props OU depuis publication.team OU fallback sur l'auteur
  const resolvedMembers: TemplateTeamMember[] = (() => {
    if (members && members.length > 0) return members;
    if (publisher?.team && publisher.team.length > 0) return publisher.team;

    // Repli gracieux : auteur principal / propriétaire de la publication
    const authorName = publisher?.author?.name || publisher?.name || 'Auteur';
    const authorUsername = publisher?.author?.username || null;
    const authorLogo = publisher?.author?.avatarUrl || publisher?.logoUrl || null;
    const authorBio = publisher?.author?.bio || publisher?.bio || null;

    return [
      {
        id: publisher?.id || 'owner',
        name: authorName,
        username: authorUsername,
        logoUrl: authorLogo,
        bio: authorBio,
        role: 'Fondateur & Auteur',
        isCertified: Boolean(publisher?.author?.name),
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
            publisherName={publisher?.name}
            publisherLogoUrl={publisher?.logoUrl}
            publicationDomain={publisher?.domain || publisher?.subdomain || null}
            publisherId={publisher?.id}
          />
        ))}
      </div>
    </section>
  );
}
