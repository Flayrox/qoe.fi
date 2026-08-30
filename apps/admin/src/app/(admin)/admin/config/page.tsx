import { getReservedIdentifiers, getSystemConfigs } from '@/lib/admin-data';
import {
  setSystemConfigAction,
  deleteSystemConfigAction,
  updateReservedIdentifiersAction,
} from '@/lib/admin-aux-actions';

export default async function AdminConfig() {
  const [configs, reservedUsernames, reservedSubdomains] = await Promise.all([
    getSystemConfigs(),
    getReservedIdentifiers('username'),
    getReservedIdentifiers('subdomain'),
  ]);

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
              ['subdomain', 'Subdomains', reservedSubdomains],
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
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border hover:bg-transparent">
              <th className="h-auto py-2 align-bottom text-muted-foreground font-semibold text-xs w-1/4">
                Key
              </th>
              <th className="h-auto py-2 align-bottom text-muted-foreground font-semibold text-xs w-1/4">
                Value
              </th>
              <th className="h-auto py-2 align-bottom text-muted-foreground font-semibold text-xs w-2/5">
                Description
              </th>
              <th className="h-auto py-2 align-bottom text-muted-foreground font-semibold text-xs text-right w-1/12">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {configs.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-16 text-center text-muted-foreground text-sm">
                  No configuration defined.
                </td>
              </tr>
            ) : (
              configs.map((c) => (
                <tr
                  key={c.key}
                  className="hover:bg-muted/50 border-b border-border/50 transition-colors duration-150 group"
                >
                  <td className="py-3 font-mono text-sm text-muted-foreground align-middle">
                    {c.key}
                  </td>

                  {/* Inline value and description update form */}
                  <td colSpan={2} className="py-3 align-middle">
                    <form action={handleUpdateConfig} className="w-full flex items-center gap-4">
                      <input type="hidden" name="key" value={c.key} />
                      <div className="w-1/2">
                        <textarea
                          name="value"
                          defaultValue={c.value}
                          rows={c.value.length > 80 || c.value.includes('\n') ? 3 : 1}
                          className="w-full bg-transparent border border-transparent px-2 py-1 text-sm text-muted-foreground focus:ring-1 focus:ring-ring resize-y shadow-none font-mono hover:bg-white hover:border-border focus:bg-white transition-all rounded outline-none"
                        />
                      </div>

                      <div className="w-full flex items-center gap-2">
                        <input
                          type="text"
                          name="description"
                          defaultValue={c.description || ''}
                          className="w-full bg-transparent border border-transparent px-2 py-1 text-sm text-muted-foreground focus:ring-1 focus:ring-ring shadow-none hover:bg-white hover:border-border focus:bg-white transition-all rounded outline-none"
                          placeholder="Add a description..."
                        />

                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="submit"
                            className="text-xs font-medium text-muted-foreground hover:text-foreground bg-white border border-border shadow-sm px-2 py-1 rounded"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    </form>
                  </td>

                  <td className="py-3 text-right align-middle">
                    <form
                      action={handleDeleteConfig}
                      className="inline-block opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <input type="hidden" name="key" value={c.key} />
                      <button
                        type="submit"
                        className="text-xs font-medium text-muted-foreground hover:text-destructive px-2 py-1"
                      >
                        Delete
                      </button>
                    </form>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
