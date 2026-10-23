'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { AnalyticsOverview, Page, Project } from '@eventlens/contracts';
import { useResource } from '../lib/use-resource';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { FormMessage } from './form-message';
import { AnalyticsTrends } from './analytics-trends';
import { ActivityTimeline } from './activity-timeline';

function utcDate(instant: number) {
  return new Date(instant).toISOString().slice(0, 10);
}
function initialRange() {
  const today = utcDate(Date.now());
  return {
    from: utcDate(Date.parse(today + 'T00:00:00Z') - 29 * 86400000),
    through: today,
    bucket: 'day',
    name: '',
    propertyKey: '',
    propertyValue: '',
  };
}
type Filters = ReturnType<typeof initialRange>;
function queryFor(filters: Filters) {
  const to = new Date(
    Date.parse(filters.through + 'T00:00:00Z') + 86400000,
  ).toISOString();
  const query = new URLSearchParams({
    from: filters.from + 'T00:00:00Z',
    to,
    bucket: filters.bucket,
  });
  if (filters.name) query.set('name', filters.name);
  if (filters.propertyKey) {
    query.set('propertyKey', filters.propertyKey);
    query.set('propertyValue', filters.propertyValue);
  }
  return query.toString();
}
export function AnalyticsOverviewPage({
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
  const [applied, setApplied] = useState(initialRange);
  const [filterError, setFilterError] = useState<string | null>(null);
  const query = queryFor(applied);
  const overview = useResource<AnalyticsOverview>(
    `${base}/analytics/overview?${query}`,
  );
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const filters = {
      from: String(data.get('from') ?? ''),
      through: String(data.get('through') ?? ''),
      bucket: String(data.get('bucket') ?? 'day'),
      name: String(data.get('name') ?? '').trim(),
      propertyKey: String(data.get('propertyKey') ?? '').trim(),
      propertyValue: String(data.get('propertyValue') ?? '').trim(),
    };
    const duration =
      Date.parse(filters.through + 'T00:00:00Z') +
      86400000 -
      Date.parse(filters.from + 'T00:00:00Z');
    if (
      !Number.isFinite(duration) ||
      duration <= 0 ||
      duration > 366 * 86400000
    ) {
      setFilterError(
        'Choose 1 to 366 UTC calendar days, with From before Through.',
      );
      return;
    }
    if (Boolean(filters.propertyKey) !== Boolean(filters.propertyValue)) {
      setFilterError('Enter both a property key and a value.');
      return;
    }
    setFilterError(null);
    setApplied(filters);
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
          <p className="muted mb-1">Analytics overview</p>
          <h1 className="page-title">
            {project.data?.name ?? 'Project analytics'}
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
                  `/workspaces/${workspaceId}/projects/${event.target.value}/analytics`,
                )
              }
            >
              {!projects.data?.items.some(
                (value) => value.id === projectId,
              ) && (
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
          <Button asChild variant="outline">
            <Link href={`${base}/events`}>Events</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`${base}/conversion-paths`}>Conversion paths</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={base}>Settings</Link>
          </Button>
        </div>
      </div>
      <FormMessage
        error={filterError ?? project.error ?? projects.error ?? overview.error}
      />
      <Card>
        <form
          onSubmit={apply}
          className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <label className="field">
            From (UTC)
            <Input
              name="from"
              type="date"
              defaultValue={applied.from}
              required
            />
          </label>
          <label className="field">
            Through (UTC)
            <Input
              name="through"
              type="date"
              defaultValue={applied.through}
              required
            />
          </label>
          <label className="field">
            Group by
            <select className="select" name="bucket" defaultValue="day">
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
            </select>
          </label>
          <label className="field">
            Event name
            <Input name="name" placeholder="All track events" maxLength={100} />
          </label>
          <label className="field">
            Property key
            <Input name="propertyKey" placeholder="platform" maxLength={100} />
          </label>
          <label className="field">
            Property value
            <Input name="propertyValue" placeholder="browser" maxLength={200} />
          </label>
          <Button className="self-end">Apply filters</Button>
        </form>
        <p className="muted mt-5 text-sm">
          The selected dates are UTC. Day, Monday-start week, and month buckets
          use {project.data?.timezone ?? 'the project timezone'}. Only
          processed, retained track events count.
        </p>
      </Card>
      {overview.loading ? (
        <p className="muted mt-8" role="status">
          Loading analytics…
        </p>
      ) : overview.data ? (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Card>
              <h2 className="muted text-sm">Events</h2>
              <p className="mt-2 text-3xl font-semibold">
                {overview.data.totalEvents.toLocaleString()}
              </p>
              <p className="muted mt-2 text-sm">
                Matching track events in range
              </p>
            </Card>
            <Card>
              <h2 className="muted text-sm">Active users</h2>
              <p className="mt-2 text-3xl font-semibold">
                {overview.data.activeUsers.toLocaleString()}
              </p>
              <p className="muted mt-2 text-sm">
                Distinct linked users or unlinked anonymous IDs across the range
              </p>
            </Card>
          </div>
          <Card className="mt-6">
            <h2 className="text-lg font-semibold">Trends</h2>
            <p className="muted mb-5 mt-1 text-sm">
              Each period starts on the date shown in {overview.data.timezone}.
              A user active in multiple periods is counted once in each period.
            </p>
            {overview.data.totalEvents === 0 ? (
              <div className="py-8">
                <h3 className="font-medium">No events match this range</h3>
                <p className="muted mt-2 text-sm">
                  Try a wider range or send events from your application.
                </p>
              </div>
            ) : (
              <AnalyticsTrends series={overview.data.series} />
            )}
          </Card>
          {overview.data.topEvents.length > 0 && (
            <Card className="mt-6">
              <h2 className="text-lg font-semibold">Top events</h2>
              <ol className="mt-4 divide-y divide-stone-100">
                {overview.data.topEvents.map((event) => (
                  <li
                    key={event.name}
                    className="flex justify-between gap-4 py-3 text-sm"
                  >
                    <span>{event.name}</span>
                    <strong>{event.count.toLocaleString()}</strong>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </>
      ) : null}
      <ActivityTimeline
        base={base}
        query={query}
        timezone={project.data?.timezone ?? 'UTC'}
      />
    </>
  );
}
