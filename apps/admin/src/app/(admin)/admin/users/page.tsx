import { getAdminUsers } from '@/lib/admin-data';
import { DataTable } from './components/data-table';
import { columns, AdminUser } from './components/columns';

export default async function AdminUsers() {
  // Tous les utilisateurs pour la modération (Go en primaire, fallback Prisma dev).
  const users = await getAdminUsers();

  return (
    <div className="w-full max-w-5xl mx-auto space-y-10">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Users</h1>
        <p className="text-muted-foreground mt-2 text-sm">Modération & Management</p>
      </div>

      <DataTable
        columns={columns}
        data={
          users.map((u) => ({
            id: u.id,
            email: u.email,
            name: u.name,
            username: u.username,
            role: u.role,
            isCertified: u.isCertified,
            isShadowbanned: u.isShadowbanned,
            isSuspended: u.isSuspended,
            createdAt: new Date(u.createdAt),
            subdomain: u.subdomain,
          })) as AdminUser[]
        }
      />
    </div>
  );
}
