import { AppError } from "../platform/errors.js";

export function page<T>(
  items: readonly T[],
  cursor?: string,
  limit = 50,
  cursorKey: (item: T) => string = (item) => (item as { id: string }).id,
) {
  const cursorIndex = cursor
    ? items.findIndex((item) => cursorKey(item) === cursor)
    : undefined;
  if (cursorIndex === -1) throw new AppError("validation_failed", 400);
  const start = cursorIndex === undefined ? 0 : cursorIndex + 1;
  const selected = items.slice(start, start + limit);
  const last = selected.at(-1);
  return {
    items: selected,
    ...(last && start + limit < items.length
      ? { nextCursor: cursorKey(last) }
      : {}),
  };
}
