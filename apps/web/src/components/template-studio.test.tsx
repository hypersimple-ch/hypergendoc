/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Template, TemplateDefinition, TemplateVersion } from "@hypergendoc/contracts";

const { template, createTemplateVersion, activateTemplate, push } = vi.hoisted(
  () => ({
    template: vi.fn(),
    createTemplateVersion: vi.fn(),
    activateTemplate: vi.fn(),
    push: vi.fn(),
  }),
);

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("../lib/dashboard-api", () => ({
  dashboardApi: { template, createTemplateVersion, activateTemplate },
}));

import { TemplateStudio } from "./template-studio";
import { UnsavedChangesProvider } from "./unsaved-changes";
type TemplateFixture = {
  template: Pick<Template, "id" | "companyId" | "name" | "activeVersionId">;
  versions: Pick<TemplateVersion, "id" | "version" | "definition" | "createdAt">[];
};

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function definition(text: string): TemplateDefinition {
  return {
    schemaVersion: 1,
    styleVersionId: "style-version-1",
    fields: {
      customer: { type: "text", label: "Customer", default: text },
    },
    pageMasters: {},
    document: [],
  };
}

function detail(id: string, latest = definition("Original"), active = "version-1"): TemplateFixture {
  return {
    template: {
      id,
      companyId: "company-1",
      name: `Template ${id}`,
      activeVersionId: active,
    },
    versions: [
      {
        id: "version-1",
        version: 1,
        definition: definition("Historical"),
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "version-2",
        version: 2,
        definition: latest,
        createdAt: "2026-01-02T00:00:00.000Z",
      },
    ],
  };
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function studio(id = "template-1") {
  return (
    <UnsavedChangesProvider>
      <TemplateStudio templateId={id} />
    </UnsavedChangesProvider>
  );
}

function editSource(text: string) {
  fireEvent.change(screen.getByLabelText("Template definition (JSON)"), {
    target: { value: text },
  });
}

async function finish<T>(pending: Deferred<T>, value: T) {
  await act(async () => {
    pending.resolve(value);
    await pending.promise;
  });
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("TemplateStudio draft lifecycle", () => {
  it("preserves newer source during save and history reload, using the submitted definition as the baseline", async () => {
    const saved = deferred<unknown>();
    const history = deferred<TemplateFixture>();
    template.mockResolvedValueOnce(detail("template-1"))
      .mockReturnValueOnce(history.promise);
    createTemplateVersion.mockReturnValueOnce(saved.promise);
    render(studio());
    await screen.findByLabelText("Template definition (JSON)");

    const submitted = definition("Submitted A");
    editSource(JSON.stringify(submitted));
    fireEvent.click(screen.getByRole("button", { name: "Save inactive" }));
    expect(screen.getByLabelText("Template definition (JSON)")).toBeEnabled();
    const newer = JSON.stringify(definition("Newer B"), null, 2);
    editSource(newer);
    await finish(saved, {});
    expect(screen.getByLabelText("Template definition (JSON)")).toHaveValue(newer);
    expect(screen.getByText("Unsaved changes")).toBeVisible();

    fireEvent.click(screen.getByRole("link", { name: "Template library" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Leave with unsaved changes?");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(push).not.toHaveBeenCalled();

    editSource(JSON.stringify(submitted, null, 2));
    expect(screen.getByText("All changes saved")).toBeVisible();
    const afterSave = JSON.stringify(definition("After save C"), null, 2);
    editSource(afterSave);
    await finish(history, detail("template-1", submitted));
    expect(screen.getByLabelText("Template definition (JSON)")).toHaveValue(afterSave);
    expect(screen.getByText("Unsaved changes")).toBeVisible();
  });

  it("keeps sample values and local fields across inactive saves and historical activation", async () => {
    const savedHistory = deferred<TemplateFixture>();
    const activatedHistory = deferred<TemplateFixture>();
    template.mockResolvedValueOnce(detail("template-1", definition("Original"), "version-2"))
      .mockReturnValueOnce(savedHistory.promise)
      .mockReturnValueOnce(activatedHistory.promise);
    createTemplateVersion.mockResolvedValue({});
    activateTemplate.mockResolvedValue({});
    render(studio());
    await screen.findByLabelText("Template definition (JSON)");
    fireEvent.click(screen.getByRole("button", { name: "Sample data" }));
    fireEvent.change(screen.getByLabelText("Customer"), {
      target: { value: "Sample customer" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save inactive" }));
    await waitFor(() => expect(screen.getByLabelText("Customer")).toBeEnabled());
    await finish(savedHistory, detail("template-1", definition("Server default"), "version-2"));
    expect(screen.getByLabelText("Customer")).toHaveValue("Sample customer");

    fireEvent.click(screen.getByRole("button", { name: "Activate version 1" }));
    await waitFor(() => expect(screen.getByLabelText("Customer")).toBeEnabled());
    await finish(activatedHistory, detail("template-1", definition("Historical reload"), "version-1"));
    expect(screen.getByLabelText("Customer")).toHaveValue("Sample customer");
    fireEvent.click(screen.getByRole("button", { name: "Definition" }));
    expect(screen.getByLabelText("Template definition (JSON)")).toHaveValue(
      JSON.stringify(definition("Original"), null, 2),
    );

    const changedFields = {
      ...definition("Changed default"),
      fields: {
        ...definition("Changed default").fields,
        note: { type: "text", label: "Note", default: "New field default" },
      },
    };
    editSource(JSON.stringify(changedFields));
    fireEvent.click(screen.getByRole("button", { name: "Apply fields locally" }));
    fireEvent.click(screen.getByRole("button", { name: "Sample data" }));
    expect(screen.getByLabelText("Customer")).toHaveValue("Sample customer");
    expect(screen.getByLabelText("Note")).toHaveValue("New field default");
  });

  it("hides retained old detail on an ID switch and ignores an outstanding old reload", async () => {
    const oldHistory = deferred<TemplateFixture>();
    const newDetail = deferred<TemplateFixture>();
    template.mockResolvedValueOnce(detail("template-1"))
      .mockReturnValueOnce(oldHistory.promise)
      .mockReturnValueOnce(newDetail.promise);
    createTemplateVersion.mockResolvedValue({});
    const view = render(studio());
    await screen.findByLabelText("Template definition (JSON)");
    fireEvent.click(screen.getByRole("button", { name: "Save inactive" }));
    await waitFor(() => expect(template).toHaveBeenCalledTimes(2));
    view.rerender(studio("template-2"));
    expect(screen.queryByLabelText("Template definition (JSON)")).not.toBeInTheDocument();
    expect(screen.queryByText("Template template-1")).not.toBeInTheDocument();
    await finish(oldHistory, detail("template-1", definition("Stale old draft")));
    expect(screen.queryByLabelText("Template definition (JSON)")).not.toBeInTheDocument();
    await finish(newDetail, detail("template-2", definition("New resource")));
    expect(screen.getByLabelText("Template definition (JSON)")).toHaveValue(
      JSON.stringify(definition("New resource"), null, 2),
    );
    expect(screen.getByText("All changes saved")).toBeVisible();
  });

  it("initializes after retrying a failed initial load", async () => {
    template.mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(detail("template-1", definition("Retry result")));
    render(studio());
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByLabelText("Template definition (JSON)")).toHaveValue(
      JSON.stringify(definition("Retry result"), null, 2),
    );
  });
});
