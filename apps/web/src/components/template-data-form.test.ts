import { describe, expect, it } from "vitest";
import type { TemplateFieldDefinition } from "@hypergendoc/contracts";
import { requiredTemplateFieldError } from "./template-data-form";

const fields: Readonly<Record<string, TemplateFieldDefinition>> = {
  title: { type: "text", label: "Title", required: true },
  approved: { type: "boolean", label: "Approved", required: true },
  contact: {
    type: "object",
    label: "Contact",
    fields: {
      email: { type: "text", label: "Email", required: true },
    },
  },
};

describe("requiredTemplateFieldError", () => {
  it("names the first missing required field", () => {
    expect(requiredTemplateFieldError(fields, { approved: false })).toBe(
      "Title is required.",
    );
  });

  it("accepts false as a provided required boolean", () => {
    expect(
      requiredTemplateFieldError(fields, {
        title: "Ready",
        approved: false,
        contact: { email: "owner@example.test" },
      }),
    ).toBeUndefined();
  });

  it("reports nested required fields with context", () => {
    expect(
      requiredTemplateFieldError(fields, {
        title: "Ready",
        approved: true,
        contact: {},
      }),
    ).toBe("Contact → Email is required.");
  });
});
