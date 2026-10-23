'use client';
import { useState } from 'react';
import type {
  FailedReceipt,
  Page,
  ProcessingSummary,
} from '@eventlens/contracts';
import { useResource } from '../lib/use-resource';
import { api, errorMessage } from '../lib/api';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { FormMessage } from './form-message';

export function ProcessingStatus({
  base,
  canManage,
}: {
  base: string;
  canManage: boolean;
}) {
  const summary = useResource<ProcessingSummary>(base + '/processing');
  const [show, setShow] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const failures = useResource<Page<FailedReceipt>>(
    show && canManage
      ? base +
          '/processing/failures?limit=20' +
          (cursor ? '&cursor=' + cursor : '')
      : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  async function replay(id: string) {
    setBusy(id);
    setError(null);
    try {
      await api(base + '/processing/' + id + '/replay', { method: 'POST' });
      failures.refresh();
      summary.refresh();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">Delivery status</h2>
          <p className="muted mt-1">
            Receipt totals include deduplication records after event retention.
          </p>
        </div>
        <Button variant="ghost" onClick={summary.refresh}>
          Refresh delivery status
        </Button>
      </div>
      <FormMessage error={summary.error ?? error} />
      {summary.data && (
        <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Object.entries(summary.data).map(([name, count]) => (
            <div key={name}>
              <dt className="muted capitalize">{name}</dt>
              <dd className="mt-1 text-2xl font-semibold">
                {count.toLocaleString()}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {canManage && (
        <Button
          className="mt-5"
          variant="outline"
          onClick={() => {
            setShow((value) => !value);
            setCursor(null);
          }}
        >
          {show ? 'Hide failures' : 'Inspect failures'}
        </Button>
      )}
      {show && canManage && (
        <div className="mt-5">
          <FormMessage error={failures.error} />
          {failures.loading ? (
            <p role="status">Loading failed receipts…</p>
          ) : failures.data?.items.length === 0 ? (
            <p className="muted">No failed receipts.</p>
          ) : (
            <ul className="divide-y">
              {failures.data?.items.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="text-sm">
                    <p className="font-mono text-xs">{row.eventId}</p>
                    <p className="muted">
                      {row.errorCode} · {row.attempts} attempts
                    </p>
                  </div>
                  <Button
                    disabled={busy !== null}
                    onClick={() => replay(row.id)}
                  >
                    {busy === row.id ? 'Replaying…' : 'Replay receipt'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex gap-3">
            {cursor && (
              <Button variant="outline" onClick={() => setCursor(null)}>
                First failures
              </Button>
            )}
            {failures.data?.nextCursor && (
              <Button
                variant="outline"
                onClick={() => setCursor(failures.data!.nextCursor)}
              >
                More failures
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
