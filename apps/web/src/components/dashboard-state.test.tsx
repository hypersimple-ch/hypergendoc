/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { useLoaded } from "./dashboard-state";

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("useLoaded", () => {
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
