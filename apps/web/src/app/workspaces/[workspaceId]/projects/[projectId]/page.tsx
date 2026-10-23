'use client';
import Link from 'next/link';
import { use, useState, type FormEvent } from 'react';
import {
  canManageProjects,
  type Workspace,
  type Project,
} from '@eventlens/contracts';
import { DashboardShell } from '../../../../../components/dashboard-shell';
import { Card } from '../../../../../components/ui/card';
import { Button } from '../../../../../components/ui/button';
import { Input } from '../../../../../components/ui/input';
import { FormMessage } from '../../../../../components/form-message';
import { SecretValue } from '../../../../../components/secret-value';
import { useResource } from '../../../../../lib/use-resource';
import { api, errorMessage } from '../../../../../lib/api';

function ProjectSettings({
  workspaceId,
  projectId,
}: {
  workspaceId: string;
  projectId: string;
}) {
  const base = `/workspaces/${workspaceId}`;
  const path = `${base}/projects/${projectId}`;
  const workspace = useResource<Workspace>(base);
  const project = useResource<Project>(path);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const allowed = Boolean(
    workspace.data && canManageProjects(workspace.data.role),
  );
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    const form = new FormData(event.currentTarget);
    try {
      await api(path, {
        method: 'PATCH',
        body: { name: form.get('name'), timezone: form.get('timezone') },
      });
      setSuccess('Project settings saved.');
      project.refresh();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function rotate() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await api<{ key: string }>(`${path}/keys/rotate`, {
        method: 'POST',
      });
      setKey(result.key);
      setConfirm(false);
      project.refresh();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link
        href={base}
        className="mb-5 inline-block text-sm text-stone-500 hover:underline"
      >
        ← Projects
      </Link>
      <h1 className="page-title">{project.data?.name ?? 'Project settings'}</h1>
      <p className="muted mb-8 mt-2">Manage the basics for your product.</p>
      <FormMessage
        error={error ?? project.error ?? workspace.error}
        success={success}
      />
      {key && (
        <SecretValue
          title="Your new public project key"
          value={key}
          onDismiss={() => setKey(null)}
        />
      )}
      {project.loading ? (
        <p className="muted" role="status">
          Loading project…
        </p>
      ) : (
        project.data && (
          <div className="mt-5 grid gap-6">
            <Card>
              <h2 className="mb-5 font-semibold">General</h2>
              <form onSubmit={save} className="grid max-w-lg gap-5">
                <label className="field">
                  Project name
                  <Input
                    key={`name-${project.data.name}`}
                    name="name"
                    defaultValue={project.data.name}
                    required
                    maxLength={80}
                    disabled={!allowed}
                  />
                </label>
                <label className="field">
                  Reporting timezone
                  <Input
                    key={`timezone-${project.data.timezone}`}
                    name="timezone"
                    defaultValue={project.data.timezone}
                    required
                    maxLength={80}
                    disabled={!allowed}
                  />
                </label>
                {allowed && (
                  <Button className="justify-self-start" disabled={busy}>
                    Save changes
                  </Button>
                )}
              </form>
              {!allowed && (
                <p className="muted mt-4">
                  Your viewer role allows you to view these settings. An owner
                  or admin can change them.
                </p>
              )}
            </Card>
            <Card>
              <h2 className="font-semibold">Public project key</h2>
              <p className="muted mt-2">
                Used to send events from your application. This key cannot read
                analytics or manage your workspace.
              </p>
              <p className="my-5 font-mono text-sm">
                {project.data.keyPrefix}…
              </p>
              {allowed &&
                (confirm ? (
                  <div>
                    <p className="mb-4 text-sm text-amber-900">
                      Rotation invalidates the previous key immediately. Update
                      every integration using it.
                    </p>
                    <div className="flex gap-3">
                      <Button
                        variant="destructive"
                        disabled={busy}
                        onClick={rotate}
                      >
                        Confirm rotation
                      </Button>
                      <Button variant="ghost" onClick={() => setConfirm(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="outline" onClick={() => setConfirm(true)}>
                    Rotate key
                  </Button>
                ))}
            </Card>
            <Card className="border-dashed bg-transparent">
              <h2 className="font-semibold">Understand your product</h2>
              <p className="muted mt-2">
                See event trends, active users, popular features, and individual
                activity.
              </p>
              <Button asChild className="mt-4">
                <Link href={`${path}/analytics`}>Open analytics</Link>
              </Button>
            </Card>{' '}
            <Card className="border-dashed bg-transparent">
              <h2 className="font-semibold">Explore your events</h2>
              <p className="muted mt-2">
                Send events with the SDK, then inspect activity and delivery
                status in the event explorer.
              </p>
              <Button asChild className="mt-4">
                <Link href={`${path}/events`}>Open event explorer</Link>
              </Button>
            </Card>
            <Card className="border-dashed bg-transparent">
              <h2 className="font-semibold">Conversion paths</h2>
              <p className="muted mt-2">
                See how many people complete a sequence of product events.
              </p>
              <Button asChild className="mt-4">
                <Link href={`${path}/conversion-paths`}>
                  Open conversion paths
                </Link>
              </Button>
            </Card>
          </div>
        )
      )}
    </>
  );
}
export default function ProjectPage({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
}) {
  const ids = use(params);
  return (
    <DashboardShell>
      <ProjectSettings {...ids} />
    </DashboardShell>
  );
}
