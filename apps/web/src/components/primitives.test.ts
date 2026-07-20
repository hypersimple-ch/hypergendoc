/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { createElement as h, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Dialog, FormField, Input, Select } from "./primitives";

Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  value: () => undefined,
  configurable: true,
});

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
  it("uses a controlled accessible select with keyboard opening and a selected indicator", () => {
    function Example() {
      const [value, setValue] = useState("");
      return h(Select, {
        value,
        onValueChange: setValue,
        placeholder: "Choose a company",
        "aria-label": "Company",
        required: true,
        options: [
          { value: "alpha", label: "Alpha" },
          { value: "beta", label: "Beta" },
        ],
      });
    }
    render(h(Example));
    const trigger = screen.getByRole("combobox", { name: "Company" });
    expect(trigger).toHaveAttribute("aria-required", "true");
    expect(trigger).toHaveTextContent("Choose a company");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(screen.getByRole("listbox")).toBeVisible();
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    fireEvent.click(trigger);
    const beta = screen.getByRole("option", { name: "Beta" });
    fireEvent.click(beta);
    expect(trigger).toHaveTextContent("Beta");
    expect(beta).toHaveAttribute("data-state", "checked");
  });

  it("manages unique labels, focus, Escape, and click-only backdrop closing", () => {
    const close = vi.fn();
    function Example() {
      const [open, setOpen] = useState(false);
      return h(
        "div",
        null,
        h("button", { onClick: () => setOpen(true) }, "Open"),
        h(Dialog, {
          open,
          title: "Preview",
          onClose: () => {
            close();
            setOpen(false);
          },
          children: h("button", null, "Last control"),
        }),
      );
    }
    render(h(Example));
    const opener = screen.getByRole("button", { name: "Open" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Preview" });
    const closeButton = screen.getByRole("button", { name: "Close dialog" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(closeButton).toHaveFocus();
    fireEvent.keyDown(closeButton, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("button", { name: "Last control" })).toHaveFocus();
    fireEvent.mouseDown(dialog);
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(dialog.parentElement!);
    expect(close).toHaveBeenCalledOnce();
    expect(opener).toHaveFocus();

    fireEvent.click(opener);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(close).toHaveBeenCalledTimes(2);
  });
});
