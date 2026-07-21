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
    <section className="control-section" aria-labelledby="color-palette-title">
      <h3 id="color-palette-title">Color palette</h3>
      <div className="color-grid">
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
  const displayName = name.endsWith("color")
    ? name
    : `${name.charAt(0).toUpperCase()}${name.slice(1)} color`;
  const update = (next: string) => {
    const normalized = normalizeHex(next);
    if (normalized) onChange(normalized);
  };

  useEffect(() => {
    if (!open) return;
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

  return (
    <div
      ref={control}
      className="color-control"
      onKeyDown={(event) => event.key === "Escape" && setOpen(false)}
    >
      <span>{displayName}</span>
      <button
        className="color-trigger"
        type="button"
        aria-label={`Edit ${displayName}`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((shown) => !shown)}
      >
        <i aria-hidden="true" style={{ backgroundColor: value }} />
        <span>{value}</span>
      </button>
      {open && (
        <div className="color-popover" id={id}>
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
          <button type="button" onClick={() => setOpen(false)}>
            Close {displayName} picker
          </button>
        </div>
      )}
    </div>
  );
}
