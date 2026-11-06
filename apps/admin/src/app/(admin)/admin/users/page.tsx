import { getAdminUsers } from '@/lib/admin-data';
import { getAdminIdentity, requireCapability } from '@/lib/admin-identity';
import { UsersGrid, type AdminUserRow } from './components/users-grid';

export default async function AdminUsers() {
  requireCapability(await getAdminIdentity(), 'admin.users.read');

  // Tous les utilisateurs pour la modération (Go en primaire, fallback Prisma dev).
  const users = await getAdminUsers();

  const rows: AdminUserRow[] = users.map((user) => ({
    id: user.id,
    email: user.email,
    name: user.name,
    username: user.username,
    role: user.role,
    isCertified: user.isCertified,
    isShadowbanned: user.isShadowbanned,
    isSuspended: user.isSuspended,
    createdAt: String(user.createdAt),
    subdomain: user.subdomain,
  }));

  return (
    <div className="space-y-3">
      <UsersGrid users={rows} />
    </div>
  );
}
