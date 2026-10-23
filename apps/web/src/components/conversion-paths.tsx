'use client';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import {
  canManageProjects,
  funnelDefinitionSchema,
  type FunnelResult,
  type FunnelStep,
  type Page,
  type SavedFunnel,
  type Workspace,
} from '@eventlens/contracts';
import { api, errorMessage } from '../lib/api';
import { useResource } from '../lib/use-resource';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { FormMessage } from './form-message';

const blankStep = (): FunnelStep => ({ name: '' });
const utcDate = (value: number) => new Date(value).toISOString().slice(0, 10);
const initialDates = () => ({
  from: utcDate(Date.now() - 29 * 86400000),
  through: utcDate(Date.now()),
});
function rangeQuery(dates: ReturnType<typeof initialDates>) {
  const end = Date.parse(`${dates.through}T00:00:00Z`) + 86400000;
  return new URLSearchParams({
    from: `${dates.from}T00:00:00Z`,
    to: new Date(end).toISOString(),
  }).toString();
}

export function ConversionPathsPage({
  workspaceId,
  projectId,
}: {
  workspaceId: string;
  projectId: string;
}) {
  const base = `/workspaces/${workspaceId}/projects/${projectId}`;
  const pathsBase = `${base}/conversion-paths`;
  const workspace = useResource<Workspace>(`/workspaces/${workspaceId}`);
  const paths = useResource<Page<SavedFunnel>>(`${pathsBase}?limit=100`);
  const [morePaths, setMorePaths] = useState<SavedFunnel[]>([]);
  const [moreCursor, setMoreCursor] = useState<string | null | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);
  const canEdit = Boolean(
    workspace.data && canManageProjects(workspace.data.role),
  );
  const [selected, setSelected] = useState<SavedFunnel | null>(null);
  const [name, setName] = useState('');
  const [steps, setSteps] = useState<FunnelStep[]>([blankStep(), blankStep()]);
  const [windowMinutes, setWindowMinutes] = useState(60);
  const [dates, setDates] = useState(initialDates);
  const [query, setQuery] = useState(() => rangeQuery(initialDates()));
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const results = useResource<FunnelResult>(
    selected ? `${pathsBase}/${selected.id}/results?${query}` : null,
  );

  function choose(path: SavedFunnel) {
    setSelected(path);
    setName(path.name);
    setSteps(path.steps);
    setWindowMinutes(path.windowMinutes);
    setError(null);
    setSuccess(null);
  }
  function reset() {
    setSelected(null);
    setName('');
    setSteps([blankStep(), blankStep()]);
    setWindowMinutes(60);
    setError(null);
    setSuccess(null);
  }
  function changeStep(index: number, key: keyof FunnelStep, value: string) {
    setSteps((current) =>
      current.map((step, position) => {
        if (position !== index) return step;
        if (key === 'propertyKey' || key === 'propertyValue') {
          return { ...step, [key]: value || undefined };
        }
        return { ...step, name: value };
      }),
    );
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = funnelDefinitionSchema.safeParse({
      name,
      steps,
      windowMinutes,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the path definition.');
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const saved = await api<SavedFunnel>(
        selected ? `${pathsBase}/${selected.id}` : pathsBase,
        { method: selected ? 'PUT' : 'POST', body: parsed.data },
      );
      choose(saved);
      setMorePaths([]);
      setMoreCursor(undefined);
      paths.refresh();
      results.refresh();
      setSuccess('Conversion path saved.');
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!selected || !window.confirm(`Delete "${selected.name}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api(`${pathsBase}/${selected.id}`, { method: 'DELETE' });
      reset();
      setMorePaths([]);
      setMoreCursor(undefined);
      paths.refresh();
      setSuccess('Conversion path deleted.');
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  function applyDates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const duration =
      Date.parse(`${dates.through}T00:00:00Z`) +
      86400000 -
      Date.parse(`${dates.from}T00:00:00Z`);
    if (
      !Number.isFinite(duration) ||
      duration <= 0 ||
      duration > 90 * 86400000
    ) {
      setError('Choose 1 to 90 UTC calendar days, with From before Through.');
      return;
    }
    setError(null);
    setQuery(rangeQuery(dates));
    results.refresh();
  }
  async function loadMore() {
    const cursor =
      moreCursor === undefined ? paths.data?.nextCursor : moreCursor;
    if (!cursor) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await api<Page<SavedFunnel>>(
        `${pathsBase}?limit=100&cursor=${cursor}`,
      );
      setMorePaths((current) => [...current, ...page.items]);
      setMoreCursor(page.nextCursor);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setLoadingMore(false);
    }
  }
  const listedPaths = [...(paths.data?.items ?? []), ...morePaths];
  const nextCursor =
    moreCursor === undefined ? paths.data?.nextCursor : moreCursor;

  return (
    <>
      <Link
        href={`${base}/analytics`}
        className="text-sm text-stone-500 hover:underline"
      >
        ← Analytics
      </Link>
      <div className="my-5">
        <p className="muted mb-1">Product analytics</p>
        <h1 className="page-title">Conversion paths</h1>
        <p className="muted mt-2 text-sm">
          See how many distinct people complete events in order within a time
          window.
        </p>
      </div>
      <FormMessage
        error={error ?? workspace.error ?? paths.error ?? results.error}
        success={success}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(240px,1fr)_minmax(0,2fr)]">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Saved paths</h2>
            {canEdit && (
              <Button variant="outline" onClick={reset}>
                New path
              </Button>
            )}
          </div>
          {paths.loading ? (
            <p className="muted mt-4" role="status">
              Loading paths…
            </p>
          ) : paths.data?.items.length === 0 ? (
            <p className="muted mt-4 text-sm">No paths saved yet.</p>
          ) : (
            <ul className="mt-4 space-y-2" aria-label="Saved conversion paths">
              {listedPaths.map((path) => (
                <li key={path.id}>
                  <button
                    type="button"
                    onClick={() => choose(path)}
                    aria-current={selected?.id === path.id ? 'true' : undefined}
                    className="w-full rounded-lg border p-3 text-left text-sm hover:bg-stone-50"
                  >
                    <strong>{path.name}</strong>
                    <span className="muted mt-1 block">
                      {path.steps.length} steps · {path.windowMinutes} min
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {nextCursor && (
            <Button
              variant="outline"
              className="mt-4"
              disabled={loadingMore}
              onClick={loadMore}
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </Button>
          )}
        </Card>
        <div className="space-y-6">
          {(canEdit || selected) && (
            <Card>
              <h2 className="mb-4 font-semibold">
                {selected ? 'Path definition' : 'New path'}
              </h2>
              {!canEdit && (
                <p className="muted mb-4 text-sm">
                  Only owners and admins can edit paths.
                </p>
              )}
              <form onSubmit={save} className="space-y-4">
                <label className="field">
                  Path name
                  <Input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={80}
                    required
                    disabled={!canEdit}
                    placeholder="Onboarding"
                  />
                </label>
                <label className="field">
                  Completion window (minutes)
                  <Input
                    type="number"
                    min={1}
                    max={43200}
                    value={windowMinutes}
                    onChange={(event) =>
                      setWindowMinutes(Number(event.target.value))
                    }
                    required
                    disabled={!canEdit}
                  />
                </label>
                <ol className="space-y-4">
                  {steps.map((step, index) => (
                    <li key={index} className="rounded-lg border p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="font-medium">Step {index + 1}</h3>
                        {canEdit && steps.length > 2 && (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() =>
                              setSteps(
                                steps.filter(
                                  (_, position) => position !== index,
                                ),
                              )
                            }
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <label className="field">
                          Event name
                          <Input
                            value={step.name}
                            onChange={(event) =>
                              changeStep(index, 'name', event.target.value)
                            }
                            maxLength={100}
                            required
                            disabled={!canEdit}
                            placeholder="signup_completed"
                          />
                        </label>
                        <label className="field">
                          Property key (optional)
                          <Input
                            value={step.propertyKey ?? ''}
                            onChange={(event) =>
                              changeStep(
                                index,
                                'propertyKey',
                                event.target.value,
                              )
                            }
                            maxLength={100}
                            disabled={!canEdit}
                            placeholder="plan"
                          />
                        </label>
                        <label className="field">
                          Property value (optional)
                          <Input
                            value={step.propertyValue ?? ''}
                            onChange={(event) =>
                              changeStep(
                                index,
                                'propertyValue',
                                event.target.value,
                              )
                            }
                            maxLength={200}
                            disabled={!canEdit}
                            placeholder="pro"
                          />
                        </label>
                      </div>
                    </li>
                  ))}
                </ol>
                {canEdit && (
                  <div className="flex flex-wrap gap-3">
                    {steps.length < 6 && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setSteps([...steps, blankStep()])}
                      >
                        Add step
                      </Button>
                    )}
                    <Button disabled={busy}>
                      {selected ? 'Save changes' : 'Create path'}
                    </Button>
                    {selected && (
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={busy}
                        onClick={remove}
                      >
                        Delete path
                      </Button>
                    )}
                  </div>
                )}
              </form>
            </Card>
          )}
          {selected && (
            <Card>
              <h2 className="font-semibold">Results</h2>
              <form
                onSubmit={applyDates}
                className="mt-4 flex flex-wrap items-end gap-4"
              >
                <label className="field">
                  From (UTC)
                  <Input
                    type="date"
                    value={dates.from}
                    required
                    onChange={(event) =>
                      setDates({ ...dates, from: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  Through (UTC)
                  <Input
                    type="date"
                    value={dates.through}
                    required
                    onChange={(event) =>
                      setDates({ ...dates, through: event.target.value })
                    }
                  />
                </label>
                <Button>Apply dates</Button>
              </form>
              <p className="muted mt-3 text-sm">
                Entry is the first matching step in these UTC dates. Later steps
                may fall after Through, within the completion window. Each
                person counts once per step.
              </p>
              {results.loading ? (
                <p className="muted mt-6" role="status">
                  Counting conversions…
                </p>
              ) : (
                results.data && (
                  <>
                    {results.data.entries === 0 && (
                      <p className="muted mt-6">
                        No people entered this path in the selected dates.
                      </p>
                    )}
                    <div className="mt-6 overflow-x-auto">
                      <table
                        className="w-full text-left text-sm"
                        aria-label="Conversion path results"
                      >
                        <thead>
                          <tr className="border-b">
                            <th scope="col" className="p-2">
                              Step
                            </th>
                            <th scope="col" className="p-2">
                              People
                            </th>
                            <th scope="col" className="p-2">
                              From start
                            </th>
                            <th scope="col" className="p-2">
                              From previous
                            </th>
                            <th scope="col" className="p-2">
                              Dropoff
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {results.data.steps.map((step) => (
                            <tr key={step.step} className="border-b">
                              <th scope="row" className="p-2 font-medium">
                                {step.step}. {step.name}
                              </th>
                              <td className="p-2">
                                {step.users.toLocaleString()}
                              </td>
                              <td className="p-2">
                                {(step.rateFromStart * 100).toFixed(1)}%
                              </td>
                              <td className="p-2">
                                {(step.rateFromPrevious * 100).toFixed(1)}%
                              </td>
                              <td className="p-2">
                                {step.dropoff.toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="muted mt-4 text-xs">
                      Counted as of{' '}
                      {new Date(results.data.asOf).toLocaleString()}.
                    </p>
                  </>
                )
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
