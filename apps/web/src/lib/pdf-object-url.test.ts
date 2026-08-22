/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { openTemporaryPdf } from "./pdf-object-url";

describe("openTemporaryPdf", () => {
  it("opens a PDF blob and revokes its URL after the bounded lifetime", () => {
    const createObjectURL = vi.fn(() => "blob:http://localhost/preview");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
    const replace = vi.fn();
    const addEventListener = vi.fn();
    const previewWindow = {
      location: { replace },
      opener: window,
      addEventListener,
    } as unknown as Window;
    let cleanup!: () => void;
    const schedule = vi.fn((callback: () => void) => {
      cleanup = callback;
    });

    expect(openTemporaryPdf(previewWindow, new ArrayBuffer(4), schedule)).toBe(
      "blob:http://localhost/preview",
    );
    expect(replace).toHaveBeenCalledWith("blob:http://localhost/preview");
    expect(previewWindow.opener).toBeNull();
    expect(addEventListener).toHaveBeenCalledWith(
      "load",
      expect.any(Function),
      { once: true },
    );
    expect(schedule).toHaveBeenCalledWith(expect.any(Function), 60_000);

    cleanup();
    expect(revokeObjectURL).toHaveBeenCalledOnce();
  });
});
