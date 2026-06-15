import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const user = await prisma.user.upsert({
    where: { email: 'hello@qoe.fi' },
    update: {},
    create: {
      id: 'cmpb8heeb0000tlxgtrj9n1vy',
      email: 'hello@qoe.fi',
      name: 'Creator',
      articles: {
        create: [
          {
            title: 'Welcome to qoe.fi',
            slug: 'welcome-to-qoe-fi',
            content: 'This is the very first article on the sovereign media infrastructure.',
            published: true,
          },
          {
            title: 'The Brutalist Premium Manifesto',
            slug: 'brutalist-premium-manifesto',
            content: 'We believe in clear edges, pure contrast, and sovereign tech.',
            published: true,
          }
        ]
      }
    },
  })
  console.log({ user })

  // Seed initial trends
  const trend1 = await prisma.trend.upsert({
    where: { hashtag: '#attention' },
    update: { count: 1200 },
    create: { hashtag: '#attention', count: 1200 }
  })

  const trend2 = await prisma.trend.upsert({
    where: { hashtag: '#anti-ia' },
    update: { count: 840 },
    create: { hashtag: '#anti-ia', count: 840 }
  })

  const trend3 = await prisma.trend.upsert({
    where: { hashtag: '#souverainete' },
    update: { count: 520 },
    create: { hashtag: '#souverainete', count: 520 }
  })

  // Seed partner promotion
  const promo = await prisma.partnerPromo.upsert({
    where: { id: 'promo-premium-default' },
    update: {},
    create: {
      id: 'promo-premium-default',
      title: 'qoe.premium',
      description: 'Soutenez le journalisme libre et sans bruit. Profitez de l\'expérience de lecture ultime sur toutes nos publications.',
      ctaText: 'Découvrir l\'offre',
      ctaUrl: '/billing',
      isActive: true
    }
  })

  console.log({ trend1, trend2, trend3, promo })
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
