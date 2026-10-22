'use client';
import { use } from 'react';
import { DashboardShell } from '../../../../../../components/dashboard-shell';
import { EventExplorer } from '../../../../../../components/event-explorer';
export default function EventsPage({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
}) {
  return (
    <DashboardShell>
      <EventExplorer {...use(params)} />
    </DashboardShell>
  );
}
