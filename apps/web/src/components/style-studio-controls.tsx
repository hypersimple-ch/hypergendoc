import { useState } from "react";
import type {
  CompanyAssets,
  StyleDefinition,
  TextStyleRole,
  TextStyles,
} from "@hypergendoc/contracts";
import {
  fonts,
  resolveTextStyles,
  textStyleRoles,
} from "./style-studio-definition";
import { FontPicker } from "./font-picker";
import { FormField, Input, Select, Status } from "./primitives";
import { dashboardApi } from "../lib/dashboard-api";
import { safeError } from "./dashboard-state";
import { ColorControl } from "./style-studio-color-controls";
import { NumberField, Range } from "./style-studio-number-controls";

type SetDefinition = React.Dispatch<React.SetStateAction<StyleDefinition>>;

export function TypographyControls({
  definition,
  setDefinition,
  assets,
  companyId,
  onAssetsChanged,
}: {
  definition: StyleDefinition;
  setDefinition: SetDefinition;
  assets?: CompanyAssets | undefined;
  companyId: string;
  onAssetsChanged: () => Promise<unknown>;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string>();
  const catalogFonts = assets?.fonts ?? [];
  const fontOptions = [
    ...fonts.map(
      (id) =>
        catalogFonts.find((font) => font.id === id) ?? {
          id,
          source: "built_in" as const,
          familyName: id,
          subfamilyName: null,
          displayName: id,
          owned: false,
          contentUrl: null,
        },
    ),
    ...catalogFonts.filter((font) => font.source === "uploaded"),
  ];
  const uploadFont = async (file?: File) => {
    if (!file || uploading) return;
    setUploading(true);
    setUploadError(undefined);
    try {
      await dashboardApi.uploadFont(companyId, file);
      await onAssetsChanged();
    } catch (reason) {
      setUploadError(safeError(reason));
    } finally {
      setUploading(false);
    }
  };
  const [role, setRole] = useState<TextStyleRole>("body");
  const textStyles = resolveTextStyles(definition);
  const style = textStyles[role];
  const updateRole = (
    change: Partial<NonNullable<TextStyles[TextStyleRole]>>,
  ) =>
    setDefinition((draft) => {
      const styles = resolveTextStyles(draft);
      const next = { ...styles[role], ...change };
      return {
        ...draft,
        textStyles: { ...styles, [role]: next },
        ...(role === "body"
          ? {
              bodyFont: next.fontFamily,
              bodySizePt: next.fontSizePt,
              colors: { ...draft.colors, text: next.color },
            }
          : {}),
      };
    });

  return (
    <section className="control-section" aria-labelledby="typography-title">
      <h3 id="typography-title">Typography</h3>
      <FormField label="Upload company font">
        <Input
          type="file"
          accept=".ttf,.otf,.woff2,font/ttf,font/otf,font/woff2"
          disabled={uploading}
          onChange={(event) => void uploadFont(event.target.files?.[0])}
        />
      </FormField>
      {uploadError && <Status kind="error">{uploadError}</Status>}
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
          <FontPicker
            value={style.fontFamily}
            onValueChange={(fontFamily) => updateRole({ fontFamily })}
            options={fontOptions.map((font) => ({
              value: font.id,
              label: font.displayName,
            }))}
          />
        </FormField>
        <Range
          label="Font size"
          value={style.fontSizePt}
          min={role === "body" ? 8 : 6}
          max={role === "body" ? 16 : 72}
          step={role === "body" ? 0.5 : 1}
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
      <div
        className="segmented-control segmented-control--titled"
        role="radiogroup"
        aria-label="Italic style"
      >
        <span className="segmented-control__title">Italic style</span>
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
      </div>
    </section>
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
    </section>
  );
}

export function BrandControls({
  definition,
  setDefinition,
  assets,
  companyId,
  onAssetsChanged,
}: {
  definition: StyleDefinition;
  setDefinition: SetDefinition;
  assets?: CompanyAssets | undefined;
  companyId: string;
  onAssetsChanged: () => Promise<unknown>;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string>();
  const uploadLogo = async (file?: File) => {
    if (!file || uploading) return;
    setUploading(true);
    setUploadError(undefined);
    try {
      await dashboardApi.uploadLogo(companyId, file);
      await onAssetsChanged();
    } catch (reason) {
      setUploadError(safeError(reason));
    } finally {
      setUploading(false);
    }
  };
  return (
    <>
      <section className="control-section" aria-labelledby="brand-assets-title">
        <h3 id="brand-assets-title">Brand assets</h3>
        <div
          className="logo-selector"
          role="radiogroup"
          aria-label="Company logo"
        >
          <button
            type="button"
            role="radio"
            aria-checked={!definition.logoObjectId}
            className={
              !definition.logoObjectId
                ? "logo-option logo-option--selected"
                : "logo-option"
            }
            onClick={() =>
              setDefinition((draft) => ({ ...draft, logoObjectId: null }))
            }
          >
            None
          </button>
          {assets?.logos.map((logo) => (
            <button
              type="button"
              role="radio"
              aria-checked={definition.logoObjectId === logo.id}
              className={
                definition.logoObjectId === logo.id
                  ? "logo-option logo-option--selected"
                  : "logo-option"
              }
              key={logo.id}
              onClick={() =>
                setDefinition((draft) => ({ ...draft, logoObjectId: logo.id }))
              }
            >
              <img
                src={logo.contentUrl}
                alt={logo.displayName ?? "Company logo"}
              />
            </button>
          ))}
        </div>
        <FormField label="Upload company logo">
          <Input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={uploading}
            onChange={(event) => void uploadLogo(event.target.files?.[0])}
          />
        </FormField>
        {uploadError && <Status kind="error">{uploadError}</Status>}
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
