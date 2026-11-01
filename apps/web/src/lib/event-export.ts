import type { Page, StoredEvent } from '@eventlens/contracts';

export const EVENT_EXPORT_PAGE_SIZE = 100;
export const EVENT_EXPORT_MAX_PAGES = 10;

export async function collectEventExport(
  loadPage: (cursor?: string) => Promise<Page<StoredEvent>>,
): Promise<{ items: StoredEvent[]; truncated: boolean }> {
  const items: StoredEvent[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (let pageNumber = 0; pageNumber < EVENT_EXPORT_MAX_PAGES; pageNumber++) {
    const page = await loadPage(cursor);
    if (page.items.length > EVENT_EXPORT_PAGE_SIZE)
      throw new Error('Event export page exceeded its limit');
    items.push(...page.items);
    if (!page.nextCursor) return { items, truncated: false };
    if (seen.has(page.nextCursor))
      throw new Error('Event export received a repeated cursor');
    seen.add(page.nextCursor);
    cursor = page.nextCursor;
  }
  return { items, truncated: true };
}
