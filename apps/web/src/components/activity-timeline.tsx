'use client';
import { useState, type FormEvent } from 'react';
import type { Page, StoredEvent } from '@eventlens/contracts';
import { useResource } from '../lib/use-resource';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { FormMessage } from './form-message';

export function ActivityTimeline({
  base,
  query,
  timezone,
}: {
  base: string;
  query: string;
  timezone: string;
}) {
  const [actor, setActor] = useState<{
    type: 'user' | 'anonymous';
    id: string;
  } | null>(null);
  const [cursors, setCursors] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const cursor = cursors.at(-1);
  const params = new URLSearchParams(query);
  if (actor) {
    params.set('actorType', actor.type);
    params.set('actorId', actor.id);
    params.set('limit', '25');
    if (cursor) params.set('cursor', cursor);
  }
  params.delete('bucket');
  const activity = useResource<Page<StoredEvent>>(
    actor ? `${base}/analytics/activity?${params}` : null,
  );
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const id = String(form.get('actorId') ?? '').trim();
    if (!id) {
      setFormError('Enter a user or anonymous ID.');
      return;
    }
    setFormError(null);
    setCursors([]);
    setActor({
      type: form.get('actorType') === 'anonymous' ? 'anonymous' : 'user',
      id,
    });
  }
  return (
    <Card className="mt-6">
      <div className="mb-5">
        <h2 className="text-lg font-semibold">User activity</h2>
        <p className="muted mt-1 text-sm">
          Search an exact ID to see its timeline. Identified users include
          linked anonymous history. The selected date and event filters apply
          here.
        </p>
      </div>
      <form onSubmit={search} className="flex flex-wrap items-end gap-3">
        <label className="field">
          ID type
          <select className="select" name="actorType" defaultValue="user">
            <option value="user">User ID</option>
            <option value="anonymous">Anonymous ID</option>
          </select>
        </label>
        <label className="field min-w-64 flex-1">
          Exact ID
          <Input name="actorId" maxLength={200} placeholder="player-42" />
        </label>
        <Button>Search activity</Button>
      </form>
      <FormMessage error={formError ?? (actor ? activity.error : null)} />
      {actor && (
        <div className="mt-6">
          <p className="mb-3 text-sm font-medium">
            {actor.type === 'user' ? 'User' : 'Anonymous ID'}: {actor.id}
          </p>
          {activity.loading ? (
            <p role="status" className="muted">
              Loading activity…
            </p>
          ) : activity.data?.items.length === 0 ? (
            <p className="muted">No activity matches this ID and range.</p>
          ) : (
            <ol
              aria-label="Activity events"
              className="border-l border-stone-200 pl-5"
            >
              {activity.data?.items.map((event) => (
                <li key={event.id} className="relative mb-5">
                  <span
                    aria-hidden="true"
                    className="absolute -left-[1.48rem] top-1.5 h-2 w-2 rounded-full bg-emerald-700"
                  />
                  <div className="flex flex-wrap items-baseline gap-2">
                    <strong>{event.name}</strong>
                    <span className="muted text-xs">{event.type}</span>
                    <time dateTime={event.occurredAt} className="muted text-xs">
                      {new Intl.DateTimeFormat('en', {
                        timeZone: timezone,
                        dateStyle: 'medium',
                        timeStyle: 'medium',
                      }).format(new Date(event.occurredAt))}
                    </time>
                  </div>
                  {event.identityConflict && (
                    <p className="mt-1 text-xs text-amber-900">
                      Conflicting identity supplied for this event.
                    </p>
                  )}
                  <details className="mt-1 text-sm">
                    <summary className="cursor-pointer text-emerald-800">
                      Event properties
                    </summary>
                    <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-stone-100 p-3 text-xs">
                      {JSON.stringify(event.properties, null, 2)}
                    </pre>
                  </details>
                </li>
              ))}
            </ol>
          )}
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              disabled={!cursors.length || activity.loading}
              onClick={() => setCursors((value) => value.slice(0, -1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={!activity.data?.nextCursor || activity.loading}
              onClick={() => {
                const next = activity.data?.nextCursor;
                if (next) setCursors((value) => [...value, next]);
              }}
            >
              Next
            </Button>
            <span className="muted text-sm">Page {cursors.length + 1}</span>
          </div>
        </div>
      )}
    </Card>
  );
}
