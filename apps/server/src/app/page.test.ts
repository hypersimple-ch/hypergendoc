import { describe, expect, it } from "vitest";
import { page } from "./page.js";

describe("page", () => {
  it("paginates document commits by commit SHA", () => {
    const commits = [
      { commitSha: "a".repeat(40) },
      { commitSha: "b".repeat(40) },
      { commitSha: "c".repeat(40) },
      { commitSha: "d".repeat(40) },
    ];
    const cursorKey = (commit: (typeof commits)[number]) => commit.commitSha;

    const first = page(commits, undefined, 2, cursorKey);
    expect(first).toEqual({
      items: commits.slice(0, 2),
      nextCursor: commits[1]!.commitSha,
    });

    expect(page(commits, first.nextCursor, 2, cursorKey)).toEqual({
      items: commits.slice(2),
    });
  });
});
