/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PdfPreview } from "./pdf-preview";

const createObjectURL = vi.fn();
const revokeObjectURL = vi.fn();
beforeEach(() => {
  createObjectURL.mockReset().mockReturnValue("blob:validated-pdf");
  revokeObjectURL.mockReset();
  vi.stubGlobal("URL", class extends URL {
    static override createObjectURL = createObjectURL;
    static override revokeObjectURL = revokeObjectURL;
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const pdf = () => new Response("%PDF-1.7\nfixture", { headers: { "Content-Type": "application/pdf; charset=binary" } });
const open = () => fireEvent.click(screen.getByRole("button", { name: "Preview PDF" }));

describe("authenticated PDF lifecycle", () => {
  it("retains validated bytes for viewing and links until the dialog closes", async () => {
    const fetcher = vi.fn().mockResolvedValue(pdf());
    vi.stubGlobal("fetch", fetcher);
    render(<PdfPreview src="/api/document.pdf" title="Proposal" />);
    open();
    const frame = await screen.findByTitle("Proposal PDF preview");
    expect(frame).toHaveAttribute("src", "blob:validated-pdf");
    expect(frame).not.toHaveAttribute("sandbox");
    fireEvent.load(frame);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    for (const name of ["Open PDF in a new tab", "Download PDF file"])
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", "blob:validated-pdf");
    expect(fetcher).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:validated-pdf");
  });

  it.each([401, 403, 404, 422, 503, 200])("never embeds an error/JSON response (HTTP %s)", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"error":"unavailable"}', {
      status, headers: { "Content-Type": "application/json" },
    })));
    render(<PdfPreview src="/api/document.pdf" title="Proposal" />);
    open();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("unavailable"));
    expect(screen.queryByTitle("Proposal PDF preview")).not.toBeInTheDocument();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Open PDF in a new tab" })).toHaveAttribute("href", "/api/document.pdf");
  });

  it("presents network failure without manufacturing a viewer", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    render(<PdfPreview src="/api/document.pdf" title="Proposal" />);
    open();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("unavailable"));
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("aborts a timed-out request and exits pending state without retry", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetcher = vi.fn((_src: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
      signal = options.signal as AbortSignal;
      signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    vi.stubGlobal("fetch", fetcher);
    render(<PdfPreview src="/api/document.pdf" title="Proposal" />);
    open();
    await act(async () => { await vi.advanceTimersByTimeAsync(40_000); });
    expect(signal?.aborted).toBe(true);
    expect(screen.getByRole("status")).toHaveTextContent("unavailable");
    expect(screen.queryByTitle("Proposal PDF preview")).not.toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each(["close", "unmount"])("aborts on %s and ignores an uncooperative late response", async (action) => {
    let finish!: (response: Response) => void;
    const pendingResponse = new Promise<Response>((resolve) => { finish = resolve; });
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_src: string, options: RequestInit) => {
      signal = options.signal as AbortSignal;
      return pendingResponse;
    }));
    const view = render(<PdfPreview src="/api/document.pdf" title="Proposal" />);
    open();
    if (action === "close")
      fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    else view.unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      finish(pdf());
      await pendingResponse;
    });
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("cancels the old source, ignores late bytes and revokes the new URL on unmount", async () => {
    let finishOld!: (response: Response) => void;
    const oldResponse = new Promise<Response>((resolve) => { finishOld = resolve; });
    let oldSignal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((src: string, options: RequestInit) => {
      if (src === "/api/old.pdf") {
        oldSignal = options.signal as AbortSignal;
        return oldResponse;
      }
      return Promise.resolve(pdf());
    }));
    const view = render(<PdfPreview src="/api/old.pdf" title="Proposal" />);
    open();
    view.rerender(<PdfPreview src="/api/new.pdf" title="Proposal" />);
    expect(oldSignal?.aborted).toBe(true);
    await screen.findByTitle("Proposal PDF preview");
    await act(async () => {
      finishOld(pdf());
      await oldResponse;
    });
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:validated-pdf");
  });
});
