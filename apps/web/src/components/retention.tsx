'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  retentionQuerySchema,
  type Page,
  type Project,
} from '@eventlens/contracts';
import { useResource } from '../lib/use-resource';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { FormMessage } from './form-message';
import { RetentionReport } from './retention-report';

export function RetentionPage({
  workspaceId,
  projectId,
}: {
  workspaceId: string;
  projectId: string;
}) {
  const router = useRouter();
  const base = `/workspaces/${workspaceId}/projects/${projectId}`;
  const project = useResource<Project>(base);
  const projects = useResource<Page<Project>>(
    `/workspaces/${workspaceId}/projects?limit=100`,
  );
  const [query, setQuery] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dates] = useState(() => ({
    from: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
  }));
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const values: Record<string, string> = {};
    for (const [key, value] of data.entries()) values[key] = String(value);
    for (const prefix of ['entry', 'return']) {
      if (
        !values[`${prefix}PropertyKey`] &&
        !values[`${prefix}PropertyValue`]
      ) {
        delete values[`${prefix}PropertyKey`];
        delete values[`${prefix}PropertyValue`];
      }
    }
    const parsed = retentionQuerySchema.safeParse(values);
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join('; '));
      return;
    }
    setError(null);
    setQuery(new URLSearchParams(values).toString());
    setRevision((value) => value + 1);
  }
  return (
    <>
      <Link
        href={`${base}/analytics`}
        className="text-sm text-stone-500 hover:underline"
      >
        ← Analytics
      </Link>
      <div className="my-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="muted mb-1">
            {project.data?.name ?? 'Project analytics'}
          </p>
          <h1 className="page-title">Retention</h1>
          <p className="muted mt-2">
            See how many people return on each day after entering a cohort.
          </p>
        </div>
        <label className="field">
          Project
          <select
            className="select"
            value={projectId}
            onChange={(event) =>
              router.push(
                `/workspaces/${workspaceId}/projects/${event.target.value}/retention`,
              )
            }
          >
            {!projects.data?.items.some((value) => value.id === projectId) && (
              <option value={projectId}>
                {project.data?.name ?? 'Current project'}
              </option>
            )}
            {projects.data?.items.map((value) => (
              <option key={value.id} value={value.id}>
                {value.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <FormMessage error={error ?? project.error ?? projects.error} />
      <Card>
        <form
          onSubmit={apply}
          className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <label className="field">
            From (project date)
            <Input name="from" type="date" defaultValue={dates.from} required />
          </label>
          <label className="field">
            Before (project date, exclusive)
            <Input name="to" type="date" defaultValue={dates.to} required />
          </label>
          <label className="field">
            Return days
            <Input
              name="days"
              type="number"
              min={1}
              max={30}
              defaultValue={7}
              required
            />
          </label>
          <label className="field">
            Entry event
            <Input
              name="entryEvent"
              maxLength={100}
              placeholder="game_started"
              required
            />
          </label>
          <label className="field">
            Return event
            <Input
              name="returnEvent"
              maxLength={100}
              placeholder="game_started"
              required
            />
          </label>
          <div />
          {(['entry', 'return'] as const).map((prefix) => (
            <div key={prefix} className="contents">
              <label className="field">
                {prefix === 'entry' ? 'Entry' : 'Return'} property key
                (optional)
                <Input
                  name={`${prefix}PropertyKey`}
                  maxLength={100}
                  placeholder="platform"
                />
              </label>
              <label className="field">
                {prefix === 'entry' ? 'Entry' : 'Return'} property value
                (optional)
                <Input
                  name={`${prefix}PropertyValue`}
                  maxLength={200}
                  placeholder="browser"
                />
              </label>
              <div />
            </div>
          ))}
          <Button className="justify-self-start">Calculate retention</Button>
        </form>
        <p className="muted mt-4 text-sm">
          Dates use {project.data?.timezone ?? 'the project timezone'}. Each
          person enters once within the selected range. Day zero is the cohort
          baseline. Current and future days are unavailable until their local
          day ends.
        </p>
      </Card>
      {!query ? (
        <p className="muted mt-6">
          Choose entry and return events to calculate retention.
        </p>
      ) : (
        <RetentionReport
          key={`${query}:${revision}`}
          path={`${base}/retention?${query}`}
        />
      )}
    </>
  );
}
