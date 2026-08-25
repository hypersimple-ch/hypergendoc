import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { AuditWriter } from "../../platform/audit.js";
import type { HumanActor } from "../auth/actors.js";
import {
  createInviteService,
  hashInviteToken,
  INVITE_TTL_MS,
} from "./service.js";
import type { InviteOperations } from "./repository.js";

const owner: HumanActor = {
  userId: "owner-1",
  workspaceId: "workspace-1",
  membershipId: "membership-1",
  role: "owner",
  requestId: "request-1",
};
const member: HumanActor = { ...owner, role: "member" };

const sha256 = (token: string) =>
  createHash("sha256").update(token).digest("hex");

interface SeededRow {
  id: string;
  workspaceId: string;
  email: string;
  role: "owner" | "member";
  tokenHash: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
  workspaceName?: string;
}

const seedRow = (overrides: Partial<SeededRow> = {}): SeededRow => ({
  id: "invite-1",
  workspaceId: "workspace-1",
  email: "new@example.test",
  role: "member",
  tokenHash: sha256("raw-token"),
  expiresAt: new Date(Date.now() + 60_000),
  acceptedAt: null,
  createdAt: new Date(),
  workspaceName: "Acme",
  ...overrides,
});

interface Capture {
  users: Array<{ email: string }>;
  memberships: Array<{ userId: string; role: string }>;
}

function operationsFor(
  rows: SeededRow[],
  existingUsers: string[],
  capture: Capture,
): InviteOperations {
  return {
    findByTokenHash: (tokenHash) =>
      Promise.resolve(rows.find((row) => row.tokenHash === tokenHash)),
    findPending: (workspaceId, email) =>
      Promise.resolve(
        rows.find(
          (row) =>
            row.workspaceId === workspaceId &&
            row.email === email &&
            row.acceptedAt === null,
        ),
      ),
    insert: (input) => {
      const row: SeededRow = {
        id: `invite-${rows.length + 1}`,
        workspaceId: input.workspaceId,
        email: input.email,
        role: input.role,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        acceptedAt: null,
        createdAt: new Date(),
      };
      rows.push(row);
      return Promise.resolve(row);
    },
    listPending: (workspaceId) =>
      Promise.resolve(
        rows.filter(
          (row) => row.workspaceId === workspaceId && row.acceptedAt === null,
        ),
      ),
    deletePending: (workspaceId, inviteId) => {
      const index = rows.findIndex(
        (row) => row.workspaceId === workspaceId && row.id === inviteId,
      );
      if (index < 0 || rows[index]!.acceptedAt)
        return Promise.resolve(false);
      rows.splice(index, 1);
      return Promise.resolve(true);
    },
    findUserIdByEmail: (email) =>
      Promise.resolve(
        existingUsers.includes(email) ? `user-for-${email}` : undefined,
      ),
    insertUser: () => Promise.resolve(),
    insertMembership: (input) => {
      capture.memberships.push({ userId: input.userId, role: input.role });
      return Promise.resolve({ id: `membership-${capture.memberships.length}` });
    },
    markAccepted: (inviteId, acceptedAt) => {
      const row = rows.find((item) => item.id === inviteId);
      if (row) row.acceptedAt = acceptedAt;
      return Promise.resolve();
    },
  };
}

function harness(
  rows: SeededRow[],
  existingUsers: string[] = [],
  signupMode: "open" | "invite" | "closed" = "invite",
) {
  const write = vi.fn<AuditWriter["write"]>().mockResolvedValue(undefined);
  const audit: AuditWriter = { write };
  const capture: Capture = { users: [], memberships: [] };
  const enqueued: Array<{ kind: string; recipient: string; url: string }> = [];
  const repository = {
    transaction: <T,>(
      operation: (
        operations: InviteOperations,
        audit: AuditWriter,
      ) => Promise<T>,
    ) => operation(operationsFor(rows, existingUsers, capture), audit),
  };
  const service = createInviteService({
    repository: repository,
    mailQueue: {
      enqueue: (input) => {
        enqueued.push({
          kind: input.kind,
          recipient: input.recipient,
          url: input.url,
        });
        return Promise.resolve();
      },
    },
    appOrigin: "https://app.test",
    signupMode,
  });
  return { service, rows, enqueued, write, capture };
}

describe("invite service", () => {
  it("creates a pending invite, returns the raw link once, and queues invite mail", async () => {
    const { service, rows, enqueued, write } = harness([]);
    const creation = await service.create(owner, {
      email: "New@Example.Test",
      role: "member",
    });
    expect(creation.link).toMatch(
      /^https:\/\/app\.test\/invite\/[A-Za-z0-9_-]+$/,
    );
    expect(creation.link.endsWith("/invite/raw-token")).toBe(false);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ email: "new@example.test", role: "member" });
    expect(rows[0]!.expiresAt.getTime() - Date.now()).toBeGreaterThan(
      INVITE_TTL_MS - 5_000,
    );
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]).toMatchObject({
      kind: "workspace_invite",
      recipient: "new@example.test",
    });
    expect(enqueued[0]!.url).toBe(creation.link);
    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({ event: "workspace_invite.created" }),
    );
  });

  it("rejects duplicate pending invites and existing accounts with conflict", async () => {
    const pending = harness([seedRow()]);
    await expect(
      pending.service.create(owner, {
        email: "new@example.test",
        role: "member",
      }),
    ).rejects.toMatchObject({ code: "conflict" });

    const taken = harness(
      [seedRow({ email: "taken@example.test", tokenHash: sha256("other") })],
      ["taken@example.test"],
    );
    await expect(
      taken.service.create(owner, { email: "taken@example.test", role: "member" }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("rejects non-owner creators, listers, and revokers", async () => {
    const { service } = harness([]);
    await expect(
      service.create(member, { email: "x@example.test", role: "member" }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(service.list(member)).rejects.toMatchObject({ code: "forbidden" });
    await expect(service.revoke(member, "invite-1")).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("revokes only pending invites of the current workspace", async () => {
    const rows = [seedRow()];
    const { service, write } = harness(rows);
    await service.revoke(owner, "invite-1");
    expect(rows).toHaveLength(0);
    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({ event: "workspace_invite.revoked" }),
    );

    const other = harness([
      seedRow({ workspaceId: "workspace-2", tokenHash: sha256("zzz") }),
    ]);
    await expect(other.service.revoke(owner, "invite-1")).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("inspects pending unexpired tokens and reports gone for used or expired ones", async () => {
    const seeded = [seedRow()];
    const live = harness(seeded);
    await expect(live.service.inspect("raw-token")).resolves.toEqual({
      workspaceName: "Acme",
      email: "new@example.test",
      role: "member",
      expiresAt: seeded[0]!.expiresAt.toISOString(),
    });

    const used = harness([
      seedRow({ acceptedAt: new Date(), tokenHash: sha256("used-token") }),
    ]);
    await expect(used.service.inspect("used-token")).rejects.toMatchObject({
      code: "gone",
    });

    const expired = harness([
      seedRow({
        expiresAt: new Date(Date.now() - 1),
        tokenHash: sha256("old-token"),
      }),
    ]);
    await expect(expired.service.inspect("old-token")).rejects.toMatchObject({
      code: "gone",
    });

    await expect(live.service.inspect("unknown-token")).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("accepts an invite by creating a verified member with the invited role", async () => {
    const insertedUsers: Array<{ email: string }> = [];
    const rows = [seedRow()];
    const { service, capture, write } = harnessWithInsertCapture(
      rows,
      insertedUsers,
    );
    const result = await service.accept("raw-token", {
      name: "New Person",
      password: "long-enough-password",
    });
    expect(result).toEqual({ workspaceName: "Acme" });
    expect(insertedUsers).toEqual([{ email: "new@example.test" }]);
    expect(capture.memberships).toHaveLength(1);
    expect(capture.memberships[0]!.role).toBe("member");
    expect(rows[0]!.acceptedAt).not.toBeNull();
    const events = write.mock.calls.map(
      ([event]) => (event as { event: string }).event,
    );
    expect(events).toContain("workspace_invite.accepted");
    expect(events).toContain("membership.added");
  });

  it("rejects acceptance for existing accounts, used or expired tokens", async () => {
    const takenRows = [seedRow()];
    const taken = harnessWithInsertCapture(takenRows, [], ["new@example.test"]);
    await expect(
      taken.service.accept("raw-token", {
        name: "X",
        password: "long-enough-password",
      }),
    ).rejects.toMatchObject({ code: "conflict" });

    const used = harnessWithInsertCapture([
      seedRow({ acceptedAt: new Date(), tokenHash: sha256("used") }),
    ]);
    await expect(
      used.service.accept("used", {
        name: "X",
        password: "long-enough-password",
      }),
    ).rejects.toMatchObject({ code: "gone" });

    const expired = harnessWithInsertCapture([
      seedRow({
        expiresAt: new Date(Date.now() - 1),
        tokenHash: sha256("old"),
      }),
    ]);
    await expect(
      expired.service.accept("old", {
        name: "X",
        password: "long-enough-password",
      }),
    ).rejects.toMatchObject({ code: "gone" });
  });

  it("rejects every acceptance in closed mode without touching storage", async () => {
    const closed = createInviteService({
      repository: {
        transaction: () =>
          Promise.reject(new Error("must not reach storage")),
      } as never,
      mailQueue: { enqueue: () => Promise.resolve() },
      appOrigin: "https://app.test",
      signupMode: "closed",
    });
    await expect(
      closed.accept("anything", {
        name: "X",
        password: "long-enough-password",
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});

/** Harness variant that captures created users for acceptance assertions. */
function harnessWithInsertCapture(
  rows: SeededRow[],
  insertedUsers: Array<{ email: string }> = [],
  existingUsers: string[] = [],
) {
  const write = vi.fn<AuditWriter["write"]>().mockResolvedValue(undefined);
  const audit: AuditWriter = { write };
  const capture: Capture = { users: [], memberships: [] };
  const operations = operationsFor(rows, existingUsers, capture);
  const wrapped: InviteOperations = {
    ...operations,
    insertUser: (input) => {
      insertedUsers.push({ email: input.email });
      return Promise.resolve();
    },
  };
  const service = createInviteService({
    repository: {
      transaction: <T,>(
        operation: (
          ops: InviteOperations,
          audit: AuditWriter,
        ) => Promise<T>,
      ) => operation(wrapped, audit),
    },
    mailQueue: { enqueue: () => Promise.resolve() },
    appOrigin: "https://app.test",
    signupMode: "open",
  });
  return { service, rows, write, capture };
}

describe("hashInviteToken", () => {
  it("stores only the sha256 hex digest of the raw token", () => {
    expect(hashInviteToken("abc")).toBe(sha256("abc"));
  });
});
