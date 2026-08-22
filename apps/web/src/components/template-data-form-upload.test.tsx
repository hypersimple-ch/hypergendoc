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
import { ApiError } from "../lib/api-client";

const uploadImage = vi.hoisted(() => vi.fn());
vi.mock("../lib/dashboard-api", () => ({
  dashboardApi: { uploadImage },
}));

import { TemplateDataForm } from "./template-data-form";

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("TemplateDataForm image uploads", () => {
  it("resets a failed image upload so selecting the same file retries", async () => {
    uploadImage.mockRejectedValue(
      new ApiError(
        "validation_failed",
        "Choose a PNG, JPEG, or WebP image.",
        "request-upload-123",
      ),
    );
    render(
      <TemplateDataForm
        fields={{
          hero: { type: "image", label: "Hero image", required: true },
        }}
        data={{}}
        companyId="company-1"
        onChange={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("Hero image (required)");
    const file = new File(["invalid"], "hero.webp", { type: "image/webp" });
    let selectedPath = "C:\\fakepath\\hero.webp";
    Object.defineProperty(input, "value", {
      configurable: true,
      get: () => selectedPath,
      set: (value: string) => {
        selectedPath = value;
      },
    });

    expect(input).toHaveAttribute("accept", "image/png,image/jpeg,image/webp");
    expect(
      screen.getByText("PNG, JPEG, or WebP; maximum 10 MiB."),
    ).toBeVisible();

    fireEvent.change(input, { target: { files: [file] } });
    expect(
      await screen.findByText("Choose a PNG, JPEG, or WebP image."),
    ).toBeVisible();
    await waitFor(() => expect(selectedPath).toBe(""));

    selectedPath = "C:\\fakepath\\hero.webp";
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(uploadImage).toHaveBeenCalledTimes(2));
    expect(selectedPath).toBe("");
  });
});
