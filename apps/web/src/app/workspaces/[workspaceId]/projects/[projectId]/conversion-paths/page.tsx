'use client';
import { use } from 'react';
import { DashboardShell } from '../../../../../../components/dashboard-shell';
import { ConversionPathsPage } from '../../../../../../components/conversion-paths';

export default function ConversionPathsRoute({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
}) {
  const ids = use(params);
  return (
    <DashboardShell>
      <ConversionPathsPage {...ids} />
    </DashboardShell>
  );
}
