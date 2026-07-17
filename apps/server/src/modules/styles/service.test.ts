/* eslint-disable @typescript-eslint/require-await */
import { describe, expect, it } from "vitest";
import type {
  Style,
  StyleDefinition,
  StyleVersion,
} from "@hypergendoc/contracts";
import type { AuditWriter } from "../../platform/audit.js";
import type { HumanActor } from "../auth/actors.js";
import { createStyleService, type StyleRepository } from "./service.js";

const actor: HumanActor = {
  userId: "user",
  workspaceId: "workspace-a",
  membershipId: "member",
  role: "member",
  requestId: "request",
};
const definition: StyleDefinition = {
  logoObjectId: null,
  bodyFont: "Inter",
  headingFont: "Inter",
  bodySizePt: 10,
  headingScale: 1.2,
  italicStyle: "italic",
  colors: {
    text: "#000000",
    heading: "#000000",
    primary: "#000000",
    accent: "#000000",
    muted: "#000000",
  },
  page: {
    size: "A4",
    marginTopMm: 10,
    marginRightMm: 10,
    marginBottomMm: 10,
    marginLeftMm: 10,
  },
  header: {
    enabled: false,
    leftText: "",
    centerText: "",
    rightText: "",
    showPageNumber: false,
  },
  footer: {
    enabled: false,
    leftText: "",
    centerText: "",
    rightText: "",
    showPageNumber: false,
  },
};
function repository(): StyleRepository {
  const styles: Style[] = [];
  const versions: StyleVersion[] = [];
  const result: StyleRepository = {
    transaction: async (work) => work(result),
    companyExists: async (workspace, company) =>
      workspace === "workspace-a" && company === "company-a",
    logoBelongsToCompany: async () => false,
    list: async (workspace, company) =>
      styles.filter(
        (style) => style.companyId === company && workspace === "workspace-a",
      ),
    find: async (workspace, id) =>
      styles.find((style) => style.id === id && workspace === "workspace-a"),
    listVersions: async (workspace, id) =>
      versions.filter(
        (version) => version.styleId === id && workspace === "workspace-a",
      ),
    findVersion: async (workspace, styleId, id) =>
      versions.find(
        (version) =>
          version.styleId === styleId &&
          version.id === id &&
          workspace === "workspace-a",
      ),
    createStyle: async (input) => {
      const style: Style = {
        id: `style-${styles.length}`,
        companyId: input.companyId,
        name: input.name,
        activeVersionId: null,
        archivedAt: null,
        createdAt: new Date().toISOString(),
      };
      styles.push(style);
      return style;
    },
    createNextVersion: async (input) => {
      const version: StyleVersion = {
        id: `version-${versions.length}`,
        styleId: input.styleId,
        version:
          Math.max(
            0,
            ...versions
              .filter((item) => item.styleId === input.styleId)
              .map((item) => item.version),
          ) + 1,
        definition: structuredClone(input.definition),
        createdByUserId: input.createdByUserId,
        createdAt: new Date().toISOString(),
      };
      versions.push(version);
      return version;
    },
    setActiveVersion: async (workspace, styleId, versionId) => {
      const style = styles.find(
        (item) => item.id === styleId && workspace === "workspace-a",
      );
      if (!style) return false;
      style.activeVersionId = versionId;
      return true;
    },
  };
  return result;
}
const audit: AuditWriter = { write: async () => undefined };
describe("style versions", () => {
  it("writes immutable versions, atomically activates a new version, and keeps history pinned", async () => {
    const service = createStyleService({
      repository: repository(),
      audit,
      renderer: {
        renderPreview: async () => ({
          url: "data:application/pdf;base64,AA==",
        }),
      },
    });
    const created = await service.create(actor, {
      companyId: "company-a",
      name: "brand",
      definition,
    });
    const changed = { ...definition, bodySizePt: 12 };
    const version = await service.createVersion(
      actor,
      created.style.id,
      changed,
      true,
    );
    changed.bodySizePt = 14;
    const history = await service.history(actor, created.style.id);
    expect(history).toHaveLength(2);
    expect(history[0]!.definition.bodySizePt).toBe(10);
    expect(history[1]!.definition.bodySizePt).toBe(12);
    await service.activate(actor, created.style.id, version.id);
  });
  it("hides foreign companies and rejects unowned uploaded logos", async () => {
    const service = createStyleService({
      repository: repository(),
      audit,
      renderer: {
        renderPreview: async () => ({
          url: "data:application/pdf;base64,AA==",
        }),
      },
    });
    await expect(service.list(actor, "company-b")).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(
      service.create(actor, {
        companyId: "company-a",
        name: "brand",
        definition: { ...definition, logoObjectId: "logo" },
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
  it("maps the style company-name uniqueness conflict", async () => {
    const repo = repository();
    repo.createStyle = async () => {
      throw Object.assign(new Error("duplicate style name"), {
        code: "23505",
        constraint: "style_company_name_unique",
      });
    };
    const service = createStyleService({
      repository: repo,
      audit,
      renderer: { renderPreview: async () => ({ url: "preview" }) },
    });

    await expect(
      service.create(actor, {
        companyId: "company-a",
        name: "brand",
        definition,
      }),
    ).rejects.toMatchObject({ code: "conflict" });
  });
  it("preserves unrelated repository failures during style creation", async () => {
    const failure = new Error("repository unavailable");
    const repo = repository();
    repo.createStyle = async () => {
      throw failure;
    };
    const service = createStyleService({
      repository: repo,
      audit,
      renderer: { renderPreview: async () => ({ url: "preview" }) },
    });

    await expect(
      service.create(actor, {
        companyId: "company-a",
        name: "brand",
        definition,
      }),
    ).rejects.toBe(failure);
  });
});
