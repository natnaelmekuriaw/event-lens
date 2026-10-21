'use client';
import { useState } from 'react';
import { Button } from './ui/button';
import { Card } from './ui/card';

export function SecretValue({ title, value, onDismiss }: { title: string; value: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  return <Card className="my-6 border-emerald-300 bg-emerald-50/60"><h2 className="font-semibold">{title}</h2><p className="muted mt-2">Save this value now. You can’t retrieve it after closing this panel.</p><label className="field mt-4">Value<textarea readOnly value={value} rows={3} className="w-full rounded-lg border border-emerald-200 bg-white p-3 font-mono text-xs" onFocus={(event) => event.currentTarget.select()} /></label><div className="mt-4 flex flex-wrap gap-3"><Button variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(value); setCopied(true); } catch { setCopied(false); } }}>{copied ? 'Copied' : 'Copy value'}</Button><Button variant="ghost" onClick={onDismiss}>I’ve saved it</Button></div><p role="status" className="sr-only">{copied ? 'Value copied to clipboard' : ''}</p></Card>;
}
