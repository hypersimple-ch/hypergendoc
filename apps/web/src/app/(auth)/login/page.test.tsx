/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import LoginPage from "./page";

afterEach(cleanup);

describe("LoginPage", () => {
  it("shows the fixed verification success message", async () => {
    render(
      await LoginPage({ searchParams: Promise.resolve({ verified: "true" }) }),
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Email verified. You can now sign in.",
    );
  });

  it("shows a fixed error only for Better Auth's invalid token value", async () => {
    render(
      await LoginPage({
        searchParams: Promise.resolve({ error: "invalid_token" }),
      }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "This verification link is invalid or has expired. Request a new one.",
    );
  });

  it("does not render arbitrary query values", async () => {
    render(
      await LoginPage({
        searchParams: Promise.resolve({ error: "token=private-value" }),
      }),
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("private-value")).not.toBeInTheDocument();
  });
});
