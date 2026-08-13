import { prisma } from '../client';

export const recommendationsRepository = {
  /**
   * Adds a Substack-style creator recommendation.
   */
  async addRecommendation(recommenderId: string, recommendedId: string, description?: string) {
    if (recommenderId === recommendedId) {
      throw new Error('A creator cannot recommend themselves');
    }

    return prisma.recommendation.upsert({
      where: {
        recommenderId_recommendedId: {
          recommenderId,
          recommendedId,
        },
      },
      update: {
        description,
      },
      create: {
        recommenderId,
        recommendedId,
        description,
      },
      include: {
        recommended: {
          select: {
            id: true,
            name: true,
            username: true,
            subdomain: true,
            customDomain: true,
            heroText: true,
            logoUrl: true,
            accentColor: true,
          },
        },
      },
    });
  },

  /**
   * Removes a creator recommendation.
   */
  async removeRecommendation(recommenderId: string, recommendedId: string) {
    return prisma.recommendation.deleteMany({
      where: {
        recommenderId,
        recommendedId,
      },
    });
  },

  /**
   * Lists all creators recommended by a specific creator.
   */
  async getCreatorRecommendations(recommenderId: string) {
    return prisma.recommendation.findMany({
      where: { recommenderId },
      orderBy: { createdAt: 'desc' },
      include: {
        recommended: {
          select: {
            id: true,
            name: true,
            username: true,
            subdomain: true,
            customDomain: true,
            heroText: true,
            logoUrl: true,
            accentColor: true,
          },
        },
      },
    });
  },

  /**
   * Lists all creators who recommend a specific creator (network back-links).
   */
  async getRecommendingCreators(recommendedId: string) {
    return prisma.recommendation.findMany({
      where: { recommendedId },
      orderBy: { createdAt: 'desc' },
      include: {
        recommender: {
          select: {
            id: true,
            name: true,
            username: true,
            subdomain: true,
            customDomain: true,
            heroText: true,
            logoUrl: true,
            accentColor: true,
          },
        },
      },
    });
  },
};
