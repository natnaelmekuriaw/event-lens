'use client';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { api, errorMessage } from '../../lib/api';
import { authClient } from '../../lib/auth-client';
import { AuthLayout } from '../../components/auth-layout';
import { FormMessage } from '../../components/form-message';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';

export default function JoinPage() {
  const session = authClient.useSession();
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setToken(
      new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '',
    );
  }, []);
  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await api('/invitations/accept', {
        method: 'POST',
        body: {
          token,
          name: String(form.get('name')),
          ...(!session.data ? { password: String(form.get('password')) } : {}),
        },
      });
      window.history.replaceState(null, '', '/join');
      setToken('');
      setDone(true);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthLayout
      title={done ? 'You’re in' : 'Join your team'}
      description={
        done
          ? 'Your workspace membership is ready.'
          : 'This invitation gives you access to an EventLens workspace.'
      }
    >
      {done ? (
        <Button asChild>
          <Link href={session.data ? '/' : '/login'}>
            {session.data ? 'Open workspaces' : 'Sign in'}
          </Link>
        </Button>
      ) : (
        <form onSubmit={accept} className="grid gap-5">
          <label className="field">
            Invitation token
            <Input
              value={token}
              onChange={(event) => setToken(event.target.value)}
              required
              minLength={32}
              maxLength={256}
              autoComplete="off"
              type="password"
            />
          </label>
          <label className="field">
            Your name
            <Input
              name="name"
              required
              maxLength={80}
              autoComplete="name"
              defaultValue={session.data?.user.name ?? ''}
            />
          </label>
          {!session.data && (
            <label className="field">
              Password for a new account
              <Input
                name="password"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
              />
            </label>
          )}
          <FormMessage error={error} />
          <Button disabled={busy || session.isPending}>
            {busy ? 'Joining…' : 'Accept invitation'}
          </Button>
          {!session.data && (
            <p className="muted">
              Already have an account?{' '}
              <Link href="/login" className="text-emerald-800 underline">
                Sign in
              </Link>
              , then reopen this invitation.
            </p>
          )}
        </form>
      )}
    </AuthLayout>
  );
}
