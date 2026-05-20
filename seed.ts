import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const userId = '12345678-1234-1234-1234-123456789012';

  // 1. Create Navigation
  await prisma.navigationItem.createMany({
    data: [
      { label: 'Accueil', url: '/', order: 1, userId },
      { label: 'Politique', url: '/category/politique', order: 2, userId },
      { label: 'Écologie', url: '/category/ecologie', order: 3, userId },
      { label: 'Notre Équipe', url: '/about', order: 4, userId },
    ],
    skipDuplicates: true,
  });

  // 2. Create Socials
  await prisma.socialLink.createMany({
    data: [
      { platform: 'x', url: 'https://twitter.com/mediamilitant', order: 1, userId },
      { platform: 'bluesky', url: 'https://bsky.app/profile/mediamilitant.bsky.social', order: 2, userId },
      { platform: 'youtube', url: 'https://youtube.com/mediamilitant', order: 3, userId },
      { platform: 'mastodon', url: 'https://mastodon.social/@mediamilitant', order: 4, userId },
    ],
    skipDuplicates: true,
  });

  // 3. Create Categories
  const cat = await prisma.category.upsert({
    where: { slug_userId: { slug: 'politique', userId } },
    update: {},
    create: {
      name: 'Politique',
      slug: 'politique',
      userId,
    }
  });

  await prisma.category.upsert({
    where: { slug_userId: { slug: 'international', userId } },
    update: {},
    create: {
      name: 'International',
      slug: 'international',
      parentId: cat.id,
      userId,
    }
  });

  console.log('Seed reussi pour les données dynamiques');
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect()
  })
