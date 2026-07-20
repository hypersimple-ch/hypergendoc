export function page<T>(items: readonly T[], cursor?: string, limit = 50) {
  const start = cursor
    ? Math.max(
        0,
        items.findIndex((item) => (item as { id: string }).id === cursor) + 1,
      )
    : 0;
  const selected = items.slice(start, start + limit);
  const last = selected.at(-1) as { id: string } | undefined;
  return {
    items: selected,
    ...(last && start + limit < items.length ? { nextCursor: last.id } : {}),
  };
}
