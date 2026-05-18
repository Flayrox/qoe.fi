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
