import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const u = await p.user.findFirst({ select: { id: true, username: true } });
console.log(u ? `${u.id}|${u.username}` : '');
await p.$disconnect();
