import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';
export function Input({ className, ...props }: ComponentProps<'input'>) { return <input className={cn('h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:opacity-60', className)} {...props} />; }
