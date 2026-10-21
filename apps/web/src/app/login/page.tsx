'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authClient } from '../../lib/auth-client';
import { errorMessage } from '../../lib/api';
import { AuthLayout } from '../../components/auth-layout';
import { FormMessage } from '../../components/form-message';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const result = await authClient.signIn.email({ email: String(form.get('email')).trim().toLowerCase(), password: String(form.get('password')) });
      if (result.error) throw new Error(result.error.message ?? 'Sign in failed');
      router.replace('/');
    } catch (error) { setError(errorMessage(error)); } finally { setBusy(false); }
  }
  return <AuthLayout title="Welcome back" description="Sign in to your EventLens workspace."><form onSubmit={submit} className="grid gap-5"><label className="field">Email<Input name="email" type="email" autoComplete="email" required /></label><label className="field">Password<Input name="password" type="password" autoComplete="current-password" required maxLength={128} /></label><FormMessage error={error} /><Button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button></form><p className="muted mt-6">Accounts are invitation only. Ask a workspace owner for access.</p><Link className="mt-5 inline-block text-sm text-emerald-800 underline" href="/setup">Set up a new installation</Link></AuthLayout>;
}
