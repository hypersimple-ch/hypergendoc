import { useEffect, useId, useRef, useState } from "react";
import { HexColorInput, HexColorPicker } from "react-colorful";
import type {
  StyleDefinition,
  TextStyleRole,
  TextStyles,
} from "@hypergendoc/contracts";
import {
  colorKeys,
  fonts,
  legacyTextStyles,
  normalizeHex,
  textStyleRoles,
} from "./style-studio-definition";
import { FormField, Input, Select } from "./primitives";

type SetDefinition = React.Dispatch<React.SetStateAction<StyleDefinition>>;

export function TypographyControls({
  definition,
  setDefinition,
  updateNumber,
}: {
  definition: StyleDefinition;
  setDefinition: SetDefinition;
  updateNumber: (key: "bodySizePt" | "headingScale", value: string) => void;
}) {
  const [role, setRole] = useState<TextStyleRole>("h1");
  const textStyles = definition.textStyles ?? legacyTextStyles(definition);
  const style = textStyles[role];
  const updateRole = (change: Partial<TextStyles[TextStyleRole]>) =>
    setDefinition((draft) => {
      const styles = draft.textStyles ?? legacyTextStyles(draft);
      return {
        ...draft,
        textStyles: { ...styles, [role]: { ...styles[role], ...change } },
      };
    });

  return (
    <section className="control-section" aria-labelledby="typography-title">
      <h3 id="typography-title">Typography</h3>
      <fieldset className="font-group">
        <legend>Body font</legend>
        <div className="font-grid">
          {fonts.map((font) => {
            const selected = definition.bodyFont === font;
            return (
              <label
                className={`font-option${selected ? " font-option--selected" : ""}`}
                key={font}
                style={{ fontFamily: font }}
              >
                <input
                  type="radio"
                  name="bodyFont"
                  value={font}
                  checked={selected}
                  aria-label={`Body font ${font}`}
                  onChange={() =>
                    setDefinition((draft) => ({ ...draft, bodyFont: font }))
                  }
                />
                <span>{font}</span>
                <b>Aa</b>
              </label>
            );
          })}
        </div>
      </fieldset>
      <Range
        label="Body size"
        value={definition.bodySizePt}
        min={8}
        max={16}
        step={0.5}
        unit="pt"
        onChange={(value) => updateNumber("bodySizePt", value)}
      />
      <div className="role-editor" aria-labelledby="text-role-title">
        <h4 id="text-role-title">Text roles</h4>
        <div className="role-tabs" role="group" aria-label="Text role">
          {textStyleRoles.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={role === item.value}
              onClick={() => setRole(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <FormField label="Font family">
          <Select
            value={style.fontFamily}
            onValueChange={(fontFamily) =>
              updateRole({
                fontFamily: fontFamily as StyleDefinition["bodyFont"],
              })
            }
            options={fonts.map((font) => ({ value: font, label: font }))}
            placeholder="Choose a font"
            aria-label="Font family"
          />
        </FormField>
        <Range
          label="Font size"
          value={style.fontSizePt}
          min={6}
          max={72}
          step={1}
          unit="pt"
          onChange={(fontSizePt) =>
            updateRole({ fontSizePt: Number(fontSizePt) })
          }
        />
        <FormField label="Weight">
          <Select
            value={String(style.fontWeight)}
            onValueChange={(fontWeight) =>
              updateRole({
                fontWeight: Number(fontWeight) as 400 | 500 | 600 | 700,
              })
            }
            options={[400, 500, 600, 700].map((weight) => ({
              value: String(weight),
              label: String(weight),
            }))}
            placeholder="Choose a weight"
            aria-label="Weight"
          />
        </FormField>
        <Range
          label="Line height"
          value={style.lineHeight}
          min={1}
          max={2}
          step={0.05}
          unit=""
          onChange={(lineHeight) =>
            updateRole({ lineHeight: Number(lineHeight) })
          }
        />
        <ColorControl
          name={`${textStyleRoles.find((item) => item.value === role)?.label} color`}
          value={style.color}
          onChange={(color) => updateRole({ color })}
        />
      </div>
      <fieldset className="segmented-control">
        <legend>Italic style</legend>
        {(["italic", "oblique"] as const).map((value) => (
          <label key={value}>
            <input
              type="radio"
              name="italicStyle"
              checked={definition.italicStyle === value}
              onChange={() =>
                setDefinition((draft) => ({ ...draft, italicStyle: value }))
              }
            />
            {value}
          </label>
        ))}
      </fieldset>
    </section>
  );
}

function Range({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="range-control">
      <span>
        {label}
        <output>
          {value}
          {unit}
        </output>
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function ColorControls({
  definition,
  setDefinition,
}: {
  definition: StyleDefinition;
  setDefinition: SetDefinition;
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
                  : {}),
              }))
            }
          />
        ))}
      </div>
    </section>
  );
}

function ColorControl({
  name,
  value,
  onChange,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
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

export function PageControls({
  definition,
  setDefinition,
}: {
  definition: StyleDefinition;
  setDefinition: SetDefinition;
}) {
  const margins = [
    ["marginTopMm", "Top"],
    ["marginRightMm", "Right"],
    ["marginBottomMm", "Bottom"],
    ["marginLeftMm", "Left"],
  ] as const;
  return (
    <section className="control-section" aria-labelledby="page-layout-title">
      <h3 id="page-layout-title">Page layout</h3>
      <fieldset className="segmented-control">
        <legend>Page size</legend>
        {(["A4", "LETTER"] as const).map((size) => (
          <label key={size}>
            <input
              type="radio"
              name="page-size"
              checked={definition.page.size === size}
              onChange={() =>
                setDefinition((draft) => ({
                  ...draft,
                  page: { ...draft.page, size },
                }))
              }
            />
            {size}
          </label>
        ))}
      </fieldset>
      <div className="margin-grid">
        {margins.map(([key, label]) => (
          <label key={key}>
            {label}{" "}
            <Input
              type="number"
              min="0"
              max="80"
              value={definition.page[key]}
              onChange={(event) =>
                setDefinition((draft) => ({
                  ...draft,
                  page: { ...draft.page, [key]: Number(event.target.value) },
                }))
              }
            />
            <small>mm</small>
          </label>
        ))}
      </div>
    </section>
  );
}

export function BrandControls({
  definition,
  setDefinition,
}: {
  definition: StyleDefinition;
  setDefinition: SetDefinition;
}) {
  return (
    <>
      <section className="control-section" aria-labelledby="brand-assets-title">
        <h3 id="brand-assets-title">Brand assets</h3>
        <FormField label="Logo object ID">
          <Input
            value={definition.logoObjectId ?? ""}
            placeholder="Optional uploaded logo ID"
            onChange={(event) =>
              setDefinition((draft) => ({
                ...draft,
                logoObjectId: event.target.value || null,
              }))
            }
          />
        </FormField>
      </section>
      <HeaderFooterControls
        label="Header"
        value={definition.header}
        onChange={(header) => setDefinition((draft) => ({ ...draft, header }))}
      />
    </>
  );
}

export function HeaderFooterControls({
  label,
  value,
  onChange,
}: {
  label: "Header" | "Footer";
  value: StyleDefinition["header"];
  onChange: (value: StyleDefinition["header"]) => void;
}) {
  return (
    <section
      className="control-section"
      aria-labelledby={`${label.toLowerCase()}-controls-title`}
    >
      <h3 id={`${label.toLowerCase()}-controls-title`}>{label}</h3>
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(event) =>
            onChange({ ...value, enabled: event.target.checked })
          }
        />
        Enable {label.toLowerCase()}
      </label>
      {(["leftText", "centerText", "rightText"] as const).map((key) => (
        <FormField
          key={key}
          label={`${label} ${key.replace("Text", " text").replace(/^./, (letter) => letter.toUpperCase())}`}
        >
          <Input
            value={value[key]}
            maxLength={120}
            onChange={(event) =>
              onChange({ ...value, [key]: event.target.value })
            }
          />
        </FormField>
      ))}
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={value.showPageNumber}
          onChange={(event) =>
            onChange({ ...value, showPageNumber: event.target.checked })
          }
        />
        Show page number
      </label>
    </section>
  );
}
