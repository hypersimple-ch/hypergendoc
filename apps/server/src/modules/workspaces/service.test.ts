import { describe, expect, it, vi } from "vitest";
import type { HumanActor } from "../auth/actors.js";
import { createWorkspaceReadService } from "./service.js";

const owner: HumanActor = {
  userId: "owner",
  workspaceId: "workspace",
  membershipId: "membership",
  role: "owner",
  requestId: "request",
};

function fixture() {
  const events = [{ id: "event-3" }, { id: "event-2" }, { id: "event-1" }];
  const repository = {
    findWorkspace: vi
      .fn()
      .mockResolvedValue({ id: "workspace", name: "Studio" }),
    listMembers: vi.fn().mockResolvedValue([]),
    listAuditEvents: vi
      .fn()
      .mockImplementation(
        (_workspaceId: string, limit: number, offset: number) =>
          Promise.resolve(events.slice(offset, offset + limit)),
      ),
  };
  return { repository, service: createWorkspaceReadService(repository) };
}

describe("workspace reads", () => {
  it("paginates audit events for owners inside the trusted workspace", async () => {
    const { repository, service } = fixture();

    await expect(service.audit(owner, 2, 0)).resolves.toEqual({
      items: [{ id: "event-3" }, { id: "event-2" }],
      nextOffset: 2,
    });
    expect(repository.listAuditEvents).toHaveBeenCalledWith("workspace", 3, 0);
  });

  it("does not expose audit events to members", async () => {
    const { repository, service } = fixture();

    await expect(
      service.audit({ ...owner, role: "member" }, 50, 0),
    ).rejects.toMatchObject({
      code: "forbidden",
    });
    expect(repository.listAuditEvents).not.toHaveBeenCalled();
  });
});
