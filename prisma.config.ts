// =====================================================================
// ⚙️ prisma.config.ts — Configuration Prisma CLI
// =====================================================================
// 📖 Pointe vers la source unique : packages/db/prisma/
//    Le schema, les migrations et le seed vivent tous dans @qoe/db.
// =====================================================================

import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'packages/db/prisma/schema.prisma',
  migrations: {
    path: 'packages/db/prisma/migrations',
    seed: 'tsx packages/db/prisma/seed.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'] || '',
  },
});
