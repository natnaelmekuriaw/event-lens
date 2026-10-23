'use client';
import { use } from 'react';
import { DashboardShell } from '../../../../../../components/dashboard-shell';
import { AnalyticsOverviewPage } from '../../../../../../components/analytics-overview';

export default function AnalyticsPage({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
}) {
  const ids = use(params);
  return (
    <DashboardShell>
      <AnalyticsOverviewPage {...ids} />
    </DashboardShell>
  );
}
