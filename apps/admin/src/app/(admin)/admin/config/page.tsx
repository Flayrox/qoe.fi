import { Button } from '@qoe/ui/button';
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from '@qoe/ui/table';
import {
  getReservedIdentifiers,
  getSystemConfigs,
  getAdminFeatureFlags,
  getApiAccessModules,
  getAllowlist,
} from '@/lib/admin-data';
import {
  setSystemConfigAction,
  deleteSystemConfigAction,
  updateReservedIdentifiersAction,
} from '@/lib/admin-aux-actions';
import { AuthMethodsToggles } from './components/AuthMethodsToggles';
import { ApiAccessModulesToggles } from './components/ApiAccessModulesToggles';
import { ApiAccessControlCard } from './components/ApiAccessControlCard';
import { FeatureFlagsToggles } from './components/FeatureFlagsToggles';
import { RegistrationsControl } from './components/RegistrationsControl';
import { getAdminIdentity, requireCapability } from '@/lib/admin-identity';

function parseDisabledEndpoints(raw?: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((p) => typeof p === 'string') : [];
  } catch {
    return [];
  }
}

export default async function AdminConfig() {
  requireCapability(await getAdminIdentity(), 'admin.config.read');

  // Include the platform defaults in the editor so the admin can see and
  // extend the complete denylist rather than unknowingly replacing it.
  const defaultReservedSubdomains = [
    'admin',
    'api',
    'app',
    'auth',
    'billing',
    'blog',
    'cdn',
    'dashboard',
    'dev',
    'developer',
    'developers',
    'docs',
    'download',
    'email',
    'feed',
    'files',
    'help',
    'home',
    'login',
    'mail',
    'main',
    'media',
    'metrics',
    'onboarding',
    'payments',
    'portal',
    'qoe',
    'root',
    'search',
    'settings',
    'staging',
    'start',
    'static',
    'status',
    'store',
    'studio',
    'support',
    'system',
    'uploads',
    'web',
    'www',
  ];
  const [
    configs,
    reservedUsernames,
    reservedSubdomains,
    featureFlags,
    apiAccessModules,
    allowlist,
  ] = await Promise.all([
    getSystemConfigs(),
    getReservedIdentifiers('username'),
    getReservedIdentifiers('subdomain'),
    getAdminFeatureFlags(),
    getApiAccessModules(),
    getAllowlist(),
  ]);
  const visibleReservedSubdomains = Array.from(
    new Set([...defaultReservedSubdomains, ...reservedSubdomains])
  );

  // Server Actions bound inside the component
  async function handleAddConfig(formData: FormData) {
    'use server';
    const key = formData.get('key') as string;
    const value = formData.get('value') as string;
    const description = formData.get('description') as string;

    if (!key || !value) return;
    await setSystemConfigAction({
      key: key.trim().toUpperCase(),
      value: value.trim(),
      description: description?.trim(),
    });
  }

  async function handleUpdateConfig(formData: FormData) {
    'use server';
    const key = formData.get('key') as string;
    const value = formData.get('value') as string;
    const description = formData.get('description') as string;

    if (!key || !value) return;
    await setSystemConfigAction({
      key: key.trim().toUpperCase(),
      value: value.trim(),
      description: description?.trim(),
    });
  }

  async function handleUpdateReserved(formData: FormData) {
    'use server';
    const kind = formData.get('kind') as 'username' | 'subdomain';
    const values = String(formData.get('values') || '')
      .split(/[\\n,\\r ]+/)
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    await updateReservedIdentifiersAction(kind, values);
  }

  async function handleDeleteConfig(formData: FormData) {
    'use server';
    const key = formData.get('key') as string;
    if (!key) return;
    await deleteSystemConfigAction(key);
  }

  return (
    <div className="w-full max-w-5xl mx-auto space-y-12">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Config</h1>
        <p className="text-muted-foreground mt-2 text-sm">System & Feature Flags</p>
      </div>

      {/* 🚩 Feature Flags pilotables en direct */}
      <FeatureFlagsToggles initialFlags={featureFlags} />

      {/* 🚪 Inscriptions : kill-switch + allowlist d'invitation */}
      <RegistrationsControl
        initialOpen={configs.find((c) => c.key === 'ALLOW_NEW_REGISTRATIONS')?.value !== 'false'}
        initialAllowlist={allowlist}
      />

      {/* Méthodes de connexion — toggles dédiés (Google en test, etc.) */}
      <AuthMethodsToggles initialValue={configs.find((c) => c.key === 'AUTH_METHODS')?.value} />

      {/* Permissions d'accès API — registre modulable (API entrante / sortante / OAuth) */}
      <ApiAccessModulesToggles initialModules={apiAccessModules} />

      {/* Contrôle d'accès global — coupure générale + endpoints désactivés */}
      <ApiAccessControlCard
        initialDisabled={configs.find((c) => c.key === 'API_ACCESS_DISABLED')?.value === 'true'}
        initialEndpoints={parseDisabledEndpoints(
          configs.find((c) => c.key === 'API_DISABLED_ENDPOINTS')?.value
        )}
      />

      {/* Add new Config Minimal Form */}
      <div className="mb-12">
        <form
          action={handleAddConfig}
          className="flex flex-col md:flex-row items-end gap-4 border-b border-border pb-6"
        >
          <div className="flex-1 w-full space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Key</label>
            <input
              type="text"
              name="key"
              placeholder="ALLOW_NEW_REGISTRATIONS"
              className="w-full bg-transparent border-none px-0 py-1.5 text-base font-medium text-foreground placeholder:text-muted-foreground focus:ring-0 shadow-none"
              required
            />
          </div>

          <div className="flex-1 w-full space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Value</label>
            <input
              type="text"
              name="value"
              placeholder="true"
              className="w-full bg-transparent border-none px-0 py-1.5 text-base font-medium text-foreground placeholder:text-muted-foreground focus:ring-0 shadow-none"
              required
            />
          </div>

          <div className="flex-1 w-full space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <input
              type="text"
              name="description"
              placeholder="Context..."
              className="w-full bg-transparent border-none px-0 py-1.5 text-base font-medium text-foreground placeholder:text-muted-foreground focus:ring-0 shadow-none"
            />
          </div>

          <div className="shrink-0 mb-1">
            <button
              type="submit"
              className="text-sm font-medium text-foreground hover:text-[#EE4B2B] transition-colors bg-secondary hover:bg-border px-3 py-1.5 rounded-lg"
            >
              Add
            </button>
          </div>
        </form>
      </div>

      {/* Protected identifiers are edited as a dedicated allowlisted setting,
          not as arbitrary feature-flag text. The API validates the kind and
          still keeps hard-coded route protections as a final safety net. */}
      <section className="space-y-5 border-y border-border py-8">
        <div>
          <h2 className="text-xl font-semibold">Protected identifiers</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            One username or subdomain per line. Matching is case-insensitive.
          </p>
        </div>
        <div className="grid gap-8 md:grid-cols-2">
          {(
            [
              ['username', 'Usernames', reservedUsernames],
              ['subdomain', 'Subdomains', visibleReservedSubdomains],
            ] as const
          ).map(([kind, label, values]) => (
            <form key={kind} action={handleUpdateReserved} className="space-y-3">
              <input type="hidden" name="kind" value={kind} />
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">{label}</span>
                <textarea
                  name="values"
                  defaultValue={values.join('\\n')}
                  rows={8}
                  className="w-full rounded-lg border border-border bg-transparent px-3 py-2 font-mono text-sm"
                  aria-label={`${label} protégés`}
                />
              </label>
              <button
                type="submit"
                className="rounded-lg bg-secondary px-3 py-1.5 text-sm font-medium hover:bg-border"
              >
                Save {label.toLowerCase()}
              </button>
            </form>
          ))}
        </div>
      </section>

      {/* Feature Flags Table */}
      <div className="w-full">
        <Table aria-label="Configurations système" size="md">
          <TableHeader>
            <TableColumn isRowHeader className="w-1/4">
              Key
            </TableColumn>
            <TableColumn className="w-1/4">Value</TableColumn>
            <TableColumn className="w-2/5">Description</TableColumn>
            <TableColumn className="text-right w-1/12">Actions</TableColumn>
          </TableHeader>
          <TableBody items={configs} emptyState="No configuration defined.">
            {(c) => (
              <TableRow key={c.key} id={c.key} className="group">
                <TableCell className="font-mono text-xs text-muted-foreground">{c.key}</TableCell>
                <TableCell>
                  <form id={`form-val-${c.key}`} action={handleUpdateConfig}>
                    <input type="hidden" name="key" value={c.key} />
                    <textarea
                      name="value"
                      defaultValue={c.value}
                      rows={c.value.length > 80 || c.value.includes('\n') ? 3 : 1}
                      className="w-full bg-transparent border border-border/50 px-2 py-1 text-xs text-foreground focus:ring-1 focus:ring-ring resize-y shadow-none font-mono rounded outline-none"
                    />
                  </form>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      form={`form-val-${c.key}`}
                      name="description"
                      defaultValue={c.description || ''}
                      className="w-full bg-transparent border border-border/50 px-2 py-1 text-xs text-foreground focus:ring-1 focus:ring-ring shadow-none rounded outline-none"
                      placeholder="Add a description..."
                    />
                    <Button
                      type="submit"
                      form={`form-val-${c.key}`}
                      variant="outline"
                      size="xs"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      Save
                    </Button>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <form
                    action={handleDeleteConfig}
                    className="inline-block opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <input type="hidden" name="key" value={c.key} />
                    <Button type="submit" variant="ghost" tone="danger" size="xs">
                      Delete
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
