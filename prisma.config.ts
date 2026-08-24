// =====================================================================
// ⚙️ prisma.config.ts — Configuration Prisma CLI
// =====================================================================
// 📖 Pointe vers la source unique : packages/db/prisma/
//    Le schema vit dans @qoe/db (le seed et les migrations ont migré en Go :
//    apps/api/cmd/seed + apps/api/sql/migrations).
// =====================================================================

import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'packages/db/prisma/schema.prisma',
  migrations: {
    path: 'packages/db/prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'] || '',
  },
});
