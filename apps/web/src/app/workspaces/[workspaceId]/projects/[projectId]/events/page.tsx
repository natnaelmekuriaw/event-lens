'use client';
import { use } from 'react';
import { DashboardShell } from '../../../../../../components/dashboard-shell';
import { EventExplorer } from '../../../../../../components/event-explorer';
export default function EventsPage({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
}) {
  const ids = use(params);
  return (
    <DashboardShell>
      <EventExplorer key={ids.projectId} {...ids} />
    </DashboardShell>
  );
}
