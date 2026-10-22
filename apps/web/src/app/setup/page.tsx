'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, errorMessage } from '../../lib/api';
import { useResource } from '../../lib/use-resource';
import { authClient } from '../../lib/auth-client';
import { AuthLayout } from '../../components/auth-layout';
import { FormMessage } from '../../components/form-message';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';

export default function SetupPage() {
  const status = useResource<{ required: boolean }>('/setup');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const input = Object.fromEntries(form.entries());
    try {
      await api('/setup', { method: 'POST', body: input });
      const result = await authClient.signIn.email({
        email: String(input.email),
        password: String(input.password),
      });
      router.replace(result.error ? '/login' : '/');
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthLayout
      title="Make yourself at home"
      description="Create the first owner account and workspace."
    >
      {status.loading ? (
        <p role="status">Checking installation…</p>
      ) : status.error ? (
        <>
          <FormMessage error={status.error} />
          <Button className="mt-4" onClick={status.refresh}>
            Try again
          </Button>
        </>
      ) : status.data?.required ? (
        <form onSubmit={submit} className="grid gap-4">
          <label className="field">
            Setup token
            <Input
              name="token"
              type="password"
              autoComplete="off"
              required
              minLength={32}
              maxLength={256}
            />
            <span className="muted font-normal">
              Use BOOTSTRAP_TOKEN from your installation environment.
            </span>
          </label>
          <label className="field">
            Your name
            <Input name="name" autoComplete="name" required maxLength={80} />
          </label>
          <label className="field">
            Email
            <Input name="email" type="email" autoComplete="email" required />
          </label>
          <label className="field">
            Password
            <Input
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
            />
            <span className="muted font-normal">At least 12 characters.</span>
          </label>
          <label className="field">
            Workspace name
            <Input
              name="workspaceName"
              required
              maxLength={80}
              placeholder="My team"
            />
          </label>
          <FormMessage error={error} />
          <Button disabled={busy}>
            {busy ? 'Creating workspace…' : 'Create workspace'}
          </Button>
        </form>
      ) : (
        <>
          <p className="muted">
            Owner setup is complete. Sign in or request an invitation from a
            workspace owner.
          </p>
          <Button asChild className="mt-5">
            <Link href="/login">Sign in</Link>
          </Button>
        </>
      )}
    </AuthLayout>
  );
}
