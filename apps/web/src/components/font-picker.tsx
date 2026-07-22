import { useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import type { StyleDefinition } from "@hypergendoc/contracts";
import { fontGroups } from "./style-studio-definition";

type Font = StyleDefinition["bodyFont"];
type FontOption = { value: Font; label: string };

export function FontPicker({
  value,
  onValueChange,
  id,
  options = [],
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: {
  value: Font;
  onValueChange: (value: Font) => void;
  id?: string;
  options?: readonly FontOption[];
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const normalizedQuery = query.trim().toLowerCase();
  const groups = fontGroups
    .map((group) => ({
      ...group,
      fonts: group.fonts.filter((font) =>
        font.toLowerCase().includes(normalizedQuery),
      ),
    }))
    .filter((group) => group.fonts.length > 0);
  const builtInFonts = new Set<string>(
    fontGroups.flatMap((group) => group.fonts),
  );
  const companyFonts = options.filter(
    (option) =>
      !builtInFonts.has(option.value) &&
      option.label.toLowerCase().includes(normalizedQuery),
  );

  const moveOptionFocus = (direction: 1 | -1 | "start" | "end") => {
    const options = Array.from(
      content.current?.querySelectorAll<HTMLButtonElement>(
        ".font-picker-option",
      ) ?? [],
    );
    if (!options.length) return;
    const current = options.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    const next =
      direction === "start"
        ? 0
        : direction === "end"
          ? options.length - 1
          : (current + direction + options.length) % options.length;
    options[next]?.focus();
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setQuery("");
      }}
    >
      <Popover.Trigger
        id={id}
        className="font-picker-trigger"
        type="button"
        aria-label={`Font family: ${value}`}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span style={{ fontFamily: value }}>{value}</span>
        <span aria-hidden="true">⌄</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          ref={content}
          className="font-picker-content"
          role="dialog"
          aria-label="Font family options"
          side="bottom"
          align="start"
          collisionPadding={16}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            search.current?.focus();
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              moveOptionFocus(1);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              moveOptionFocus(-1);
            } else if (event.key === "Home") {
              event.preventDefault();
              moveOptionFocus("start");
            } else if (event.key === "End") {
              event.preventDefault();
              moveOptionFocus("end");
            } else if (
              (event.key === "Enter" || event.key === " ") &&
              event.target instanceof HTMLButtonElement &&
              event.target.classList.contains("font-picker-option")
            ) {
              event.preventDefault();
              event.target.click();
            }
          }}
        >
          <label className="font-picker-search">
            <span>Search fonts</span>
            <input
              ref={search}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search fonts"
            />
          </label>
          <div className="font-picker-options">
            {groups.length || companyFonts.length ? (
              <>
                {companyFonts.length > 0 && (
                  <section aria-label="Company fonts">
                    <h5>Company fonts</h5>
                    {companyFonts.map((font) => (
                      <button
                        key={font.value}
                        className="font-picker-option"
                        type="button"
                        aria-pressed={font.value === value}
                        onClick={() => {
                          onValueChange(font.value);
                          setOpen(false);
                        }}
                      >
                        <span>{font.label}</span>
                        <b aria-hidden="true">Aa</b>
                      </button>
                    ))}
                  </section>
                )}
                {groups.map((group) => (
                  <section
                    key={group.label}
                    aria-label={`${group.label} fonts`}
                  >
                    <h5>{group.label}</h5>
                    {group.fonts.map((font) => (
                      <button
                        key={font}
                        className="font-picker-option"
                        type="button"
                        aria-pressed={font === value}
                        style={{ fontFamily: font }}
                        onClick={() => {
                          onValueChange(font);
                          setOpen(false);
                        }}
                      >
                        <span>{font}</span>
                        <b aria-hidden="true">Aa</b>
                      </button>
                    ))}
                  </section>
                ))}
              </>
            ) : (
              <p className="font-picker-empty" role="status">
                No fonts found.
              </p>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
