import { useId, useState } from "react";
import { HexColorInput, HexColorPicker } from "react-colorful";
import type { StyleDefinition } from "@hypergendoc/contracts";
import {
  colorKeys,
  fonts,
  normalizeHex,
  type ColorKey,
} from "./style-studio-definition";
import { FormField, Input } from "./primitives";

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
  return (
    <fieldset className="control-section">
      <legend>Typography</legend>
      <div className="font-grid">
        {(["bodyFont", "headingFont"] as const).flatMap((kind) =>
          fonts.map((font) => {
            const selected = definition[kind] === font;
            const label = `${kind === "bodyFont" ? "Body" : "Heading"} font ${font}`;
            return (
              <label
                className={`font-option${selected ? " font-option--selected" : ""}`}
                key={`${kind}-${font}`}
                style={{ fontFamily: font }}
              >
                <input
                  type="radio"
                  name={kind}
                  value={font}
                  checked={selected}
                  aria-label={label}
                  onChange={() =>
                    setDefinition((draft) => ({ ...draft, [kind]: font }))
                  }
                />
                <span>{label}</span>
                <b>Aa</b>
              </label>
            );
          }),
        )}
      </div>
      <Range
        label="Body size"
        value={definition.bodySizePt}
        min={8}
        max={16}
        step={0.5}
        unit="pt"
        onChange={(value) => updateNumber("bodySizePt", value)}
      />
      <Range
        label="Heading scale"
        value={definition.headingScale}
        min={1.05}
        max={2.5}
        step={0.05}
        unit="×"
        onChange={(value) => updateNumber("headingScale", value)}
      />
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
    </fieldset>
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
    <fieldset className="control-section">
      <legend>Color palette</legend>
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
              }))
            }
          />
        ))}
      </div>
    </fieldset>
  );
}

function ColorControl({
  name,
  value,
  onChange,
}: {
  name: ColorKey;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const displayName = `${name.charAt(0).toUpperCase()}${name.slice(1)} color`;
  const update = (next: string) => {
    const normalized = normalizeHex(next);
    if (normalized) onChange(normalized);
  };

  return (
    <div
      className="color-control"
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
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
    <fieldset className="control-section">
      <legend>Page layout</legend>
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
    </fieldset>
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
      <fieldset className="control-section">
        <legend>Brand/header</legend>
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
      </fieldset>
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
    <fieldset className="control-section">
      <legend>{label}</legend>
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
          label={`${label} ${key
            .replace("Text", " text")
            .replace(/^./, (letter) => letter.toUpperCase())}`}
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
    </fieldset>
  );
}
