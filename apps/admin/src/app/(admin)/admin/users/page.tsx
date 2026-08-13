import { prisma } from '@qoe/db/client';
import { DataTable } from './components/data-table';
import { columns, AdminUser } from './components/columns';

export default async function AdminUsers() {
  // Fetch all users for moderation
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isCertified: true,
      isShadowbanned: true,
      isSuspended: true,
      createdAt: true,
      subdomain: true,
    },
  });

  return (
    <div className="w-full max-w-5xl mx-auto space-y-10">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Users</h1>
        <p className="text-muted-foreground mt-2 text-sm">Modération & Management</p>
      </div>

      <DataTable columns={columns} data={users as AdminUser[]} />
    </div>
  );
}
