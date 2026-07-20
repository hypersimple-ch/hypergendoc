export function page<T>(
  items: readonly T[],
  cursor?: string,
  limit = 50,
  cursorKey: (item: T) => string = (item) => (item as { id: string }).id,
) {
  const start = cursor
    ? Math.max(0, items.findIndex((item) => cursorKey(item) === cursor) + 1)
    : 0;
  const selected = items.slice(start, start + limit);
  const last = selected.at(-1);
  return {
    items: selected,
    ...(last && start + limit < items.length
      ? { nextCursor: cursorKey(last) }
      : {}),
  };
}
