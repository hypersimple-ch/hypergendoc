import { describe, expect, it } from "vitest";
import { allocateNextVersion } from "./versioning.js";

describe("allocateNextVersion", () => {
  it("allocates monotonically and never reuses a gap", () => {
    expect(allocateNextVersion([])).toBe(1);
    expect(allocateNextVersion([1, 3, 2])).toBe(4);
  });
});
