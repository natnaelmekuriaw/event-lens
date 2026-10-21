'use client';
import Link from 'next/link';
import { use, useState, type FormEvent } from 'react';
import type { Workspace, Member, Invitation, Role } from '@eventlens/contracts';
import { DashboardShell } from '../../../../components/dashboard-shell';
import { Card } from '../../../../components/ui/card';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { FormMessage } from '../../../../components/form-message';
import { SecretValue } from '../../../../components/secret-value';
import { useResource } from '../../../../lib/use-resource';
import { api, errorMessage } from '../../../../lib/api';

function Team({ workspaceId }: { workspaceId: string }) {
  const base = `/workspaces/${workspaceId}`;
  const workspace = useResource<Workspace>(base);
  const members = useResource<Member[]>(`${base}/members`);
  const owner = workspace.data?.role === 'owner';
  const invitations = useResource<Invitation[]>(owner ? `${base}/invitations` : null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  async function action(task: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await task(); members.refresh(); invitations.refresh(); workspace.refresh(); }
    catch (error) { setError(errorMessage(error)); } finally { setBusy(false); }
  }
  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await action(async () => { const result = await api<{ token: string }>(`${base}/invitations`, { method: 'POST', body: { email: form.get('email'), role: form.get('role') } }); setLink(`${window.location.origin}/join#token=${encodeURIComponent(result.token)}`); });
  }
  return <><Link href={base} className="mb-5 inline-block text-sm text-stone-500 hover:underline">← Projects</Link><h1 className="page-title">Team</h1><p className="muted mb-8 mt-2">Manage access to {workspace.data?.name ?? 'your workspace'}.</p><FormMessage error={error ?? workspace.error ?? members.error} />
    {link && <SecretValue title="Share this invitation privately" value={link} onDismiss={() => setLink(null)} />}
    {owner && <Card className="my-6"><h2 className="font-semibold">Invite a teammate</h2><p className="muted mb-5 mt-2">Invitation links expire after 48 hours. Creating a new invitation for the same email replaces its previous link.</p><form onSubmit={invite} className="flex flex-wrap items-end gap-4"><label className="field grow">Email<Input name="email" type="email" required /></label><label className="field">Role<select name="role" className="select" defaultValue="viewer"><option value="viewer">Viewer</option><option value="admin">Admin</option></select></label><Button disabled={busy}>Create invitation</Button></form></Card>}
    <Card className="my-6"><h2 className="mb-5 font-semibold">Members</h2>{members.loading ? <p role="status">Loading members…</p> : <div className="divide-y divide-stone-100">{members.data?.map((member) => <div key={member.userId} className="flex flex-wrap items-center justify-between gap-4 py-4"><div><p className="text-sm font-medium">{member.name}</p><p className="muted text-xs">{member.email}</p></div><div className="flex items-center gap-3">{owner ? <><label className="sr-only" htmlFor={`role-${member.userId}`}>Role for {member.email}</label><select id={`role-${member.userId}`} className="select" value={member.role} disabled={busy} onChange={(event) => { const role = event.target.value as Role; void action(() => api(`${base}/members/${member.userId}`, { method: 'PATCH', body: { role } })); }}><option value="owner">Owner</option><option value="admin">Admin</option><option value="viewer">Viewer</option></select><Button variant="ghost" size="sm" disabled={busy} onClick={() => { if (window.confirm(`Remove ${member.email} from this workspace?`)) void action(() => api(`${base}/members/${member.userId}`, { method: 'DELETE' })); }}>Remove</Button></> : <span className="text-sm capitalize text-stone-500">{member.role}</span>}</div></div>)}</div>}</Card>
    {owner && <Card><h2 className="mb-5 font-semibold">Pending invitations</h2><FormMessage error={invitations.error} />{invitations.loading ? <p role="status">Loading invitations…</p> : invitations.data?.length ? <div className="divide-y divide-stone-100">{invitations.data.map((invitation) => <div key={invitation.id} className="flex flex-wrap items-center justify-between gap-4 py-3"><div><p className="text-sm font-medium">{invitation.email}</p><p className="muted text-xs">{invitation.role} · Expires {new Date(invitation.expiresAt).toLocaleString()}</p></div><Button variant="outline" size="sm" disabled={busy} onClick={() => { void action(() => api(`${base}/invitations/${invitation.id}`, { method: 'DELETE' })); }}>Revoke</Button></div>)}</div> : <p className="muted">No pending invitations.</p>}</Card>}
  </>;
}
export default function TeamPage({ params }: { params: Promise<{ workspaceId: string }> }) { const { workspaceId } = use(params); return <DashboardShell><Team workspaceId={workspaceId} /></DashboardShell>; }
