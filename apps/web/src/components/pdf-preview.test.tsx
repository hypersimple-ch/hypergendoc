/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PdfPreview } from "./pdf-preview";

afterEach(cleanup);

describe("PdfPreview", () => {
  it("keeps open and download fallbacks beside the inline preview", () => {
    render(<PdfPreview src="/api/document.pdf" title="Proposal" />);
    fireEvent.click(screen.getByRole("button", { name: "Preview PDF" }));

    const frame = screen.getByTitle("Proposal PDF preview");
    expect(screen.getByRole("status")).toHaveTextContent("Loading PDF");
    expect(
      screen.getByRole("link", { name: "Open PDF in a new tab" }),
    ).toHaveAttribute("href", "/api/document.pdf");
    expect(
      screen.getByRole("link", { name: "Download PDF file" }),
    ).toHaveAttribute("download");

    fireEvent.load(frame);
    expect(screen.getByRole("status")).toHaveTextContent("preview loaded");
  });
});
