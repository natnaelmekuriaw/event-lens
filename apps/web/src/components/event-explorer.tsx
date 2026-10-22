'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import type {
  Page,
  Project,
  StoredEvent,
  Workspace,
} from '@eventlens/contracts';
import { useResource } from '../lib/use-resource';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card } from './ui/card';
import { FormMessage } from './form-message';
import { ProcessingStatus } from './processing-status';

export function EventExplorer({
  workspaceId,
  projectId,
}: {
  workspaceId: string;
  projectId: string;
}) {
  const router = useRouter();
  const base = `/workspaces/${workspaceId}/projects/${projectId}`;
  const project = useResource<Project>(base);
  const workspace = useResource<Workspace>(`/workspaces/${workspaceId}`);
  const projects = useResource<Page<Project>>(
    `/workspaces/${workspaceId}/projects?limit=100`,
  );
  const [filters, setFilters] = useState('');
  const [cursors, setCursors] = useState<string[]>([]);
  const [live, setLive] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const cursor = cursors.at(-1);
  const events = useResource<Page<StoredEvent>>(
    `${base}/events?limit=25&${filters}${cursor ? '&cursor=' + cursor : ''}`,
  );
  const detail = useResource<StoredEvent>(
    selected ? `${base}/events/${selected}` : null,
  );
  useEffect(() => {
    if (!live || cursor) return;
    const timer = setInterval(events.refresh, 5000);
    return () => clearInterval(timer);
  }, [live, cursor, events.refresh]);
  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const query = new URLSearchParams();
    for (const key of ['name', 'actor', 'from', 'to']) {
      const value = String(form.get(key) ?? '').trim();
      if (value)
        query.set(
          key,
          key === 'from' || key === 'to'
            ? new Date(value + 'Z').toISOString()
            : value,
        );
    }
    setFilters(query.toString());
    setCursors([]);
    setSelected(null);
  }
  return (
    <>
      <Link
        href={`/workspaces/${workspaceId}`}
        className="text-sm text-stone-500 hover:underline"
      >
        ← Projects
      </Link>
      <div className="my-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="muted mb-1">Event explorer</p>
          <h1 className="page-title">
            {project.data?.name ?? 'Project events'}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <label className="field">
            Project
            <select
              className="select"
              value={projectId}
              onChange={(event) =>
                router.push(
                  `/workspaces/${workspaceId}/projects/${event.target.value}/events`,
                )
              }
            >
              {!projects.data?.items.some((p) => p.id === projectId) && (
                <option value={projectId}>
                  {project.data?.name ?? 'Current project'}
                </option>
              )}
              {projects.data?.items.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <Button asChild variant="outline">
            <Link href={base}>Settings</Link>
          </Button>
        </div>
      </div>
      <FormMessage
        error={
          project.error ?? workspace.error ?? projects.error ?? events.error
        }
      />
      <ProcessingStatus
        base={base}
        canManage={
          workspace.data?.role === 'owner' || workspace.data?.role === 'admin'
        }
      />
      <Card className="mt-6">
        <form
          onSubmit={filter}
          className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-5"
        >
          <label className="field">
            Event name
            <Input name="name" placeholder="Exact event name" maxLength={100} />
          </label>
          <label className="field">
            User or anonymous ID
            <Input
              name="actor"
              placeholder="Exact identifier"
              maxLength={200}
            />
          </label>
          <label className="field">
            From (UTC)
            <Input name="from" type="datetime-local" />
          </label>
          <label className="field">
            To (UTC)
            <Input name="to" type="datetime-local" />
          </label>
          <Button>Apply filters</Button>
        </form>
        <div className="my-5 flex flex-wrap items-center justify-between gap-3">
          <p className="muted">
            Newest occurrence first. Times below use{' '}
            {project.data?.timezone ?? 'UTC'}. Filters use UTC.
          </p>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={live}
                onChange={(event) => {
                  setLive(event.target.checked);
                  setCursors([]);
                }}
              />
              Live updates
            </label>
            <Button variant="outline" onClick={events.refresh}>
              Refresh events
            </Button>
          </div>
        </div>
        {events.loading ? (
          <p role="status" className="muted py-8">
            Loading events…
          </p>
        ) : events.data?.items.length === 0 ? (
          <div className="py-10">
            <h2 className="font-semibold">No events match yet</h2>
            <p className="muted mt-2">
              Send events with the SDK or run the GalaxyBalls demo. Pending
              receipts appear after the worker processes them.
            </p>
            <Link
              href={base}
              className="mt-4 inline-block text-sm text-emerald-800 underline"
            >
              Open project setup
            </Link>
          </div>
        ) : (
          events.data && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Project events</caption>
                <thead className="border-b text-stone-500">
                  <tr>
                    <th className="py-3">Event</th>
                    <th>Occurred</th>
                    <th>Identity</th>
                    <th>
                      <span className="sr-only">Details</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {events.data.items.map((event) => (
                    <tr key={event.id} className="border-b border-stone-100">
                      <td className="py-4 pr-4 font-medium">
                        {event.name}
                        <span className="muted block text-xs">
                          {event.type}
                        </span>
                      </td>
                      <td className="whitespace-nowrap pr-4">
                        {formatTime(event.occurredAt, project.data?.timezone)}
                      </td>
                      <td className="max-w-48 truncate pr-4 font-mono text-xs">
                        {event.userId ?? event.anonymousId}
                      </td>
                      <td>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelected(event.id)}
                          aria-label={`Inspect ${event.name} ${event.eventId}`}
                        >
                          Inspect
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
        <div className="mt-5 flex items-center gap-3">
          <Button
            variant="outline"
            disabled={!cursors.length || events.loading}
            onClick={() => setCursors((value) => value.slice(0, -1))}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            disabled={!events.data?.nextCursor || events.loading}
            onClick={() => {
              const next = events.data?.nextCursor;
              if (next) {
                setLive(false);
                setCursors((value) => [...value, next]);
              }
            }}
          >
            Next
          </Button>
          <span className="muted">Page {cursors.length + 1}</span>
        </div>
      </Card>
      {selected && (
        <Card className="mt-6">
          <section aria-labelledby="event-detail-title">
            <div className="flex justify-between gap-4">
              <h2 id="event-detail-title" className="font-semibold">
                Event details
              </h2>
              <Button variant="ghost" onClick={() => setSelected(null)}>
                Close details
              </Button>
            </div>
            <FormMessage error={detail.error} />
            {detail.loading ? (
              <p role="status">Loading event…</p>
            ) : (
              detail.data && (
                <>
                  <dl className="my-5 grid gap-3 text-sm sm:grid-cols-2">
                    {Object.entries({
                      Event: detail.data.name,
                      'Event ID': detail.data.eventId,
                      'Anonymous ID': detail.data.anonymousId,
                      'User ID': detail.data.userId ?? 'Anonymous',
                      'Occurred (UTC)': detail.data.occurredAt,
                      'Received (UTC)': detail.data.receivedAt,
                    }).map(([name, value]) => (
                      <div key={name}>
                        <dt className="muted">{name}</dt>
                        <dd className="break-all font-mono text-xs">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  {detail.data.identityConflict && (
                    <p className="mb-4 text-sm text-amber-900">
                      This anonymous ID was already associated with another
                      user. Its association was preserved.
                    </p>
                  )}
                  <h3 className="mb-3 text-sm font-medium">Properties</h3>
                  <pre className="max-h-80 overflow-auto rounded-lg bg-stone-100 p-4 text-xs">
                    {JSON.stringify(detail.data.properties, null, 2)}
                  </pre>
                </>
              )
            )}
          </section>
        </Card>
      )}
    </>
  );
}
function formatTime(value: string, timezone = 'UTC') {
  return new Intl.DateTimeFormat('en', {
    timeZone: timezone,
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(value));
}
