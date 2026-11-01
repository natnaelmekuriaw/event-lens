import { describe, expect, it } from 'vitest';
import {
  collectEventExport,
  EVENT_EXPORT_MAX_PAGES,
} from '../../apps/web/src/lib/event-export';
import type { Page, StoredEvent } from '@eventlens/contracts';

function page(nextCursor: string | null): Page<StoredEvent> {
  return { items: [], nextCursor };
}

describe('bounded event export', () => {
  it('passes each cursor and stops after the final page', async () => {
    const cursors: (string | undefined)[] = [];
    const result = await collectEventExport(async (cursor) => {
      cursors.push(cursor);
      return page(cursor ? null : 'second');
    });
    expect(cursors).toEqual([undefined, 'second']);
    expect(result).toEqual({ items: [], truncated: false });
  });

  it('marks the export as truncated after ten pages', async () => {
    let calls = 0;
    const result = await collectEventExport(async () => {
      calls++;
      return page(`cursor-${calls}`);
    });
    expect(calls).toBe(EVENT_EXPORT_MAX_PAGES);
    expect(result.truncated).toBe(true);
  });

  it('rejects repeated cursors and propagates failed authorized reads', async () => {
    await expect(collectEventExport(async () => page('same'))).rejects.toThrow(
      'repeated cursor',
    );
    await expect(
      collectEventExport(async () => {
        throw new Error('Workspace not found');
      }),
    ).rejects.toThrow('Workspace not found');
  });
});
