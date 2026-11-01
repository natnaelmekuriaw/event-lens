'use client';
import Link from 'next/link';
import type { ProcessingSummary } from '@eventlens/contracts';
import { useResource } from '../lib/use-resource';
import { Button } from './ui/button';
import { Card } from './ui/card';

export function ProjectGettingStarted({
  base,
  canManage,
}: {
  base: string;
  canManage: boolean;
}) {
  const processing = useResource<ProcessingSummary>(`${base}/processing`);
  if (processing.loading || processing.data?.processed) return null;

  return (
    <Card className="border-emerald-200 bg-emerald-50/40">
      <h2 className="text-lg font-semibold">
        Get your first event into EventLens
      </h2>
      <ol className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
        <li>
          <strong>1. Save your project key</strong>
          <p className="muted mt-1">
            The full key appears only when a project is created or rotated.
            {canManage
              ? ' Rotate it below if you lost it.'
              : ' Ask a workspace owner or admin if you need it.'}
          </p>
        </li>
        <li>
          <strong>2. Connect the SDK</strong>
          <p className="muted mt-1">
            Add the browser or Node client to your app, then track a named
            event.
          </p>
          <a
            className="mt-2 inline-block text-emerald-800 underline"
            href="https://github.com/natnaelmekuriaw/EventLens/blob/main/docs/first-event.md"
            target="_blank"
            rel="noreferrer"
          >
            Follow the first-event guide
          </a>
        </li>
        <li>
          <strong>3. Check delivery</strong>
          <p className="muted mt-1">
            Accepted events appear in the explorer after the worker processes
            them. The GalaxyBalls demo can send sample events locally.
          </p>
          <Button asChild variant="outline" className="mt-2">
            <Link href={`${base}/events`}>Open event explorer</Link>
          </Button>
        </li>
      </ol>
      {processing.error && (
        <p className="muted mt-4">
          Delivery status is unavailable. You can still follow these steps.
        </p>
      )}
    </Card>
  );
}
