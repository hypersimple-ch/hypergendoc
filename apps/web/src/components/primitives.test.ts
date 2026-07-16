/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { createElement as h } from "react";
import { describe, expect, it, vi } from "vitest";
import { Dialog, FormField, Input } from "./primitives";

describe("accessible primitives", () => {
  it("connects a labelled field and exposes errors", () => {
    render(
      h(FormField, {
        label: "Email",
        error: "Required",
        children: h(Input, { "aria-label": "Email" }),
      }),
    );
    expect(screen.getByRole("textbox", { name: "Email" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Required");
  });
  it("closes the dialog with its labelled keyboard-focusable control", () => {
    const close = vi.fn();
    render(
      h(Dialog, {
        open: true,
        title: "Preview",
        onClose: close,
        children: "body",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(close).toHaveBeenCalledOnce();
    expect(screen.getByRole("dialog", { name: "Preview" })).toHaveAttribute(
      "aria-modal",
      "true",
    );
  });
});
