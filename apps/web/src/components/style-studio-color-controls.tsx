import { useEffect, useId, useRef, useState } from "react";
import { HexColorInput, HexColorPicker } from "react-colorful";
import type { StyleDefinition } from "@hypergendoc/contracts";
import { colorKeys, normalizeHex } from "./style-studio-definition";

type SetDefinition = React.Dispatch<React.SetStateAction<StyleDefinition>>;

export function ColorControls({
  definition,
  setDefinition,
  savedColors = [],
}: {
  definition: StyleDefinition;
  setDefinition: SetDefinition;
  savedColors?: string[] | undefined;
}) {
  return (
    <section
      className="control-section style-studio__section !rounded-lg !border-border !bg-card !p-4 !shadow-sm"
      aria-labelledby="color-palette-title"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3
            id="color-palette-title"
            className="!mb-1 !font-sans !text-base !font-semibold !normal-case !tracking-normal text-foreground"
          >
            Color palette
          </h3>
          <p className="text-xs font-normal normal-case tracking-normal text-muted-foreground">
            Document colors remain independent from the application interface.
          </p>
        </div>
        <span className="rounded bg-muted px-2 py-1 font-mono text-[10px] uppercase text-muted-foreground">
          Color
        </span>
      </div>
      <div className="color-grid !gap-3">
        {colorKeys.map((key) => (
          <ColorControl
            key={key}
            name={key}
            value={definition.colors[key]}
            savedColors={savedColors}
            onChange={(value) =>
              setDefinition((draft) => ({
                ...draft,
                colors: { ...draft.colors, [key]: value },
                ...(key === "heading" && draft.textStyles
                  ? {
                      textStyles: {
                        ...draft.textStyles,
                        h1: { ...draft.textStyles.h1, color: value },
                        h2: { ...draft.textStyles.h2, color: value },
                        h3: { ...draft.textStyles.h3, color: value },
                        h4: { ...draft.textStyles.h4, color: value },
                        h5: { ...draft.textStyles.h5, color: value },
                        h6: { ...draft.textStyles.h6, color: value },
                      },
                    }
                  : key === "text" && draft.textStyles?.body
                    ? {
                        textStyles: {
                          ...draft.textStyles,
                          body: { ...draft.textStyles.body, color: value },
                        },
                      }
                    : {}),
              }))
            }
          />
        ))}
      </div>
    </section>
  );
}

export function ColorControl({
  name,
  value,
  onChange,
  savedColors = [],
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  savedColors?: string[] | undefined;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const control = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const displayName = name.endsWith("color")
    ? name
    : `${name.charAt(0).toUpperCase()}${name.slice(1)} color`;
  const update = (next: string) => {
    const normalized = normalizeHex(next);
    if (normalized) onChange(normalized);
  };

  useEffect(() => {
    if (!open) return;
    popover.current
      ?.querySelector<HTMLInputElement>(
        `input[aria-label="${displayName} hex"]`,
      )
      ?.focus();
    const closeOutside = (event: PointerEvent | FocusEvent) => {
      if (!control.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("focusin", closeOutside);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("focusin", closeOutside);
    };
  }, [open]);

  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  };

  return (
    <div
      ref={control}
      className="color-control rounded-md border border-border bg-muted/40 p-2.5"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          close();
        }
      }}
    >
      <span>{displayName}</span>
      <button
        ref={trigger}
        className="color-trigger !rounded-md !border-border !bg-card"
        type="button"
        aria-label={`Edit ${displayName}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((shown) => !shown)}
      >
        <i aria-hidden="true" style={{ backgroundColor: value }} />
        <span>{value}</span>
      </button>
      {open && (
        <div
          ref={popover}
          className="color-popover !rounded-lg !border-border !bg-popover !shadow-xl"
          id={id}
          role="dialog"
          aria-label={`${displayName} picker`}
        >
          <div role="group" aria-label={`${displayName} picker`}>
            <HexColorPicker color={value} onChange={update} />
          </div>
          {savedColors.length > 0 && (
            <div
              className="saved-color-swatches"
              role="group"
              aria-label="Saved colors"
            >
              {savedColors.map((color) => (
                <button
                  key={color}
                  type="button"
                  className="saved-color-swatch"
                  aria-label={`Use saved color ${color}`}
                  style={{ backgroundColor: color }}
                  onClick={() => update(color)}
                />
              ))}
            </div>
          )}
          <label>
            {displayName} hex
            <HexColorInput
              color={value}
              onChange={update}
              prefixed
              aria-label={`${displayName} hex`}
            />
          </label>
          <button
            className="mt-2 min-h-9 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-muted"
            type="button"
            onClick={() => close()}
          >
            Close {displayName} picker
          </button>
        </div>
      )}
    </div>
  );
}
