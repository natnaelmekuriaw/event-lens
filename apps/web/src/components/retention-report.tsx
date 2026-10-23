'use client';
import type { RetentionResult } from '@eventlens/contracts';
import { useResource } from '../lib/use-resource';
import { Card } from './ui/card';
import { FormMessage } from './form-message';
import { RetentionTable } from './retention-table';

export function RetentionReport({ path }: { path: string }) {
  const result = useResource<RetentionResult>(path);
  if (result.loading)
    return (
      <p className="muted mt-6" role="status">
        Calculating retention…
      </p>
    );
  if (result.error)
    return (
      <div className="mt-6">
        <FormMessage error={result.error} />
      </div>
    );
  if (!result.data) return null;
  return (
    <Card className="mt-6">
      <h2 className="text-lg font-semibold">Daily cohorts</h2>
      {!result.data.cohorts.some((cohort) => cohort.size > 0) && (
        <p className="muted mt-3">
          No people entered in this range. Try another entry event or date
          range.
        </p>
      )}
      <RetentionTable report={result.data} />
      <p className="muted mt-4 text-sm">
        Counts use processed, retained events and may change with late arrivals,
        identity links, or cleanup. Unavailable cells are not zero returns.
        Cohort sizes for the current day are provisional.
      </p>
      <p className="muted mt-2 text-xs">
        As of {new Date(result.data.asOf).toLocaleString()}.
      </p>
    </Card>
  );
}
