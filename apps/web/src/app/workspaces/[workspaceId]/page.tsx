'use client';
import Link from 'next/link';
import { use, useState, type FormEvent } from 'react';
import { ArrowRight, Plus, Users } from 'lucide-react';
import {
  canManageProjects,
  type Workspace,
  type Project,
  type Page,
} from '@eventlens/contracts';
import { DashboardShell } from '../../../components/dashboard-shell';
import { Card } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { FormMessage } from '../../../components/form-message';
import { SecretValue } from '../../../components/secret-value';
import { useResource } from '../../../lib/use-resource';
import { api, errorMessage } from '../../../lib/api';

function Projects({ workspaceId }: { workspaceId: string }) {
  const base = `/workspaces/${workspaceId}`;
  const workspace = useResource<Workspace>(base);
  const [cursor, setCursor] = useState<string | null>(null);
  const projects = useResource<Page<Project>>(
    `${base}/projects?limit=20${cursor ? `&cursor=${cursor}` : ''}`,
  );
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const allowed = workspace.data && canManageProjects(workspace.data.role);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const result = await api<{ key: string }>(`${base}/projects`, {
        method: 'POST',
        body: { name: form.get('name'), timezone: form.get('timezone') },
      });
      setKey(result.key);
      setCreating(false);
      setCursor(null);
      projects.refresh();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link
        href="/"
        className="mb-5 inline-block text-sm text-stone-500 hover:underline"
      >
        ← Workspaces
      </Link>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="page-title">{workspace.data?.name ?? 'Workspace'}</h1>
          <p className="muted mt-2">
            One home for the products you’re building.
          </p>
        </div>
        <div className="flex gap-3">
          {workspace.data?.role !== 'viewer' && workspace.data && (
            <Button asChild variant="outline">
              <Link href={`${base}/team`}>
                <Users size={15} aria-hidden="true" />
                Team
              </Link>
            </Button>
          )}
          {allowed && (
            <Button onClick={() => setCreating(!creating)}>
              <Plus size={15} aria-hidden="true" />
              New project
            </Button>
          )}
        </div>
      </div>
      <FormMessage error={workspace.error} />
      {key && (
        <SecretValue
          title="Your public project key"
          value={key}
          onDismiss={() => setKey(null)}
        />
      )}
      {creating && (
        <Card className="mb-6">
          <h2 className="mb-4 font-semibold">Create a project</h2>
          <form onSubmit={create} className="grid max-w-md gap-4">
            <label className="field">
              Project name
              <Input
                name="name"
                required
                maxLength={80}
                placeholder="GalaxyBalls"
                autoFocus
              />
            </label>
            <label className="field">
              Reporting timezone
              <Input
                name="timezone"
                defaultValue="UTC"
                required
                maxLength={80}
                placeholder="Africa/Nairobi"
              />
              <span className="muted font-normal">
                An IANA timezone, such as UTC or Africa/Nairobi.
              </span>
            </label>
            <FormMessage error={error} />
            <div className="flex gap-3">
              <Button disabled={busy}>
                {busy ? 'Creating…' : 'Create project'}
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
      <h2 className="mb-4 text-sm font-semibold">Projects</h2>
      {projects.loading ? (
        <p role="status" className="muted">
          Loading projects…
        </p>
      ) : projects.error ? (
        <>
          <FormMessage error={projects.error} />
          <Button className="mt-4" onClick={projects.refresh}>
            Try again
          </Button>
        </>
      ) : projects.data?.items.length ? (
        <div className="grid gap-4">
          {projects.data.items.map((project) => (
            <Link href={`${base}/projects/${project.id}`} key={project.id}>
              <Card className="flex items-center justify-between gap-4 hover:border-emerald-300">
                <div>
                  <h3 className="font-semibold">{project.name}</h3>
                  <p className="muted mt-1">
                    {project.timezone} ·{' '}
                    <span className="font-mono text-xs">
                      {project.keyPrefix}…
                    </span>
                  </p>
                </div>
                <ArrowRight
                  size={18}
                  aria-hidden="true"
                  className="text-stone-400"
                />
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card className="py-12 text-center">
          <h3 className="text-lg font-semibold">
            Give your next project a home
          </h3>
          <p className="muted mt-2">
            {allowed
              ? 'Create a project to prepare its tracking key and reporting settings.'
              : 'A workspace owner or admin can create the first project.'}
          </p>
        </Card>
      )}
      <div className="mt-5 flex gap-3">
        {cursor && (
          <Button variant="outline" onClick={() => setCursor(null)}>
            First page
          </Button>
        )}
        {projects.data?.nextCursor && (
          <Button
            variant="outline"
            onClick={() => setCursor(projects.data!.nextCursor)}
          >
            Next page
          </Button>
        )}
      </div>
    </>
  );
}
export default function WorkspacePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = use(params);
  return (
    <DashboardShell>
      <Projects workspaceId={workspaceId} />
    </DashboardShell>
  );
}
