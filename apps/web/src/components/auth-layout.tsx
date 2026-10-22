import Link from 'next/link';
import { Activity } from 'lucide-react';
export function AuthLayout({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main id="main" className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-stone-900 p-14 text-white lg:flex">
        <Link
          href="/"
          className="flex items-center gap-3 text-xl font-semibold"
        >
          <Activity className="text-emerald-400" aria-hidden="true" />
          EventLens
        </Link>
        <div>
          <p className="mb-5 text-sm uppercase tracking-[.2em] text-emerald-300">
            Your product. Your data.
          </p>
          <h2 className="max-w-lg text-5xl font-medium leading-tight tracking-tight">
            A clearer view of what happens next.
          </h2>
          <p className="mt-6 max-w-md text-stone-400">
            Understand how people use your product, with analytics that stay on
            your infrastructure.
          </p>
        </div>
        <p className="text-sm text-stone-500">Self-hosted · Open source</p>
      </section>
      <section className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <p className="mb-10 text-lg font-semibold lg:hidden">EventLens</p>
          <h1 className="page-title">{title}</h1>
          <p className="muted mb-8 mt-3">{description}</p>
          {children}
        </div>
      </section>
    </main>
  );
}
