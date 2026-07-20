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

Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  value: () => undefined,
  configurable: true,
});

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

async function chooseOption(selectName: string, optionName: string) {
  fireEvent.click(screen.getByRole("combobox", { name: selectName }));
  fireEvent.click(await screen.findByRole("option", { name: optionName }));
}

async function openEditor() {
  companies.mockResolvedValue([companyB]);
  styles.mockResolvedValue([styleB]);
  style.mockResolvedValue({ style: styleB, versions: [version()] });
  render(<StylesDashboard />);
  await screen.findByRole("combobox", { name: "Filter styles by company" });
  await chooseOption("Filter styles by company", "Beta");
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
    await screen.findByRole("combobox", { name: "Company" });
    expect(
      document.querySelector('select:not([aria-hidden="true"])'),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("New style name")).toBeVisible();
    expect(screen.getByLabelText("Company")).toBeVisible();
    expect(screen.getByRole("button", { name: "Create style" })).toBeEnabled();
    expect(
      screen.getByRole("heading", { name: "Your style systems" }),
    ).toBeVisible();

    await chooseOption("Filter styles by company", "Alpha");
    await chooseOption("Filter styles by company", "Beta");
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

  it("creates a style from the company select", async () => {
    companies.mockResolvedValue([companyB]);
    styles.mockResolvedValue([styleB]);
    style.mockResolvedValue({ style: styleB, versions: [version()] });
    createStyle.mockResolvedValue(styleB);
    render(<StylesDashboard />);
    await screen.findByRole("combobox", { name: "Company" });
    fireEvent.change(screen.getByLabelText("New style name"), {
      target: { value: "Beta style" },
    });
    await chooseOption("Company", "Beta");
    fireEvent.click(screen.getByRole("button", { name: "Create style" }));
    await waitFor(() =>
      expect(createStyle).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: companyB.id, name: "Beta style" }),
      ),
    );
  });

  it("replaces browse with the selected style studio and restores browse when returning", async () => {
    companies.mockResolvedValue([companyB]);
    styles.mockResolvedValue([styleB]);
    style.mockResolvedValue({ style: styleB, versions: [version()] });
    render(<StylesDashboard />);
    await screen.findByRole("combobox", { name: "Filter styles by company" });
    await chooseOption("Filter styles by company", "Beta");
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
    expect(
      screen.getByRole("combobox", { name: "Filter styles by company" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Edit versions" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Back to style library" }),
    ).not.toBeInTheDocument();
  });

  it("edits one text role at a time and applies its styles to the live sample", async () => {
    await openEditor();

    fireEvent.click(
      screen.getByRole("radio", { name: /Body font IBM Plex Sans/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "H2" }));
    await chooseOption("Font family", "Libertinus Serif");
    await chooseOption("Weight", "500");
    fireEvent.change(screen.getByRole("slider", { name: "Font size" }), {
      target: { value: "30" },
    });
    expect(screen.getByRole("button", { name: "H2" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen
        .getByText(
          "Good design gives important information room to breathe. This sample makes the selected type, scale, and colors immediately visible.",
        )
        .closest("article"),
    ).toHaveStyle({ fontFamily: "IBM Plex Sans" });
    const h2 = screen.getByRole("heading", { name: "Strategy and direction" });
    expect(h2).toHaveStyle({
      fontFamily: "Libertinus Serif",
      fontSize: "30pt",
      fontWeight: "500",
    });

    fireEvent.click(screen.getByRole("button", { name: "Edit Heading color" }));
    fireEvent.change(screen.getByLabelText("Heading color hex"), {
      target: { value: "334455" },
    });
    expect(h2).toHaveStyle({ color: "#334455" });

    fireEvent.click(
      screen.getByRole("button", { name: "Save & activate version" }),
    );
    await waitFor(() => expect(createStyleVersion).toHaveBeenCalled());
    const saved = createStyleVersion.mock.calls.at(-1) as unknown as [
      string,
      {
        textStyles?: {
          h2: {
            fontFamily: string;
            fontSizePt: number;
            fontWeight: number;
            color: string;
          };
        };
      },
      boolean,
    ];
    expect(saved[0]).toBe(styleB.id);
    expect(saved[1].textStyles?.h2).toMatchObject({
      fontFamily: "Libertinus Serif",
      fontSizePt: 30,
      fontWeight: 500,
      color: "#334455",
    });
    expect(saved[2]).toBe(true);
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

    fireEvent.pointerDown(document.body);
    await waitFor(() =>
      expect(
        screen.queryByLabelText("Primary color hex"),
      ).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit Primary color" }));
    fireEvent.keyDown(screen.getByLabelText("Primary color hex"), {
      key: "Escape",
    });
    await waitFor(() =>
      expect(
        screen.queryByLabelText("Primary color hex"),
      ).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit Primary color" }));
    screen.getByRole("button", { name: "Back to style library" }).focus();
    await waitFor(() =>
      expect(
        screen.queryByLabelText("Primary color hex"),
      ).not.toBeInTheDocument(),
    );
  });

  it("updates representative page, typography, header, and footer controls in the live sample", async () => {
    await openEditor();

    expect(screen.getByRole("heading", { name: "Typography" })).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Color palette" }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "Page layout" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Brand assets" })).toBeVisible();
    const bodySize = screen.getByRole("slider", { name: "Body size" });
    const fontSize = screen.getByRole("slider", { name: "Font size" });
    fireEvent.change(bodySize, { target: { value: "12" } });
    fireEvent.change(fontSize, { target: { value: "24" } });
    fireEvent.click(screen.getByRole("radio", { name: "LETTER" }));
    fireEvent.change(screen.getByLabelText(/Top.*mm/), {
      target: { value: "30" },
    });
    const header = within(screen.getByRole("region", { name: "Header" }));
    const footer = within(screen.getByRole("region", { name: "Footer" }));
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
    expect(fontSize).toHaveValue("24");
    expect(screen.getByRole("radio", { name: "LETTER" })).toBeChecked();
    expect(screen.getByText("CONFIDENTIAL")).toBeVisible();
    expect(screen.getByText("Prepared for Beta")).toBeVisible();
    expect(
      header.getByRole("checkbox", { name: /Show page number/i }),
    ).toBeChecked();
  });

  it("allows numeric values to be cleared and replaced without overflowing", async () => {
    await openEditor();

    const bodyValue = screen.getByRole("spinbutton", {
      name: "Body size value",
    });
    const lineHeightValue = screen.getByRole("spinbutton", {
      name: "Line height value",
    });
    const rightMargin = screen.getByRole("spinbutton", {
      name: "Right margin value",
    });

    expect(bodyValue).toHaveValue(10);
    fireEvent.change(bodyValue, { target: { value: "" } });
    expect(bodyValue).toHaveValue(null);
    fireEvent.change(bodyValue, { target: { value: "12.5" } });
    expect(bodyValue).toHaveValue(12.5);
    expect(screen.getByRole("slider", { name: "Body size" })).toHaveValue(
      "12.5",
    );

    fireEvent.change(lineHeightValue, {
      target: { value: "1.2000000000000002" },
    });
    expect(lineHeightValue).toHaveValue(1.2);

    fireEvent.change(rightMargin, { target: { value: "" } });
    expect(rightMargin).toHaveValue(null);
    fireEvent.change(rightMargin, { target: { value: "15" } });
    expect(rightMargin).toHaveValue(15);
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
