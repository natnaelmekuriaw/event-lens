'use client';
import { Button } from '../components/ui/button';
export default function ErrorPage({ reset }: { reset: () => void }) { return <main id="main" className="mx-auto max-w-xl p-10"><h1 className="page-title">Something went wrong</h1><p className="muted my-4">We couldn’t load this page. Try again in a moment.</p><Button onClick={reset}>Try again</Button></main>; }
