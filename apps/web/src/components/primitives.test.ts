/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement as h, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dialog, FormField, Input, Select } from "./primitives";

Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  value: () => undefined,
  configurable: true,
});

afterEach(cleanup);

describe("accessible primitives", () => {
  it("associates native controls with unique labels, hints, and errors", () => {
    render(
      h(
        "div",
        null,
        h(FormField, {
          label: "Workspace name",
          hint: "Used in URLs.",
          error: "A workspace name is required.",
          children: h(Input, { required: true, disabled: true }),
        }),
        h(FormField, {
          label: "Workspace name",
          hint: "Choose a distinct name.",
          children: h(Input, null),
        }),
      ),
    );

    const controls = screen.getAllByRole("textbox", { name: "Workspace name" });
    const invalidControl = controls[0]!;
    const otherControl = controls[1]!;
    const hint = screen.getByText("Used in URLs.");
    const error = screen.getByRole("alert");
    expect(invalidControl).toBeRequired();
    expect(invalidControl).toBeDisabled();
    expect(invalidControl).toHaveAttribute(
      "aria-describedby",
      `${hint.id} ${error.id}`,
    );
    expect(invalidControl).toHaveAttribute("aria-invalid", "true");
    expect(invalidControl.id).not.toBe(otherControl.id);
    expect(hint.id).not.toBe("workspace-name-hint");
  });

  it("associates a controlled Radix select and preserves keyboard semantics", () => {
    function Example() {
      const [value, setValue] = useState("");
      return h(FormField, {
        label: "Company",
        hint: "Choose the company for this style.",
        error: "Company is required.",
        children: h(Select, {
          value,
          onValueChange: setValue,
          placeholder: "Choose a company",
          required: true,
          options: [
            { value: "alpha", label: "Alpha" },
            { value: "beta", label: "Beta" },
          ],
        }),
      });
    }
    render(h(Example));
    const trigger = screen.getByRole("combobox", { name: "Company" });
    const hint = screen.getByText("Choose the company for this style.");
    const error = screen.getByText("Company is required.");
    expect(trigger).toHaveAttribute("aria-required", "true");
    expect(trigger).toHaveAttribute(
      "aria-describedby",
      `${hint.id} ${error.id}`,
    );
    expect(trigger).toHaveAttribute("aria-invalid", "true");
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

  it("keeps disabled Radix selects unavailable", () => {
    render(
      h(Select, {
        value: "alpha",
        onValueChange: vi.fn(),
        placeholder: "Choose a company",
        "aria-label": "Disabled company",
        disabled: true,
        options: [{ value: "alpha", label: "Alpha" }],
      }),
    );
    expect(
      screen.getByRole("combobox", { name: "Disabled company" }),
    ).toBeDisabled();
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
