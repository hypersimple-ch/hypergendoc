import type { StyleDefinition } from "@hypergendoc/contracts";
import { NumberField } from "./style-studio-number-controls";

type SetDefinition = React.Dispatch<React.SetStateAction<StyleDefinition>>;

const marginPresets = [
  { label: "Compact", marginMm: 12 },
  { label: "Standard", marginMm: 20 },
  { label: "Spacious", marginMm: 28 },
] as const;

const printPresets = [
  { label: "A4 Standard", size: "A4", marginMm: 20 },
  { label: "A4 Narrow", size: "A4", marginMm: 12 },
  { label: "Letter Standard", size: "LETTER", marginMm: 25.4 },
  { label: "Letter Narrow", size: "LETTER", marginMm: 12.7 },
] as const;

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
  const applyPreset = (
    marginMm: number,
    size?: StyleDefinition["page"]["size"],
  ) =>
    setDefinition((draft) => ({
      ...draft,
      page: {
        ...draft.page,
        ...(size ? { size } : {}),
        marginTopMm: marginMm,
        marginRightMm: marginMm,
        marginBottomMm: marginMm,
        marginLeftMm: marginMm,
      },
    }));

  return (
    <section
      className="control-section style-studio__section !rounded-lg !border-border !bg-card !p-4 !shadow-sm"
      aria-labelledby="page-layout-title"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3
            id="page-layout-title"
            className="!mb-1 !font-sans !text-base !font-semibold !normal-case !tracking-normal text-foreground"
          >
            Page layout
          </h3>
          <p className="text-xs font-normal normal-case tracking-normal text-muted-foreground">
            Choose the format and print-safe margins.
          </p>
        </div>
        <span className="rounded bg-muted px-2 py-1 font-mono text-[10px] uppercase text-muted-foreground">
          Layout
        </span>
      </div>
      <div className="page-layout-stack">
        <div
          className="segmented-control segmented-control--titled"
          role="radiogroup"
          aria-label="Page size"
        >
          <span className="segmented-control__title">Page size</span>
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
        </div>
        <PresetControls
          label="Margin presets"
          presets={marginPresets}
          onSelect={(preset) => applyPreset(preset.marginMm)}
        />
        <PresetControls
          label="Print standards"
          presets={printPresets}
          onSelect={(preset) => applyPreset(preset.marginMm, preset.size)}
        />
        <div className="margin-grid">
          {margins.map(([key, label]) => (
            <label key={key}>
              {label}{" "}
              <NumberField
                label={`${label} margin`}
                value={definition.page[key]}
                min={0}
                max={80}
                step={1}
                unit="mm"
                onChange={(value) =>
                  setDefinition((draft) => ({
                    ...draft,
                    page: { ...draft.page, [key]: Number(value) },
                  }))
                }
              />
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}

function PresetControls<T extends { label: string }>({
  label,
  presets,
  onSelect,
}: {
  label: string;
  presets: readonly T[];
  onSelect: (preset: T) => void;
}) {
  return (
    <div className="layout-presets" role="group" aria-label={label}>
      <span className="layout-presets__title">{label}</span>
      {presets.map((preset) => (
        <button
          key={preset.label}
          className="layout-presets__option"
          type="button"
          onClick={() => onSelect(preset)}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}
