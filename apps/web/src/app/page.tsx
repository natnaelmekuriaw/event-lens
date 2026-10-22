'use client';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import type { Workspace } from '@eventlens/contracts';
import { ArrowRight, Plus, Layers3 } from 'lucide-react';
import { DashboardShell } from '../components/dashboard-shell';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { FormMessage } from '../components/form-message';
import { useResource } from '../lib/use-resource';
import { api, errorMessage } from '../lib/api';

function Workspaces() {
  const resource = useResource<Workspace[]>('/workspaces');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const name = String(new FormData(event.currentTarget).get('name'));
    try {
      await api('/workspaces', { method: 'POST', body: { name } });
      setCreating(false);
      resource.refresh();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="mb-9 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs uppercase tracking-widest text-emerald-800">
            A place for every product
          </p>
          <h1 className="page-title">Your workspaces</h1>
          <p className="muted mt-2">
            Organize your projects and the people building them.
          </p>
        </div>
        <Button onClick={() => setCreating(!creating)}>
          <Plus size={16} aria-hidden="true" />
          New workspace
        </Button>
      </div>
      {creating && (
        <Card className="mb-6">
          <h2 className="mb-4 font-semibold">Create a workspace</h2>
          <form onSubmit={create} className="grid max-w-md gap-4">
            <label className="field">
              Workspace name
              <Input name="name" required maxLength={80} autoFocus />
            </label>
            <FormMessage error={error} />
            <div className="flex gap-3">
              <Button disabled={busy}>
                {busy ? 'Creating…' : 'Create workspace'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCreating(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}
      {resource.loading ? (
        <p role="status" className="muted">
          Loading workspaces…
        </p>
      ) : resource.error ? (
        <>
          <FormMessage error={resource.error} />
          <Button className="mt-4" onClick={resource.refresh}>
            Try again
          </Button>
        </>
      ) : resource.data?.length ? (
        <div className="grid gap-5 sm:grid-cols-2">
          {resource.data.map((workspace) => (
            <Link
              key={workspace.id}
              href={`/workspaces/${workspace.id}`}
              className="group rounded-2xl focus-visible:outline-2 focus-visible:outline-emerald-700"
            >
              <Card className="transition-colors group-hover:border-emerald-300">
                <div className="mb-7 flex items-center justify-between">
                  <span className="rounded-xl bg-emerald-50 p-3 text-emerald-800">
                    <Layers3 size={22} aria-hidden="true" />
                  </span>
                  <span className="rounded-full bg-stone-100 px-3 py-1 text-xs capitalize text-stone-600">
                    {workspace.role}
                  </span>
                </div>
                <h2 className="text-lg font-semibold">{workspace.name}</h2>
                <p className="muted mt-2">
                  View projects and workspace settings
                </p>
                <div className="mt-6 flex items-center gap-2 text-sm text-emerald-800">
                  Open workspace <ArrowRight size={15} aria-hidden="true" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <h2 className="font-semibold">Your first workspace starts here</h2>
          <p className="muted mt-2">
            Create a workspace to begin organizing projects, or ask an owner for
            an invitation.
          </p>
        </Card>
      )}
    </>
  );
}
export default function HomePage() {
  return (
    <DashboardShell>
      <Workspaces />
    </DashboardShell>
  );
}
