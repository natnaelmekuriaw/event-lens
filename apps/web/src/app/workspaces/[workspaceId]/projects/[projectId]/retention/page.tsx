'use client';
import { use } from 'react';
import { DashboardShell } from '../../../../../../components/dashboard-shell';
import { RetentionPage } from '../../../../../../components/retention';

export default function RetentionRoute({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
}) {
  const ids = use(params);
  return (
    <DashboardShell>
      <RetentionPage key={ids.projectId} {...ids} />
    </DashboardShell>
  );
}
