import {
  StyleDefinitionSchema,
  TemplateDefinitionSchema,
} from "@hypergendoc/contracts";
import { describe, expect, it, vi, afterEach } from "vitest";
import { api } from "./api-client";
import { dashboardApi } from "./dashboard-api";

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("api client", () => {
  it("sends cookie credentials and surfaces safe contract errors", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "unauthenticated",
            message: "Sign in required.",
            requestId: "request-123",
          },
        }),
        { status: 401 },
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    await expect(api("/api/workspaces/current")).rejects.toMatchObject({
      code: "unauthenticated",
      message: "Sign in required.",
    });
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      credentials: "include",
    });
  });
  it("does not expose malformed server responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 500 })),
    );
    await expect(api("/api/companies")).rejects.toMatchObject({
      message: "We could not complete that request. Please try again.",
    });
  });
});

const resourceId = "00000000-0000-4000-8000-000000000001";
const styleDefinition = StyleDefinitionSchema.parse({
  logoObjectId: null,
  bodyFont: "Inter",
  headingFont: "Noto Serif",
  bodySizePt: 10,
  headingScale: 1.5,
  italicStyle: "italic",
  colors: {
    text: "#111111",
    heading: "#111111",
    primary: "#111111",
    accent: "#111111",
    muted: "#111111",
  },
  page: {
    size: "A4",
    marginTopMm: 20,
    marginRightMm: 20,
    marginBottomMm: 20,
    marginLeftMm: 20,
  },
  header: { enabled: false },
  footer: { enabled: false },
});
const templateDefinition = TemplateDefinitionSchema.parse({
  schemaVersion: 1,
  styleVersionId: resourceId,
  fields: {
    title: { type: "text", label: "Title", required: true },
  },
  pageMasters: { standard: {} },
  document: [
    {
      type: "heading",
      level: 1,
      content: [{ type: "binding", path: "title" }],
    },
  ],
});
const previewRequests = [
  {
    name: "style",
    request: () => dashboardApi.previewStyle(resourceId, styleDefinition),
  },
  {
    name: "template",
    request: () =>
      dashboardApi.previewTemplate(resourceId, {
        definition: templateDefinition,
        data: { title: "Deadline fixture" },
      }),
  },
];

/** Simulate a delayed HTTP response that stops doing work when fetch is aborted. */
function delayedFetch(delayMs: number, payload: unknown) {
  const activity = { pending: 0, aborted: 0, responded: 0 };
  const fetcher = vi.fn(
    (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const signal = init?.signal;
      if (!signal) throw new Error("The request must provide an abort signal.");
      let resolve!: (response: Response) => void;
      let reject!: (reason: unknown) => void;
      const promise = new Promise<Response>((accept, fail) => {
        resolve = accept;
        reject = fail;
      });
      activity.pending += 1;
      const abort = () => {
        clearTimeout(responseTimer);
        signal.removeEventListener("abort", abort);
        activity.pending -= 1;
        activity.aborted += 1;
        reject(new DOMException("Aborted", "AbortError"));
      };
      const responseTimer = setTimeout(() => {
        signal.removeEventListener("abort", abort);
        activity.pending -= 1;
        activity.responded += 1;
        resolve(new Response(JSON.stringify(payload), { status: 200 }));
      }, delayMs);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      return promise;
    },
  );
  vi.stubGlobal("fetch", fetcher);
  return { activity, fetcher };
}

describe("API request deadlines", () => {
  it.each(previewRequests)(
    "lets a $name preview complete after fifteen seconds",
    async ({ request }) => {
      vi.useFakeTimers();
      const result = { url: "/api/preview-fixture/pdf" };
      const { activity, fetcher } = delayedFetch(15_000, result);
      const response = request();
      const assertion = expect(response).resolves.toEqual(result);

      await vi.advanceTimersByTimeAsync(12_000);
      expect(activity).toEqual({ pending: 1, aborted: 0, responded: 0 });
      await vi.advanceTimersByTimeAsync(3_000);
      await assertion;
      await vi.advanceTimersByTimeAsync(30_000);

      expect(activity).toEqual({ pending: 0, aborted: 0, responded: 1 });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each(previewRequests)(
    "times out a $name preview at forty seconds without leaving it pending or retrying",
    async ({ request }) => {
      vi.useFakeTimers();
      const { activity, fetcher } = delayedFetch(45_000, {
        url: "/api/preview-fixture/pdf",
      });
      const response = request();
      const assertion = expect(response).rejects.toMatchObject({
        code: "timeout",
      });

      await vi.advanceTimersByTimeAsync(39_999);
      expect(activity).toEqual({ pending: 1, aborted: 0, responded: 0 });
      await vi.advanceTimersByTimeAsync(1);
      await assertion;
      await vi.advanceTimersByTimeAsync(5_000);

      expect(activity).toEqual({ pending: 0, aborted: 1, responded: 0 });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("still aborts an ordinary API request at twelve seconds", async () => {
    vi.useFakeTimers();
    const { activity, fetcher } = delayedFetch(15_000, []);
    const response = api("/api/companies");
    const assertion = expect(response).rejects.toMatchObject({ code: "timeout" });

    await vi.advanceTimersByTimeAsync(11_999);
    expect(activity).toEqual({ pending: 1, aborted: 0, responded: 0 });
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
    await vi.advanceTimersByTimeAsync(3_000);

    expect(activity).toEqual({ pending: 0, aborted: 1, responded: 0 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
