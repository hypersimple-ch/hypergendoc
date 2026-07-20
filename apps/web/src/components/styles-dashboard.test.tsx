/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
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
const definition = {
  logoObjectId: null,
  bodyFont: "Inter" as const,
  headingFont: "Noto Serif" as const,
  bodySizePt: 10,
  headingScale: 1.5,
  italicStyle: "italic" as const,
  colors: {
    text: "#1D2624",
    heading: "#1D403C",
    primary: "#1D403C",
    accent: "#A9442A",
    muted: "#68716B",
  },
  page: {
    size: "A4" as const,
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
};
const version = (overrides: Partial<typeof definition> = {}) => ({
  id: "version-b",
  styleId: styleB.id,
  version: 1,
  createdByUserId: "user-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  definition: { ...definition, ...overrides },
});

async function openEditor() {
  companies.mockResolvedValue([companyB]);
  styles.mockResolvedValue([styleB]);
  style.mockResolvedValue({ style: styleB, versions: [version()] });
  render(<StylesDashboard />);
  await waitFor(() =>
    expect(screen.getAllByRole("option", { name: "Beta" })).toHaveLength(2),
  );
  fireEvent.change(screen.getByLabelText("Filter styles by company"), {
    target: { value: companyB.id },
  });
  fireEvent.click(await screen.findByRole("button", { name: "Edit versions" }));
  await screen.findByRole("radio", { name: /Body font Inter/ });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe("StylesDashboard", () => {
  it("renders the browse presentation and ignores stale style results and errors", async () => {
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

    expect(
      screen.getByRole("heading", { name: "Structured brand systems." }),
    ).toBeVisible();
    await waitFor(() =>
      expect(screen.getAllByRole("option", { name: "Alpha" })).toHaveLength(2),
    );
    expect(screen.getByLabelText("New style name")).toBeVisible();
    expect(screen.getByLabelText("Company")).toBeVisible();
    expect(screen.getByRole("button", { name: "Create style" })).toBeEnabled();
    expect(
      screen.getByRole("heading", { name: "Your style systems" }),
    ).toBeVisible();

    const filter = screen.getByLabelText("Filter styles by company");
    fireEvent.change(filter, { target: { value: companyA.id } });
    fireEvent.change(filter, { target: { value: companyB.id } });
    resolveSecond([styleB]);
    expect(await screen.findByText("Beta style")).toBeVisible();
    expect(screen.getByRole("button", { name: "Edit versions" })).toBeEnabled();
    rejectFirst(new Error("stale failure"));
    await waitFor(() =>
      expect(
        screen.queryByText("We could not load this page. Please try again."),
      ).not.toBeInTheDocument(),
    );
  });

  it("replaces browse with the selected style studio and restores browse when returning", async () => {
    companies.mockResolvedValue([companyB]);
    styles.mockResolvedValue([styleB]);
    style.mockResolvedValue({ style: styleB, versions: [version()] });
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

    expect(
      await screen.findByRole("heading", { name: "Beta style" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Back to style library" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Structured brand systems." }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("New style name")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Filter styles by company"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Edit versions" }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Back to style library" }),
    );
    expect(
      screen.getByRole("heading", { name: "Structured brand systems." }),
    ).toBeVisible();
    expect(screen.getByLabelText("New style name")).toBeVisible();
    expect(screen.getByLabelText("Filter styles by company")).toBeVisible();
    expect(screen.getByRole("button", { name: "Edit versions" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Back to style library" }),
    ).not.toBeInTheDocument();
  });

  it("loads the latest definition and applies selected font families to the live sample", async () => {
    await openEditor();

    const bodyFont = screen.getByRole("radio", { name: /Body font Inter/ });
    const headingFont = screen.getByRole("radio", {
      name: /Heading font Noto Serif/,
    });
    expect(bodyFont).toHaveAttribute("type", "radio");
    expect(headingFont).toHaveAttribute("type", "radio");
    expect(bodyFont).toBeChecked();
    expect(headingFont).toBeChecked();

    fireEvent.click(
      screen.getByRole("radio", { name: /Body font IBM Plex Sans/ }),
    );
    fireEvent.click(
      screen.getByRole("radio", { name: /Heading font Libertinus Serif/ }),
    );
    expect(
      screen.getByRole("radio", { name: /Body font IBM Plex Sans/ }),
    ).toBeChecked();
    expect(
      screen.getByRole("radio", { name: /Heading font Libertinus Serif/ }),
    ).toBeChecked();
    expect(
      screen
        .getByText(
          "Good design gives important information room to breathe. This sample makes the selected type, scale, and colors immediately visible.",
        )
        .closest("article"),
    ).toHaveStyle({ fontFamily: "IBM Plex Sans" });
    expect(
      screen.getByRole("heading", { name: "A clearer way to make progress" }),
    ).toHaveStyle({
      fontFamily: "Libertinus Serif",
    });
  });

  it("integrates the hex picker without a native color input and closes its disclosure", async () => {
    await openEditor();

    fireEvent.click(screen.getByRole("button", { name: "Edit Primary color" }));
    const hex = await screen.findByLabelText("Primary color hex");
    expect(screen.queryByDisplayValue("#1D403C")).toBeInTheDocument();
    expect(
      document.querySelector('input[type="color"]'),
    ).not.toBeInTheDocument();
    fireEvent.change(hex, { target: { value: "a9442a" } });
    expect(hex).toHaveValue("#A9442A");
    const previewPage = screen
      .getByText(/Good design gives important information room to breathe/)
      .closest("article");
    expect(previewPage).toHaveStyle("--primary-color: #A9442A");

    fireEvent.keyDown(hex, { key: "Escape" });
    await waitFor(() =>
      expect(
        screen.queryByLabelText("Primary color hex"),
      ).not.toBeInTheDocument(),
    );
  });

  it("updates representative page, typography, header, and footer controls in the live sample", async () => {
    await openEditor();

    const sliders = within(
      screen.getByRole("group", { name: "Typography" }),
    ).getAllByRole("slider");
    expect(sliders).toHaveLength(2);
    const bodySize = sliders[0]!;
    const headingScale = sliders[1]!;
    fireEvent.change(bodySize, { target: { value: "12" } });
    fireEvent.change(headingScale, { target: { value: "2" } });
    fireEvent.click(screen.getByRole("radio", { name: "LETTER" }));
    fireEvent.change(screen.getByLabelText(/Top.*mm/), {
      target: { value: "30" },
    });
    const header = within(screen.getByRole("group", { name: "Header" }));
    const footer = within(screen.getByRole("group", { name: "Footer" }));
    fireEvent.click(header.getByRole("checkbox", { name: /Enable header/i }));
    fireEvent.change(header.getByLabelText(/Header .*left text/i), {
      target: { value: "CONFIDENTIAL" },
    });
    fireEvent.click(
      header.getByRole("checkbox", { name: /Show page number/i }),
    );
    fireEvent.click(footer.getByRole("checkbox", { name: /Enable footer/i }));
    fireEvent.change(footer.getByLabelText(/Footer .*center text/i), {
      target: { value: "Prepared for Beta" },
    });

    expect(bodySize).toHaveValue("12");
    expect(headingScale).toHaveValue("2");
    expect(screen.getByRole("radio", { name: "LETTER" })).toBeChecked();
    expect(screen.getByText("CONFIDENTIAL")).toBeVisible();
    expect(screen.getByText("Prepared for Beta")).toBeVisible();
    expect(
      header.getByRole("checkbox", { name: /Show page number/i }),
    ).toBeChecked();
  });

  it("saves immutable active and inactive versions, reloads active history, and previews through a pre-opened window", async () => {
    await openEditor();
    const freshStyle = { ...styleB, activeVersionId: "version-active" };
    createStyleVersion
      .mockResolvedValueOnce({ ...version(), id: "version-active", version: 2 })
      .mockResolvedValueOnce({
        ...version(),
        id: "version-inactive",
        version: 3,
      });
    style
      .mockResolvedValueOnce({
        style: freshStyle,
        versions: [{ ...version(), id: "version-active", version: 2 }],
      })
      .mockResolvedValueOnce({
        style: freshStyle,
        versions: [
          { ...version(), id: "version-active", version: 2 },
          { ...version(), id: "version-inactive", version: 3 },
        ],
      });

    fireEvent.click(
      screen.getByRole("button", { name: "Save & activate version" }),
    );
    await waitFor(() =>
      expect(createStyleVersion).toHaveBeenCalledWith(
        styleB.id,
        definition,
        true,
      ),
    );
    await waitFor(() => expect(style).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Active")).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", { name: "Save inactive version" }),
    );
    await waitFor(() =>
      expect(createStyleVersion).toHaveBeenLastCalledWith(
        styleB.id,
        definition,
        false,
      ),
    );
    await waitFor(() => expect(style).toHaveBeenCalledTimes(3));

    const popup = { location: { href: "" }, close: vi.fn() };
    let rejectPreview!: (reason: Error) => void;
    vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    previewStyle.mockImplementationOnce(
      () => new Promise((_, reject) => (rejectPreview = reject)),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Constrained PDF preview" }),
    );
    await waitFor(() =>
      expect(previewStyle).toHaveBeenCalledWith(styleB.id, definition),
    );
    expect(window.open).toHaveBeenCalled();
    rejectPreview(new Error("Preview unavailable"));
    await waitFor(() => expect(popup.close).toHaveBeenCalled());
    expect(
      await screen.findByText("We could not load this page. Please try again."),
    ).toBeVisible();
  });
});
