'use client';
import { useState, type FormEvent } from 'react';
import { DashboardShell } from '../../components/dashboard-shell';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { FormMessage } from '../../components/form-message';
import { authClient } from '../../lib/auth-client';
import { errorMessage } from '../../lib/api';

export default function AccountPage() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function change(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null); setSuccess(null);
    const element = event.currentTarget;
    const form = new FormData(element);
    try { const result = await authClient.changePassword({ currentPassword: String(form.get('current')), newPassword: String(form.get('password')), revokeOtherSessions: true }); if (result.error) throw new Error(result.error.message); element.reset(); setSuccess('Password changed. Other sessions have been signed out.'); }
    catch (error) { setError(errorMessage(error)); } finally { setBusy(false); }
  }
  return <DashboardShell><h1 className="page-title">Account</h1><p className="muted mb-8 mt-2">Keep your account secure.</p><Card><h2 className="mb-5 font-semibold">Change password</h2><form onSubmit={change} className="grid max-w-md gap-5"><label className="field">Current password<Input name="current" type="password" required maxLength={128} autoComplete="current-password" /></label><label className="field">New password<Input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" /></label><FormMessage error={error} success={success} /><Button className="justify-self-start" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</Button></form></Card></DashboardShell>;
}
