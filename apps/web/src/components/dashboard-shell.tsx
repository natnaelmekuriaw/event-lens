'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Activity, ArrowUpRight, FolderKanban, LogOut, Settings } from 'lucide-react';
import { authClient } from '../lib/auth-client';
import { Button } from './ui/button';
import { FormMessage } from './form-message';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const session = authClient.useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [signOutError, setSignOutError] = useState<string | null>(null);
  useEffect(() => { if (!session.isPending && !session.data && !session.error) router.replace('/login'); }, [session.isPending, session.data, session.error, router]);
  if (session.isPending) return <main id="main" className="p-10" role="status">Loading workspace…</main>;
  if (session.error) return <main id="main" className="mx-auto max-w-xl p-10"><FormMessage error="Unable to check your session." /><Button className="mt-4" onClick={() => { void session.refetch(); }}>Try again</Button></main>;
  if (!session.data) return <main id="main" className="p-10" role="status">Opening sign in…</main>;
  return <div className="min-h-screen lg:grid lg:grid-cols-[232px_1fr]">
    <aside className="flex flex-col border-b border-stone-200 bg-[#eef0eb] p-5 lg:min-h-screen lg:border-b-0 lg:border-r">
      <Link href="/" className="mb-7 flex items-center gap-3 px-2 text-lg font-semibold tracking-tight"><span className="rounded-xl bg-emerald-800 p-2 text-white"><Activity size={20} aria-hidden="true" /></span>EventLens</Link>
      <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-stone-500">Workspace</p>
      <nav aria-label="Main navigation" className="flex gap-2 lg:flex-col">{[{ href: '/', label: 'Projects', icon: FolderKanban }, { href: '/account', label: 'Account', icon: Settings }].map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${pathname === href ? 'bg-white font-semibold shadow-sm' : 'text-stone-600 hover:bg-white/60'}`}><Icon size={17} aria-hidden="true" />{label}</Link>)}</nav>
      <div className="mt-auto hidden rounded-xl border border-stone-200 bg-white/60 p-4 lg:block"><p className="text-sm font-medium">Your data stays yours.</p><p className="muted mt-2 text-xs">Hosted on your infrastructure. Built in the open.</p><span className="mt-4 flex items-center gap-1 text-xs text-emerald-800">Self-hosted <ArrowUpRight size={12} aria-hidden="true" /></span></div>
    </aside>
    <div className="min-w-0"><header className="flex items-center justify-between gap-4 border-b border-stone-200 bg-white/70 px-6 py-4 lg:px-10"><span className="text-sm text-stone-500">Product analytics / <span className="text-stone-800">{pathname === '/account' ? 'Account' : 'Projects'}</span></span><div className="flex items-center gap-3"><span className="hidden text-sm text-stone-600 sm:block">{session.data.user.name}</span><Button variant="ghost" size="sm" onClick={async () => { setSignOutError(null); try { const result = await authClient.signOut(); if (result.error) throw new Error(); router.replace('/login'); } catch { setSignOutError('Sign out failed. Try again.'); } }}><LogOut size={15} aria-hidden="true" />Sign out</Button></div></header><main id="main" className="mx-auto max-w-6xl p-6 lg:p-10"><FormMessage error={signOutError} />{children}</main></div>
  </div>;
}
