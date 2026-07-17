/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const {
  companies,
  styles,
  createStyle,
  style,
  createStyleVersion,
  previewStyle,
} = vi.hoisted(() => ({
  companies: vi.fn(),
  styles: vi.fn(),
  createStyle: vi.fn(),
  style: vi.fn(),
  createStyleVersion: vi.fn(),
  previewStyle: vi.fn(),
}));
vi.mock("../lib/dashboard-api", () => ({
  dashboardApi: {
    companies,
    styles,
    createStyle,
    style,
    createStyleVersion,
    previewStyle,
  },
}));

import { StylesDashboard } from "./styles-dashboard";

const companyA = {
  id: "company-a",
  name: "Alpha",
  archivedAt: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const companyB = {
  id: "company-b",
  name: "Beta",
  archivedAt: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const styleB = {
  id: "style-b",
  companyId: "company-b",
  name: "Beta style",
  activeVersionId: null,
  archivedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("StylesDashboard", () => {
  it("ignores stale company style results and errors", async () => {
    companies.mockResolvedValue([companyA, companyB]);
    let rejectFirst!: (reason: Error) => void;
    let resolveSecond!: (value: (typeof styleB)[]) => void;
    styles
      .mockImplementationOnce(
        () => new Promise((_, reject) => (rejectFirst = reject)),
      )
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolveSecond = resolve)),
      );
    render(<StylesDashboard />);
    await waitFor(() =>
      expect(screen.getAllByRole("option", { name: "Alpha" })).toHaveLength(2),
    );

    const filter = screen.getByLabelText("Filter styles by company");
    fireEvent.change(filter, { target: { value: companyA.id } });
    fireEvent.change(filter, { target: { value: companyB.id } });
    resolveSecond([styleB]);
    expect(await screen.findByText("Beta style")).toBeVisible();
    rejectFirst(new Error("stale failure"));
    await waitFor(() =>
      expect(
        screen.queryByText("We could not load this page. Please try again."),
      ).not.toBeInTheDocument(),
    );
  });

  it("uses an enum-safe heading font select in the editor", async () => {
    companies.mockResolvedValue([companyB]);
    styles.mockResolvedValue([styleB]);
    style.mockResolvedValue({
      style: styleB,
      versions: [
        {
          id: "version-b",
          styleId: styleB.id,
          version: 1,
          createdByUserId: "user-1",
          createdAt: "2026-01-01T00:00:00.000Z",
          definition: {
            logoObjectId: null,
            bodyFont: "Inter",
            headingFont: "Noto Serif",
            bodySizePt: 10,
            headingScale: 1.5,
            italicStyle: "italic",
            colors: {
              text: "#1D2624",
              heading: "#1D403C",
              primary: "#1D403C",
              accent: "#A9442A",
              muted: "#68716B",
            },
            page: {
              size: "A4",
              marginTopMm: 20,
              marginRightMm: 20,
              marginBottomMm: 20,
              marginLeftMm: 20,
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
              showPageNumber: true,
            },
          },
        },
      ],
    });
    render(<StylesDashboard />);
    await waitFor(() =>
      expect(screen.getAllByRole("option", { name: "Beta" })).toHaveLength(2),
    );
    fireEvent.change(screen.getByLabelText("Filter styles by company"), {
      target: { value: companyB.id },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "Edit versions" }),
    );
    const heading = await screen.findByLabelText("Heading font");
    expect(heading.tagName).toBe("SELECT");
    expect(heading).toHaveDisplayValue("Noto Serif");
  });
});
