/** Allocates the next monotonic immutable version from tenant-scoped existing rows. */
export function allocateNextVersion(
  existingVersions: readonly number[],
): number {
  const highest = existingVersions.reduce(
    (current, version) => Math.max(current, version),
    0,
  );
  return highest + 1;
}
