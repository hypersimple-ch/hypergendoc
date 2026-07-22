/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Button, FormField, Input, Status, Table } from "./primitives";
import { Badge } from "./ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "./ui/sheet";

afterEach(cleanup);

describe("shared UI system", () => {
  it("maps product button tones onto the shared component variants", () => {
    render(
      <>
        <Button>Save changes</Button>
        <Button tone="quiet">Cancel</Button>
        <Button tone="danger">Remove</Button>
      </>,
    );

    expect(screen.getByRole("button", { name: "Save changes" })).toHaveClass(
      "button--primary",
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveClass(
      "button--quiet",
    );
    expect(screen.getByRole("button", { name: "Remove" })).toHaveClass(
      "button--danger",
    );
  });

  it("connects field labels, hints, errors, and invalid state", () => {
    render(
      <FormField
        label="Workspace name"
        hint="Shown to members"
        error="Required"
      >
        <Input />
      </FormField>,
    );

    const input = screen.getByRole("textbox", { name: "Workspace name" });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toContain("hint");
    expect(input.getAttribute("aria-describedby")).toContain("error");
    expect(screen.getByRole("alert")).toHaveTextContent("Required");
  });

  it("keeps responsive table labels and semantic status announcements", () => {
    render(
      <>
        <Table caption="Companies" columns={["Company", "Status"]}>
          <tr>
            <td>Northwind</td>
            <td>Active</td>
          </tr>
        </Table>
        <Status kind="success">Ready</Status>
        <Status kind="error">Connection failed</Status>
      </>,
    );

    expect(screen.getByRole("table", { name: "Companies" })).toBeVisible();
    expect(screen.getByText("Northwind")).toHaveAttribute(
      "data-label",
      "Company",
    );
    expect(screen.getByRole("status")).toHaveTextContent("Ready");
    expect(screen.getByRole("alert")).toHaveTextContent("Connection failed");
  });

  it("exposes badge variants without turning labels into live regions", () => {
    render(
      <>
        <Badge variant="neutral">Draft</Badge>
        <Badge variant="accent">Active scope</Badge>
      </>,
    );

    expect(screen.getByText("Draft")).toHaveClass("bg-muted");
    expect(screen.getByText("Active scope")).toHaveClass(
      "text-accent-foreground",
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("opens and closes the shared mobile sheet with labelled controls", async () => {
    render(
      <Sheet>
        <SheetTrigger asChild>
          <button type="button">Open navigation</button>
        </SheetTrigger>
        <SheetContent aria-label="Mobile navigation">
          <a href="/workspace">Overview</a>
        </SheetContent>
      </Sheet>,
    );

    const trigger = screen.getByRole("button", { name: "Open navigation" });
    trigger.focus();
    fireEvent.click(trigger);

    expect(
      await screen.findByRole("dialog", { name: "Mobile navigation" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Close navigation" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Mobile navigation" }),
      ).not.toBeInTheDocument(),
    );
    expect(trigger).toHaveFocus();
  });
});
