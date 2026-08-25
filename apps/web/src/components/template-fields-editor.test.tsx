/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  TemplateFieldsEditor,
  fieldNameError,
  type Fields,
} from "./template-fields-editor";

const baseFields: Fields = {
  customerName: { type: "text", label: "Customer name", required: true },
  amount: { type: "money", label: "Amount", currency: "CHF", default: 0 },
};

afterEach(() => {
  cleanup();
});

describe("fieldNameError", () => {
  it("accepts contract-valid identifiers", () => {
    expect(fieldNameError("a")).toBeUndefined();
    expect(fieldNameError("customer_name-2")).toBeUndefined();
  });

  it("rejects malformed names and duplicates", () => {
    expect(fieldNameError("")).toBeDefined();
    expect(fieldNameError("9start")).toBeDefined();
    expect(fieldNameError("has space")).toBeDefined();
    expect(fieldNameError("éaccent")).toBeDefined();
    expect(fieldNameError("x".repeat(65))).toBeDefined();
    expect(fieldNameError("amount", baseFields)).toContain("already exists");
  });
});

function EditorHarness({
  initial,
  onChange,
}: {
  initial: Fields;
  onChange?: (fields: Fields) => void;
}) {
  const [fields, setFields] = useState(initial);
  return (
    <TemplateFieldsEditor
      fields={fields}
      onChange={(next) => {
        setFields(next);
        onChange?.(next);
      }}
    />
  );
}

describe("TemplateFieldsEditor", () => {
  it("lists fields with type, label, and flags", () => {
    render(<TemplateFieldsEditor fields={baseFields} onChange={vi.fn()} />);

    const table = screen.getByRole("table", { name: "Template fields" });
    expect(table).toHaveTextContent("customerName");
    expect(table).toHaveTextContent("Money");
    expect(table).toHaveTextContent("Customer name");
    expect(table).toHaveTextContent("Required");
    expect(table).toHaveTextContent("Has default");
  });

  it("adds a field through the form", () => {
    const onChange = vi.fn();
    render(<TemplateFieldsEditor fields={baseFields} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /Add field/ }));
    fireEvent.change(screen.getByLabelText("New field name"), {
      target: { value: "dueDate" },
    });
    fireEvent.change(screen.getByLabelText("New field label"), {
      target: { value: "Due date" },
    });
    fireEvent.click(document.querySelector('button[type="submit"]')!);

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]?.[0] as Fields;
    expect(next.dueDate).toEqual({ type: "text", label: "Due date" });
    expect(Object.keys(baseFields)).not.toContain("dueDate");
  });

  it("rejects duplicate names without calling onChange", () => {
    const onChange = vi.fn();
    render(<TemplateFieldsEditor fields={baseFields} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /Add field/ }));
    fireEvent.change(screen.getByLabelText("New field name"), {
      target: { value: "customerName" },
    });
    fireEvent.change(screen.getByLabelText("New field label"), {
      target: { value: "Dup" },
    });

    expect(screen.getByText(/already exists/)).toBeVisible();
    fireEvent.click(document.querySelector('button[type="submit"]')!);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("rejects invalid identifiers without calling onChange", () => {
    const onChange = vi.fn();
    render(<TemplateFieldsEditor fields={baseFields} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /Add field/ }));
    fireEvent.change(screen.getByLabelText("New field name"), {
      target: { value: "9bad name" },
    });
    fireEvent.change(screen.getByLabelText("New field label"), {
      target: { value: "Bad" },
    });

    expect(
      screen.getByText(/Start the name with an ASCII letter/),
    ).toBeVisible();
    fireEvent.click(document.querySelector('button[type="submit"]')!);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("edits the label and required flag of a selected field", () => {
    const onChange = vi.fn();
    render(<EditorHarness initial={baseFields} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit field customerName" }));
    const label = screen.getByLabelText("Label for customerName");
    fireEvent.change(label, { target: { value: "Client name" } });
    expect(onChange).toHaveBeenLastCalledWith({
      ...baseFields,
      customerName: { ...baseFields.customerName, label: "Client name" },
    });

    const required = screen.getByLabelText("Required for customerName");
    expect(required).toBeChecked();
    fireEvent.click(required);
    const call = onChange.mock.calls.at(-1)?.[0] as Fields;
    expect(call.customerName?.required).toBeUndefined();
    expect(
      screen.getByLabelText("Required for customerName"),
    ).not.toBeChecked();
  });

  it("edits the default value appropriate to the type", () => {
    const onChange = vi.fn();
    render(<EditorHarness initial={baseFields} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit field amount" }));
    const input = screen.getByLabelText("Default value for amount");
    fireEvent.change(input, { target: { value: "12.5" } });
    let call = onChange.mock.calls.at(-1)?.[0] as Fields;
    expect(call.amount?.default).toBe(12.5);

    const currency = screen.getByLabelText("Currency for amount");
    fireEvent.change(currency, { target: { value: "USD" } });
    call = onChange.mock.calls.at(-1)?.[0] as Fields;
    expect(call.amount?.currency).toBe("USD");
  });

  it("shows a read-only notice for object fields", () => {
    const onChange = vi.fn();
    render(
      <TemplateFieldsEditor
        fields={{
          nested: { type: "object", label: "Nested", fields: {} },
        }}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit field nested" }));
    expect(screen.getByText(/Edit this field in JSON/)).toBeVisible();
    expect(
      screen.queryByLabelText("Default value for nested"),
    ).not.toBeInTheDocument();
  });

  it("removes a field after confirmation", () => {
    const onChange = vi.fn();
    render(<TemplateFieldsEditor fields={baseFields} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove field customerName" }));
    expect(
      screen.getByRole("dialog", { name: /Remove field customerName/ }),
    ).toHaveTextContent(/validated on save/);

    fireEvent.click(screen.getByRole("button", { name: "Remove field" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]?.[0] as Fields;
    expect(next).toEqual({ amount: baseFields.amount });
  });

  it("disables controls when disabled with a reason", () => {
    render(
      <TemplateFieldsEditor
        fields={baseFields}
        disabled
        disabledReason="Fields editing is unavailable."
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText(/unavailable/)).toBeVisible();
    expect(screen.getByRole("button", { name: /Add field/ })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Remove field customerName" }),
    ).toBeDisabled();
  });
});
