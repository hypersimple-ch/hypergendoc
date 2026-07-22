/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Empty, LoadState, useLoaded } from "./dashboard-state";

afterEach(cleanup);

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("dashboard state", () => {
  it("announces secure loading without exposing an empty or error state", () => {
    render(<LoadState loading />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading secure workspace data…",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("offers an explicit retry for load failures", () => {
    const retry = vi.fn();
    render(
      <LoadState
        loading={false}
        error="We could not load this page."
        onRetry={retry}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("We could not load this page.");
    screen.getByRole("button", { name: "Try again" }).click();
    expect(retry).toHaveBeenCalledOnce();
  });

  it("announces an empty result without presenting it as an error", () => {
    render(<Empty>No matching documents.</Empty>);
    expect(screen.getByRole("status")).toHaveTextContent(
      "No matching documents.",
    );
  });

  it("keeps the latest request result when an earlier request resolves last", async () => {
    const requests: Deferred<string>[] = [];
    function Probe() {
      const [key, setKey] = useState("first");
      const data = useLoaded(() => {
        const request = deferred<string>();
        requests.push(request);
        return request.promise;
      }, [key]);
      return (
        <>
          <button onClick={() => setKey("second")}>Reload</button>
          <output>{data.value}</output>
        </>
      );
    }
    render(<Probe />);
    await waitFor(() => expect(requests).toHaveLength(1));
    screen.getByRole("button", { name: "Reload" }).click();
    await waitFor(() => expect(requests).toHaveLength(2));

    requests[1]!.resolve("new");
    await screen.findByText("new");
    requests[0]!.resolve("old");
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("new"),
    );
  });
});
